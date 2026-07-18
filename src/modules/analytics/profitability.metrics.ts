// ============================================================
// profitability.metrics.ts — Profitability by period & trend
// ============================================================
// Métricas de rentabilidad con desglose por periodo (day/week/
// month/year/all) y tendencia de los últimos N días.
//
// Rentabilidad = revenue − costs.
//   - revenue: sum(order.total) de pedidos no cancelados/devueltos.
//   - transportCollected: sum(order.shippingCost) cobrado al cliente.
//   - totalRevenue: revenue + transportCollected.
//   - costs: CostEntry agrupados por categoría + costo de producto
//     calculado desde OrderItem (solo pedidos ENVIADO/ENTREGADO).
//   - grossProfit: totalRevenue − (productCost + shippingCost).
//   - netProfit: totalRevenue − totalCosts.

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export type ProfitabilityPeriod = 'day' | 'week' | 'month' | 'year' | 'all'

export interface CostBreakdown {
  product: number
  shipping: number
  advertising: number
  operation: number
  total: number
}

export interface ProfitabilityByPeriod {
  period: ProfitabilityPeriod
  revenue: number
  transportCollected: number
  totalRevenue: number
  costs: CostBreakdown
  grossProfit: number
  netProfit: number
  margin: number
  ordersCount: number
}

