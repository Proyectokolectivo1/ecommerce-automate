// ============================================================
// alert-evaluators.ts — Rule-based alert evaluators
// ============================================================
// Cinco evaluadores que escanean la BD en busca de condiciones
// anómalas y devuelven `AlertCondition[]`. Estas condiciones luego
// son deduplicadas y persistidas por `alert.service.ts`.
//
// Reglas (sección 13 del diseño):
//   1. COD_UNPAID     — pedidos COD pendientes de pago > 24h.
//   2. GUIDE_ERROR    — pedidos ENVIADO sin guía (Shipment).
//   3. HIGH_RETURN    — tasa de devolución global > 15%.
//   4. LOW_INVENTORY  — productos con inventario < 10 uds.
//   5. SALES_DROP     — caída de revenue > 30% (sem vs sem previa).
//
// `evaluateAllAlerts` las ejecuta en paralelo con Promise.allSettled
// para que un fallo en una no afecte a las demás.

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import type { AlertSeverity, AlertType } from '@/lib/validation'

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export interface AlertCondition {
  type: AlertType
  severity: AlertSeverity
  entity: string | null // orderId, productId, etc.
  message: string
  metadata?: Record<string, unknown> | null
}

export interface AlertEvaluatorResult {
  name: string
  type: AlertType
  status: 'fulfilled' | 'rejected'
  conditions: AlertCondition[]
  error?: string
  durationMs: number
}

export interface EvaluateAllResult {
  conditions: AlertCondition[]
  results: AlertEvaluatorResult[]
}

export type AlertEvaluator = {
  name: string
  type: AlertType
  run: () => Promise<AlertCondition[]>
}

// ------------------------------------------------------------
// Thresholds (exportados para tuning / tests)
// ------------------------------------------------------------

export const ALERT_THRESHOLDS = {
  COD_UNPAID_HOURS: 24,
  LOW_INVENTORY_UNITS: 10,
  HIGH_RETURN_RATE_PCT: 15,
  SALES_DROP_PCT: 30,
  SALES_DROP_WINDOW_DAYS: 7,
} as const

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function toYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// ------------------------------------------------------------
// Evaluator 1: COD_UNPAID
// ------------------------------------------------------------

async function evaluateCodUnpaid(): Promise<AlertCondition[]> {
  const cutoff = new Date()
  cutoff.setHours(cutoff.getHours() - ALERT_THRESHOLDS.COD_UNPAID_HOURS)

  const orders = await db.order.findMany({
    where: {
      paymentMethod: 'COD',
      codPaid: false,
      status: { in: ['PENDIENTE_PAGO_TRANSPORTE'] },
      placedAt: { lt: cutoff },
    },
    select: {
      id: true,
      orderNumber: true,
      placedAt: true,
      total: true,
      transportCost: true,
    },
    take: 100,
  })

  return orders.map((o) => {
    const ageH = Math.round((Date.now() - o.placedAt.getTime()) / 3_600_000)
    return {
      type: 'COD_UNPAID' as AlertType,
      severity: 'WARNING' as AlertSeverity,
      entity: o.id,
      message: `Pedido ${o.orderNumber} (COD) sin pago de transporte hace ${ageH}h.`,
      metadata: {
        orderNumber: o.orderNumber,
        ageHours: ageH,
        total: o.total,
        transportCost: o.transportCost,
        placedAt: o.placedAt.toISOString(),
      },
    }
  })
}

// ------------------------------------------------------------
// Evaluator 2: GUIDE_ERROR (ENVIADO sin guía)
// ------------------------------------------------------------

