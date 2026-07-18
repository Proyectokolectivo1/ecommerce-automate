// ============================================================
// /api/analytics/profitability — Rentabilidad
// ============================================================
// GET — según query param `view`:
//   - view=period     → rentabilidad por periodo (day/week/month/year/all)
//   - view=trend      → tendencia de los últimos N días (default 30)
//   - view=breakdown  → desglose de costos por categoría
//   - default         → combina period (month) + trend (30d)
//
// Requiere auth.

import { NextResponse } from 'next/server'
import { getCurrentUserOrFallback } from '@/lib/auth'
import { logger } from '@/lib/logger'
import {
  getProfitabilityByPeriod,
  getProfitabilityTrend,
  getCostBreakdown,
} from '@/modules/analytics/profitability.metrics'

const VALID_PERIODS = new Set(['day', 'week', 'month', 'year', 'all'])

export async function GET(request: Request) {
  const user = await getCurrentUserOrFallback()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const url = new URL(request.url)
  const params = url.searchParams
  const view = params.get('view') ?? 'default'
  const period = params.get('period') ?? 'month'
  const daysParam = params.get('days')

  if (!VALID_PERIODS.has(period)) {
    return NextResponse.json({ error: `Periodo inválido: ${period}` }, { status: 400 })
  }

  const days = daysParam ? Number(daysParam) : 30
  if (!Number.isFinite(days) || days < 1 || days > 90) {
    return NextResponse.json(
      { error: 'days inválido (1-90)' },
      { status: 400 },
    )
  }

  try {
    if (view === 'period') {
      const result = await getProfitabilityByPeriod(period as 'day' | 'week' | 'month' | 'year' | 'all')
      return NextResponse.json(result)
    }

    if (view === 'trend') {
      const result = await getProfitabilityTrend(days)
      return NextResponse.json(result)
    }

    if (view === 'breakdown') {
      // Desglose de costos del último mes.
      const periodResult = await getProfitabilityByPeriod('month')
      const breakdown = await getCostBreakdown({
        product: periodResult.costs.product,
        shipping: periodResult.costs.shipping,
        advertising: periodResult.costs.advertising,
        operation: periodResult.costs.operation,
      })
      return NextResponse.json(breakdown)
    }

    // default: period (month) + trend (30d)
    const [byPeriod, trend] = await Promise.all([
      getProfitabilityByPeriod(period as 'day' | 'week' | 'month' | 'year' | 'all'),
      getProfitabilityTrend(days),
    ])
    return NextResponse.json({ byPeriod, trend })
  } catch (err) {
    logger.error('api.analytics.profitability error', {
      view,
      period,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: 'Error al obtener rentabilidad' },
      { status: 500 },
    )
  }
}