export interface ProfitabilityTrendPoint {
  date: string // YYYY-MM-DD
  label: string // dd/MM
  revenue: number
  costs: number
  profit: number
  margin: number
  ordersCount: number
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

const EXCLUDED_SALES_STATUSES = ['CANCELADO', 'DEVUELTO']
const DELIVERED_LIKE_STATUSES = ['ENTREGADO', 'ENVIADO']

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function periodStart(period: ProfitabilityPeriod): Date | null {
  if (period === 'all') return null
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

function toYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toLabel(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${day}/${m}`
}

/**
 * Calcula el desglose de costos por categoría para un rango de fechas.
 * - PRODUCT: CostEntry del periodo (si existe) o cálculo desde OrderItem.
 * - SHIPPING/ADVERTISING/OPERATION: CostEntry del periodo.
 */
export async function getCostBreakdown(
  costs: { product: number; shipping: number; advertising: number; operation: number },
): Promise<CostBreakdown> {
  const product = round2(costs.product)
  const shipping = round2(costs.shipping)
  const advertising = round2(costs.advertising)
  const operation = round2(costs.operation)
  const total = round2(product + shipping + advertising + operation)
  return { product, shipping, advertising, operation, total }
}

// ------------------------------------------------------------
// Profitability by period
// ------------------------------------------------------------

export async function getProfitabilityByPeriod(
  period: ProfitabilityPeriod = 'month',
): Promise<ProfitabilityByPeriod> {
  try {
    const start = periodStart(period)

    const orderWhere: { status: { notIn: string[] }; placedAt?: { gte: Date } } = {
      status: { notIn: EXCLUDED_SALES_STATUSES },
    }
    if (start) {
      orderWhere.placedAt = { gte: start }
    }

    const [salesAgg, transportAgg, ordersCount] = await Promise.all([
      db.order.aggregate({
        where: orderWhere,
        _sum: { total: true },
      }),
      db.order.aggregate({
        where: orderWhere,
        _sum: { shippingCost: true },
      }),
      db.order.count({ where: orderWhere }),
    ])

    const revenue = round2(salesAgg._sum.total ?? 0)
    const transportCollected = round2(transportAgg._sum.shippingCost ?? 0)
    const totalRevenue = round2(revenue + transportCollected)

    // Cost entries del periodo (o últimos 30 días si "all")
    const costSince =
      start ?? (() => {
        const d = new Date()
        d.setDate(d.getDate() - 30)
        return d
      })()
    const costEntries = await db.costEntry.findMany({
      where: { periodEnd: { gte: costSince } },
      select: { category: true, amount: true },
    })

    const costsRaw = { product: 0, shipping: 0, advertising: 0, operation: 0 }
    for (const c of costEntries) {
      switch (c.category) {
        case 'PRODUCT':
          costsRaw.product += c.amount
          break
        case 'SHIPPING':
          costsRaw.shipping += c.amount
          break
        case 'ADVERTISING':
          costsRaw.advertising += c.amount
          break
        case 'OPERATION':
          costsRaw.operation += c.amount
          break
      }
    }

    // Si no hay CostEntry de PRODUCT en el periodo, lo calculamos desde OrderItem.
    if (costsRaw.product === 0) {
      const items = await db.orderItem.findMany({
        where: {
          order: {
            status: { in: DELIVERED_LIKE_STATUSES },
            ...(start ? { placedAt: { gte: start } } : {}),
          },
        },
        select: { unitCost: true, quantity: true },
      })
      costsRaw.product = items.reduce((s, it) => s + it.unitCost * it.quantity, 0)
    }

    const costs = await getCostBreakdown(costsRaw)

    const grossProfit = round2(totalRevenue - costs.product - costs.shipping)
    const netProfit = round2(totalRevenue - costs.total)
    const margin = totalRevenue > 0 ? round2((netProfit / totalRevenue) * 100) : 0

    return {
      period,
      revenue,
      transportCollected,
      totalRevenue,
      costs,
      grossProfit,
      netProfit,
      margin,
      ordersCount,
    }
  } catch (err) {
    logger.error('profitability.metrics.byPeriod error', {
      period,
      error: err instanceof Error ? err.message : String(err),
    })
    return {
      period,
      revenue: 0,
      transportCollected: 0,
      totalRevenue: 0,
      costs: { product: 0, shipping: 0, advertising: 0, operation: 0, total: 0 },
      grossProfit: 0,
      netProfit: 0,
      margin: 0,
      ordersCount: 0,
    }
  }
}

// ------------------------------------------------------------
// Profitability trend (últimos N días)
// ------------------------------------------------------------

export async function getProfitabilityTrend(
  days = 30,
): Promise<ProfitabilityTrendPoint[]> {
  const safeDays = Math.min(Math.max(days, 1), 90)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Genera la lista esperada de días.
  const expected: ProfitabilityTrendPoint[] = []
  for (let i = safeDays - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    expected.push({
      date: toYMD(d),
      label: toLabel(d),
      revenue: 0,
      costs: 0,
      profit: 0,
      margin: 0,
      ordersCount: 0,
    })
  }

  try {
    const start = new Date(today)
    start.setDate(today.getDate() - (safeDays - 1))

    // Trae órdenes válidas del rango.
    const orders = await db.order.findMany({
      where: {
        status: { notIn: EXCLUDED_SALES_STATUSES },
        placedAt: { gte: start },
      },
      select: { total: true, shippingCost: true, placedAt: true, id: true },
    })

    // Trae items de pedidos entregados/enviados para costo de producto.
    const items = await db.orderItem.findMany({
      where: {
        order: {
          status: { in: DELIVERED_LIKE_STATUSES },
          placedAt: { gte: start },
        },
      },
      select: { unitCost: true, quantity: true, order: { select: { placedAt: true } } },
    })

    // Trae cost entries del periodo para SHIPPING/ADVERTISING/OPERATION.
    // Se distribuyen proporcionalmente entre los días del rango.
    const costEntries = await db.costEntry.findMany({
      where: { periodEnd: { gte: start } },
      select: { category: true, amount: true },
    })
    let nonProductCosts = 0
    for (const c of costEntries) {
      if (c.category !== 'PRODUCT') nonProductCosts += c.amount
    }
    const dailyNonProduct = nonProductCosts / safeDays

    // Agrega revenue + costos por día.
    const revenueByDay = new Map<string, { total: number; count: number }>()
    for (const o of orders) {
      const key = toYMD(o.placedAt)
      const e = revenueByDay.get(key) ?? { total: 0, count: 0 }
      e.total += o.total + o.shippingCost
      e.count += 1
      revenueByDay.set(key, e)
    }

    const productCostByDay = new Map<string, number>()
    for (const it of items) {
      const key = toYMD(it.order.placedAt)
      productCostByDay.set(key, (productCostByDay.get(key) ?? 0) + it.unitCost * it.quantity)
    }

    for (const point of expected) {
      const rev = revenueByDay.get(point.date)
      const productCost = productCostByDay.get(point.date) ?? 0
      const costs = round2(productCost + dailyNonProduct)
      const revenue = rev ? round2(rev.total) : 0
      const profit = round2(revenue - costs)
      const margin = revenue > 0 ? round2((profit / revenue) * 100) : 0
      point.revenue = revenue
      point.costs = costs
      point.profit = profit
      point.margin = margin
      point.ordersCount = rev?.count ?? 0
    }

    return expected
  } catch (err) {
    logger.error('profitability.metrics.trend error', {
      days: safeDays,
      error: err instanceof Error ? err.message : String(err),
    })
    return expected
  }
}
