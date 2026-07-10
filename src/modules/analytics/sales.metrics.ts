// ============================================================
// sales.metrics.ts — Server-side analytics & KPI functions
// ============================================================
// Todas las funciones usan `db` (Prisma) y son server-side puras.
// Consumidas por:
//   - `GET /api/analytics` (cache TTL 60s)
//   - `src/app/(dashboard)/dashboard/page.tsx` (server component)
//
// Reglas de negocio:
//   - Ventas: solo pedidos NO cancelados y NO devueltos.
//   - Rentabilidad: costs tomados de CostEntry del último mes + costo
//     de producto de OrderItem para pedidos entregados/enviados.
//   - Devoluciones: tasa = devoluciones / total pedidos * 100.

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import {
  ORDER_STATE_LABELS,
  ORDER_STATES,
} from '@/modules/orders/state-machine'
import type { OrderStatus } from '@/modules/orders/types'

// ------------------------------------------------------------
// Tipos
// ------------------------------------------------------------

export type Period = 'day' | 'week' | 'month' | 'year'

export interface SalesKPIs {
  total: number
  count: number
  avgTicket: number
}

export interface SalesTrendPoint {
  date: string // YYYY-MM-DD
  label: string // dd/MM
  total: number
  count: number
}

export interface OrdersByStatusPoint {
  status: OrderStatus
  label: string
  count: number
  color: string
}

export interface PaymentMethodBreakdown {
  prepaid: { count: number; total: number }
  cod: { count: number; total: number }
}

export interface TopProduct {
  id: string
  title: string
  sku: string | null
  quantity: number
  revenue: number
  profit: number
  margin: number
}

export interface ReturnsMetrics {
  count: number
  rate: number
  lostValue: number
  topProduct: string | null
  topCity: string | null
}