async function evaluateGuideError(): Promise<AlertCondition[]> {
  // Pedidos en ENVIADO sin ninguna guía asociada o con guideNumber null.
  const orders = await db.order.findMany({
    where: {
      status: 'ENVIADO',
      shipments: { none: {} },
    },
    select: {
      id: true,
      orderNumber: true,
      shippedAt: true,
    },
    take: 100,
  })

  // También incluye pedidos ENVIADO con Shipment pero sin guideNumber.
  const partial = await db.order.findMany({
    where: {
      status: 'ENVIADO',
      shipments: { some: { guideNumber: null } },
    },
    select: {
      id: true,
      orderNumber: true,
      shippedAt: true,
    },
    take: 100,
  })

  const seen = new Set<string>()
  const out: AlertCondition[] = []
  for (const o of [...orders, ...partial]) {
    if (seen.has(o.id)) continue
    seen.add(o.id)
    out.push({
      type: 'GUIDE_ERROR' as AlertType,
      severity: 'CRITICAL' as AlertSeverity,
      entity: o.id,
      message: `Pedido ${o.orderNumber} marcado como ENVIADO sin guía de transportadora.`,
      metadata: {
        orderNumber: o.orderNumber,
        shippedAt: o.shippedAt?.toISOString() ?? null,
        hasShipment: partial.some((p) => p.id === o.id),
      },
    })
  }
  return out
}

// ------------------------------------------------------------
// Evaluator 3: HIGH_RETURN (>15% global)
// ------------------------------------------------------------

async function evaluateHighReturn(): Promise<AlertCondition[]> {
  const [returnsCount, totalOrders] = await Promise.all([
    db.return.count(),
    db.order.count(),
  ])
  if (totalOrders === 0) return []
  const rate = round2((returnsCount / totalOrders) * 100)
  if (rate <= ALERT_THRESHOLDS.HIGH_RETURN_RATE_PCT) return []

  return [
    {
      type: 'HIGH_RETURN' as AlertType,
      severity: 'CRITICAL' as AlertSeverity,
      entity: null,
      message: `Tasa de devolución global ${rate}% supera el umbral ${ALERT_THRESHOLDS.HIGH_RETURN_RATE_PCT}%.`,
      metadata: {
        returnsCount,
        totalOrders,
        rate,
        threshold: ALERT_THRESHOLDS.HIGH_RETURN_RATE_PCT,
      },
    },
  ]
}

// ------------------------------------------------------------
// Evaluator 4: LOW_INVENTORY (<10 uds)
// ------------------------------------------------------------

async function evaluateLowInventory(): Promise<AlertCondition[]> {
  const products = await db.product.findMany({
    where: {
      active: true,
      inventoryQty: { lt: ALERT_THRESHOLDS.LOW_INVENTORY_UNITS },
    },
    select: {
      id: true,
      title: true,
      sku: true,
      inventoryQty: true,
      price: true,
    },
    take: 100,
  })

  return products.map((p) => ({
    type: 'LOW_INVENTORY' as AlertType,
    severity: p.inventoryQty === 0 ? ('CRITICAL' as AlertSeverity) : ('WARNING' as AlertSeverity),
    entity: p.id,
    message: `Producto "${p.title}" con inventario crítico: ${p.inventoryQty} uds.`,
    metadata: {
      title: p.title,
      sku: p.sku,
      inventoryQty: p.inventoryQty,
      price: p.price,
      threshold: ALERT_THRESHOLDS.LOW_INVENTORY_UNITS,
    },
  }))
}

// ------------------------------------------------------------
// Evaluator 5: SALES_DROP (>30% sem vs sem)
// ------------------------------------------------------------

