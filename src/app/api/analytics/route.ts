// ============================================================
// /api/analytics — Combined executive dashboard payload
// ============================================================
// GET — devuelve todos los KPIs, tendencias, breakdowns y top
// productos para el dashboard ejecutivo. Requiere auth.
// Cacheado 60s con la lib `cache` (in-memory).

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { cache } from '@/lib/cache'
import { logger } from '@/lib/logger'
import { getRecentOrders } from '@/modules/orders/order.service'
import {
  getOrdersByPaymentMethod,
  getOrdersByStatus,
  getProfitability,
  getReturnsMetrics,
  getSalesKPIs,
  getSalesTrend,
  getTopProducts,
} from '@/modules/analytics'

const CACHE_KEY = 'api:analytics:combined'
const CACHE_TTL_MS = 60 * 1000 // 60 segundos

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  try {
    // El payload es independiente del usuario (todos los roles autenticados
    // ven los mismos KPIs agregados).
    const cached = cache.get<unknown>(CACHE_KEY)
    if (cached) {
      return NextResponse.json(cached)
    }

    const [
      day,
      week,
      month,
      year,
      trend,
      ordersByStatus,
      ordersByPaymentMethod,
      topProducts,
      returns,
      profitability,
      recentOrders,
    ] = await Promise.all([
      getSalesKPIs('day'),
      getSalesKPIs('week'),
      getSalesKPIs('month'),
      getSalesKPIs('year'),
      getSalesTrend(14),
      getOrdersByStatus(),
      getOrdersByPaymentMethod(),
      getTopProducts(5),
      getReturnsMetrics(),
      getProfitability(),
      getRecentOrders(5),
    ])

    const payload = {
      sales: { day, week, month, year },
      trend,
      ordersByStatus,
      ordersByPaymentMethod,
      topProducts,
      returns,
      profitability,
      recentOrders,
      generatedAt: new Date().toISOString(),
    }

    cache.set(CACHE_KEY, payload, CACHE_TTL_MS)

    return NextResponse.json(payload)
  } catch (err) {
    logger.error('api.analytics error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: 'Error al obtener analítica' },
      { status: 500 },
    )
  }
}
