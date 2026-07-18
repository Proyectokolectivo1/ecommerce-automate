// ============================================================
// /api/analytics/products — Analítica de productos
// ============================================================
// GET — según query param `view`:
//   - view=star     → top 5 productos por cantidad / ingreso / profit
//   - view=stats    → KPIs globales del catálogo
//   - view=ranking  → ranking completo con filtros + paginación
//   - default       → combina star + stats (response ligera)
//
// Requiere auth.

import { NextResponse } from 'next/server'
import { getCurrentUserOrFallback } from '@/lib/auth'
import { logger } from '@/lib/logger'
import {
  getStarProducts,
  getProductStats,
  getProductRanking,
} from '@/modules/analytics/product.analytics'

const VALID_SORT_BY = new Set(['quantity', 'revenue', 'profit', 'margin', 'ordersCount'])

export async function GET(request: Request) {
  const user = await getCurrentUserOrFallback()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const url = new URL(request.url)
  const params = url.searchParams
  const view = params.get('view') ?? 'default'
  const limitParam = params.get('limit')
  const offsetParam = params.get('offset')
  const search = params.get('search') ?? undefined
  const activeOnly = params.get('activeOnly') === 'true'
  const sortBy = params.get('sortBy') ?? undefined
  const sortDir = params.get('sortDir') ?? undefined

  if (sortBy && !VALID_SORT_BY.has(sortBy)) {
    return NextResponse.json({ error: `sortBy inválido: ${sortBy}` }, { status: 400 })
  }
  if (sortDir && !['asc', 'desc'].includes(sortDir)) {
    return NextResponse.json({ error: `sortDir inválido: ${sortDir}` }, { status: 400 })
  }

  const limit = limitParam ? Number(limitParam) : 20
  const offset = offsetParam ? Number(offsetParam) : 0
  if (!Number.isFinite(limit) || limit < 1) {
    return NextResponse.json({ error: 'limit inválido' }, { status: 400 })
  }
  if (!Number.isFinite(offset) || offset < 0) {
    return NextResponse.json({ error: 'offset inválido' }, { status: 400 })
  }

  try {
    if (view === 'star') {
      const starLimit = limitParam ? Number(limitParam) : 5
      const result = await getStarProducts(starLimit)
      return NextResponse.json(result)
    }

    if (view === 'stats') {
      const stats = await getProductStats()
      return NextResponse.json(stats)
    }

    if (view === 'ranking') {
      const result = await getProductRanking({
        search,
        activeOnly,
        sortBy: sortBy as 'quantity' | 'revenue' | 'profit' | 'margin' | 'ordersCount' | undefined,
        sortDir: sortDir as 'asc' | 'desc' | undefined,
        limit,
        offset,
      })
      return NextResponse.json(result)
    }

    // default: star + stats
    const [star, stats] = await Promise.all([
      getStarProducts(5),
      getProductStats(),
    ])
    return NextResponse.json({ star, stats })
  } catch (err) {
    logger.error('api.analytics.products error', {
      view,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: 'Error al obtener analítica de productos' },
      { status: 500 },
    )
  }
}