export interface Profitability {
  revenue: number
  costs: {
    product: number
    shipping: number
    advertising: number
    operation: number
    total: number
  }
  grossProfit: number
  netProfit: number
  margin: number
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/** Estados excluidos de las métricas de venta. */
const EXCLUDED_SALES_STATUSES: OrderStatus[] = ['CANCELADO', 'DEVUELTO']

/** Estados que cuentan como "ventas efectivas" para costo de producto. */
const DELIVERED_LIKE_STATUSES: OrderStatus[] = ['ENTREGADO', 'ENVIADO']

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Devuelve el inicio (00:00:00.000) del rango correspondiente al periodo.
 * - day   → hoy
 * - week  → hace 7 días
 * - month → hace 30 días
 * - year  → hace 365 días
 */
function periodStart(period: Period): Date {
  const now = new Date()
  const start = new Date(now)
  switch (period) {
    case 'day':
      start.setHours(0, 0, 0, 0)
      break
    case 'week':
      start.setDate(now.getDate() - 7)
      break
    case 'month':
      start.setDate(now.getDate() - 30)
      break
    case 'year':
      start.setFullYear(now.getFullYear() - 1)
      break
  }
  return start
}

/** Formatea una fecha como YYYY-MM-DD (local). */
function toYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Formatea una fecha como dd/MM. */
function toLabel(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${day}/${m}`
}

// ------------------------------------------------------------
// KPIs de ventas por periodo
// ------------------------------------------------------------

export async function getSalesKPIs(period: Period): Promise<SalesKPIs> {
  const start = periodStart(period)
  try {
    const rows = await db.order.aggregate({
      where: {
        status: { notIn: EXCLUDED_SALES_STATUSES },
        placedAt: { gte: start },
      },
      _sum: { total: true },
      _count: true,
    })
    const total = round2(rows._sum.total ?? 0)
    const count = rows._count
    const avgTicket = count > 0 ? round2(total / count) : 0
    return { total, count, avgTicket }
  } catch (err) {
    logger.error('analytics.getSalesKPIs error', {
      period,
      error: err instanceof Error ? err.message : String(err),
    })
    return { total: 0, count: 0, avgTicket: 0 }
  }
}

// ------------------------------------------------------------
// Tendencia de ventas (últimos N días)
// ------------------------------------------------------------

export async function getSalesTrend(days: number): Promise<SalesTrendPoint[]> {
  const safeDays = Math.min(Math.max(days, 1), 90)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Generamos la lista de días esperada.
  const expected: SalesTrendPoint[] = []
  for (let i = safeDays - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    expected.push({ date: toYMD(d), label: toLabel(d), total: 0, count: 0 })
  }

  try {
    // Traemos todas las órdenes válidas del rango y agregamos en memoria.
    const start = new Date(today)
    start.setDate(today.getDate() - (safeDays - 1))
    const orders = await db.order.findMany({
      where: {
        status: { notIn: EXCLUDED_SALES_STATUSES },
        placedAt: { gte: start },
      },
      select: { total: true, placedAt: true },
    })

    const byDate = new Map<string, { total: number; count: number }>()
    for (const o of orders) {
      const key = toYMD(o.placedAt)
      const entry = byDate.get(key) ?? { total: 0, count: 0 }
      entry.total += o.total
      entry.count += 1
      byDate.set(key, entry)
    }

    for (const point of expected) {
      const e = byDate.get(point.date)
      if (e) {
        point.total = round2(e.total)
        point.count = e.count
      }
    }
    return expected
  } catch (err) {
    logger.error('analytics.getSalesTrend error', {
      days: safeDays,
      error: err instanceof Error ? err.message : String(err),
    })
    return expected
  }
}

// ------------------------------------------------------------
// Pedidos por estado
// ------------------------------------------------------------

export async function getOrdersByStatus(): Promise<OrdersByStatusPoint[]> {
  try {
    const groups = await db.order.groupBy({
      by: ['status'],
      _count: true,
    })
    const counts = new Map<string, number>()
    for (const g of groups) counts.set(g.status, g._count)

    // El `color` es una referencia CSS (chart-N). El componente StatusBadge
    // usa directamente ORDER_STATE_COLORS para variant + className.
    const colorMap: Record<OrderStatus, string> = {
      NUEVO: 'var(--chart-4)', // amber
      PENDIENTE_PAGO_TRANSPORTE: 'var(--chart-5)', // orange
      PAGO_TRANSPORTE_CONFIRMADO: 'var(--chart-3)', // teal-ish
      PREPARANDO: 'var(--chart-2)', // teal
      ENVIADO: 'var(--chart-2)',
      ENTREGADO: 'var(--chart-2)',
      DEVUELTO: 'var(--chart-1)', // red-ish
      CANCELADO: 'var(--chart-1)',
    }

    return ORDER_STATES.map((status) => ({
      status,
      label: ORDER_STATE_LABELS[status],
      count: counts.get(status) ?? 0,
      color: colorMap[status] ?? 'var(--chart-1)',
    }))
  } catch (err) {
    logger.error('analytics.getOrdersByStatus error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return ORDER_STATES.map((status) => ({
      status,
      label: ORDER_STATE_LABELS[status],
      count: 0,
      color: 'var(--chart-1)',
    }))
  }
}

// ------------------------------------------------------------
// Pedidos por método de pago
// ------------------------------------------------------------

export async function getOrdersByPaymentMethod(): Promise<PaymentMethodBreakdown> {
  try {
    const rows = await db.order.groupBy({
      by: ['paymentMethod'],
      where: { status: { notIn: EXCLUDED_SALES_STATUSES } },
      _sum: { total: true },
      _count: true,
    })

    const result: PaymentMethodBreakdown = {
      prepaid: { count: 0, total: 0 },
      cod: { count: 0, total: 0 },
    }

    for (const r of rows) {
      const total = round2(r._sum.total ?? 0)
      if (r.paymentMethod === 'COD') {
        result.cod = { count: r._count, total }
      } else {
        // PREPAID u otros se agregan a prepaid.
        result.prepaid = { count: r._count, total }
      }
    }
    return result
  } catch (err) {
    logger.error('analytics.getOrdersByPaymentMethod error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return { prepaid: { count: 0, total: 0 }, cod: { count: 0, total: 0 } }
  }
}

// ------------------------------------------------------------
// Top productos por ingreso
// ------------------------------------------------------------

export async function getTopProducts(limit = 5): Promise<TopProduct[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 50)
  try {
    // Traemos items de pedidos no cancelados/devueltos junto con su producto.
    const items = await db.orderItem.findMany({
      where: {
        order: { status: { notIn: EXCLUDED_SALES_STATUSES } },
      },
      select: {
        productId: true,
        title: true,
        sku: true,
        quantity: true,
        unitPrice: true,
        unitCost: true,
        total: true,
        product: { select: { id: true, title: true, sku: true } },
      },
    })

    // Agregamos por producto.
    const byProduct = new Map<
      string,
      {
        id: string
        title: string
        sku: string | null
        quantity: number
        revenue: number
        cost: number
      }
    >()

    for (const it of items) {
      const key = it.productId
      const entry = byProduct.get(key) ?? {
        id: it.productId,
        title: it.product?.title ?? it.title,
        sku: it.product?.sku ?? it.sku ?? null,
        quantity: 0,
        revenue: 0,
        cost: 0,
      }
      entry.quantity += it.quantity
      entry.revenue += it.total
      entry.cost += it.unitCost * it.quantity
      byProduct.set(key, entry)
    }

    const arr = Array.from(byProduct.values())
      .map((p) => {
        const revenue = round2(p.revenue)
        const profit = round2(revenue - p.cost)
        const margin = revenue > 0 ? round2((profit / revenue) * 100) : 0
        return {
          id: p.id,
          title: p.title,
          sku: p.sku,
          quantity: p.quantity,
          revenue,
          profit,
          margin,
        }
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, safeLimit)

    return arr
  } catch (err) {
    logger.error('analytics.getTopProducts error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

// ------------------------------------------------------------
// Métricas de devoluciones
// ------------------------------------------------------------

export async function getReturnsMetrics(): Promise<ReturnsMetrics> {
  try {
    const [returns, totalOrders] = await Promise.all([
      db.return.findMany({
        select: {
          lostValue: true,
          productId: true,
          product: { select: { title: true } },
          city: true,
          order: { select: { city: true } },
        },
      }),
      db.order.count(),
    ])

    const count = returns.length
    const rate = totalOrders > 0 ? round2((count / totalOrders) * 100) : 0
    const lostValue = round2(returns.reduce((s, r) => s + (r.lostValue ?? 0), 0))

    // Top producto: el que más aparece en devoluciones.
    const productCounts = new Map<string, { title: string; count: number }>()
    for (const r of returns) {
      if (!r.productId) continue
      const title = r.product?.title ?? 'Producto desconocido'
      const entry = productCounts.get(r.productId) ?? { title, count: 0 }
      entry.count += 1
      productCounts.set(r.productId, entry)
    }
    let topProduct: string | null = null
    let topProductCount = 0
    for (const [, v] of productCounts) {
      if (v.count > topProductCount) {
        topProductCount = v.count
        topProduct = v.title
      }
    }

    // Top ciudad: la que más aparece (campo `city` en Return, fallback al city del Order).
    const cityCounts = new Map<string, number>()
    for (const r of returns) {
      const city = (r.city ?? r.order?.city ?? '').toString().trim()
      if (!city) continue
      cityCounts.set(city, (cityCounts.get(city) ?? 0) + 1)
    }
    let topCity: string | null = null
    let topCityCount = 0
    for (const [city, c] of cityCounts) {
      if (c > topCityCount) {
        topCityCount = c
        topCity = city
      }
    }

    return { count, rate, lostValue, topProduct, topCity }
  } catch (err) {
    logger.error('analytics.getReturnsMetrics error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return { count: 0, rate: 0, lostValue: 0, topProduct: null, topCity: null }
  }
}

// ------------------------------------------------------------
// Rentabilidad
// ------------------------------------------------------------

export async function getProfitability(): Promise<Profitability> {
  try {
    // Revenue: sum de order.total de pedidos no cancelados/devueltos.
    const salesAgg = await db.order.aggregate({
      where: { status: { notIn: EXCLUDED_SALES_STATUSES } },
      _sum: { total: true },
    })
    const revenue = round2(salesAgg._sum.total ?? 0)

    // Costos del último mes desde CostEntry, agrupados por categoría.
    // Filtramos por `periodEnd >= since` para incluir cualquier entrada cuyo
    // periodo se solape con los últimos 30 días (típico de las entradas de
    // seed que tienen periodStart = hoy-30d exactamente).
    const since = new Date()
    since.setDate(since.getDate() - 30)
    const costEntries = await db.costEntry.findMany({
      where: { periodEnd: { gte: since } },
      select: { category: true, amount: true },
    })

    let productCostFromEntries = 0
    let shippingCost = 0
    let advertisingCost = 0
    let operationCost = 0
    for (const c of costEntries) {
      switch (c.category) {
        case 'PRODUCT':
          productCostFromEntries += c.amount
          break
        case 'SHIPPING':
          shippingCost += c.amount
          break
        case 'ADVERTISING':
          advertisingCost += c.amount
          break
        case 'OPERATION':
          operationCost += c.amount
          break
      }
    }

    // Costo de producto real: sum(unitCost * quantity) para pedidos
    // enviados/entregados. Prisma no soporta directamente sum(prod), así que
    // traemos las filas y calculamos en memoria (son pocas para el dashboard).
    const items = await db.orderItem.findMany({
      where: {
        order: { status: { in: DELIVERED_LIKE_STATUSES } },
      },
      select: { unitCost: true, quantity: true },
    })
    const productCostFromItems = round2(
      items.reduce((s, it) => s + it.unitCost * it.quantity, 0),
    )

    // Si CostEntry tiene PRODUCT para el periodo, lo usamos como autoritativo
    // (refleja costos totales del periodo, no solo lo entregado). Si no, usamos
    // el calculado a partir de OrderItems.
    const productCost =
      productCostFromEntries > 0 ? productCostFromEntries : productCostFromItems

    const totalCosts = round2(
      productCost + shippingCost + advertisingCost + operationCost,
    )
    const grossProfit = round2(revenue - productCost - shippingCost)
    const netProfit = round2(revenue - totalCosts)
    const margin = revenue > 0 ? round2((netProfit / revenue) * 100) : 0

    return {
      revenue,
      costs: {
        product: round2(productCost),
        shipping: round2(shippingCost),
        advertising: round2(advertisingCost),
        operation: round2(operationCost),
        total: totalCosts,
      },
      grossProfit,
      netProfit,
      margin,
    }
  } catch (err) {
    logger.error('analytics.getProfitability error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return {
      revenue: 0,
      costs: { product: 0, shipping: 0, advertising: 0, operation: 0, total: 0 },
      grossProfit: 0,
      netProfit: 0,
      margin: 0,
    }
  }
}