async function evaluateSalesDrop(): Promise<AlertCondition[]> {
  const window = ALERT_THRESHOLDS.SALES_DROP_WINDOW_DAYS
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const thisWeekStart = new Date(today)
  thisWeekStart.setDate(today.getDate() - (window - 1))
  const lastWeekStart = new Date(today)
  lastWeekStart.setDate(today.getDate() - (window * 2 - 1))
  const lastWeekEnd = new Date(today)
  lastWeekEnd.setDate(today.getDate() - window)

  const [currentAgg, previousAgg] = await Promise.all([
    db.order.aggregate({
      where: {
        status: { notIn: ['CANCELADO', 'DEVUELTO'] },
        placedAt: { gte: thisWeekStart, lte: today },
      },
      _sum: { total: true },
    }),
    db.order.aggregate({
      where: {
        status: { notIn: ['CANCELADO', 'DEVUELTO'] },
        placedAt: { gte: lastWeekStart, lte: lastWeekEnd },
      },
      _sum: { total: true },
    }),
  ])

  const current = currentAgg._sum.total ?? 0
  const previous = previousAgg._sum.total ?? 0

  // Si la semana anterior fue 0, no podemos calcular % drop.
  if (previous <= 0) return []

  const dropPct = round2(((previous - current) / previous) * 100)
  if (dropPct < ALERT_THRESHOLDS.SALES_DROP_PCT) return []

  return [
    {
      type: 'SALES_DROP' as AlertType,
      severity: 'CRITICAL' as AlertSeverity,
      entity: null,
      message: `Caída de ventas ${dropPct}% esta semana vs semana anterior (supera ${ALERT_THRESHOLDS.SALES_DROP_PCT}%).`,
      metadata: {
        currentWeekTotal: round2(current),
        previousWeekTotal: round2(previous),
        dropPct,
        threshold: ALERT_THRESHOLDS.SALES_DROP_PCT,
        windowDays: window,
        currentWeekStart: toYMD(thisWeekStart),
        previousWeekStart: toYMD(lastWeekStart),
        previousWeekEnd: toYMD(lastWeekEnd),
      },
    },
  ]
}

// ------------------------------------------------------------
// Registry
// ------------------------------------------------------------

export const ALERT_EVALUATORS: AlertEvaluator[] = [
  { name: 'cod-unpaid', type: 'COD_UNPAID', run: evaluateCodUnpaid },
  { name: 'guide-error', type: 'GUIDE_ERROR', run: evaluateGuideError },
  { name: 'high-return', type: 'HIGH_RETURN', run: evaluateHighReturn },
  { name: 'low-inventory', type: 'LOW_INVENTORY', run: evaluateLowInventory },
  { name: 'sales-drop', type: 'SALES_DROP', run: evaluateSalesDrop },
]

// ------------------------------------------------------------
// Runner
// ------------------------------------------------------------

/**
 * Ejecuta todos los evaluadores en paralelo con Promise.allSettled.
 * Devuelve todas las condiciones (flattened) y un resultado por
 * evaluador para diagnóstico.
 */
export async function evaluateAllAlerts(): Promise<EvaluateAllResult> {
  const settled = await Promise.allSettled(
    ALERT_EVALUATORS.map(async (ev) => {
      const start = Date.now()
      const conditions = await ev.run()
      return {
        name: ev.name,
        type: ev.type,
        conditions,
        durationMs: Date.now() - start,
      }
    }),
  )

  const results: AlertEvaluatorResult[] = []
  const conditions: AlertCondition[] = []

  for (let i = 0; i < settled.length; i++) {
    const s = settled[i]
    const ev = ALERT_EVALUATORS[i]
    if (s.status === 'fulfilled') {
      results.push({
        name: s.value.name,
        type: s.value.type,
        status: 'fulfilled',
        conditions: s.value.conditions,
        durationMs: s.value.durationMs,
      })
      conditions.push(...s.value.conditions)
    } else {
      const err =
        s.reason instanceof Error ? s.reason.message : String(s.reason)
      logger.warn('alert.evaluator-failed', { name: ev.name, error: err })
      results.push({
        name: ev.name,
        type: ev.type,
        status: 'rejected',
        conditions: [],
        error: err,
        durationMs: 0,
      })
    }
  }

  logger.info('alert.evaluateAll done', {
    evaluators: results.length,
    conditions: conditions.length,
    rejected: results.filter((r) => r.status === 'rejected').length,
  })

  return { conditions, results }
}
