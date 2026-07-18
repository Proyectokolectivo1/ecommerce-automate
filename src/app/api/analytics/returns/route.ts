// ============================================================
// /api/analytics/returns — Analítica de devoluciones
// ============================================================
// GET — según query param `view`:
//   - view=metrics → KPIs detallados + tops
//   - view=list    → listado paginado con filtros
//   - default      → combina metrics + list (limit=10)
//
// Requiere auth.

import { NextResponse } from 'next/server'
import { getCurrentUserOrFallback } from '@/lib/auth'
import { logger } from '@/lib/logger'
import {
  getReturnsDetailedMetrics,
  getReturnsList,
} from '@/modules/analytics/returns.metrics'

const VALID_RETURN_STATUSES = new Set(['RECEIVED', 'INSPECTED', 'RESTOCKED', 'DISCARDED', 'ALL'])

export async function GET(request: Request) {
  const user = await getCurrentUserOrFallback()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const url = new URL(request.url)
  const params = url.searchParams
  const view = params.get('view') ?? 'default'
  const search = params.get('search') ?? undefined
  const status = params.get('status') ?? undefined
  const city = params.get('city') ?? undefined
  const productId = params.get('productId') ?? undefined
  const limitParam = params.get('limit')
  const offsetParam = params.get('offset')

  if (status && !VALID_RETURN_STATUSES.has(status)) {
    return NextResponse.json(
      { error: `Estado de devolución inválido: ${status}` },
      { status: 400 },
    )
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
    if (view === 'metrics') {
      const metrics = await getReturnsDetailedMetrics()
      return NextResponse.json(metrics)
    }

    if (view === 'list') {
      const result = await getReturnsList({
        search,
        status: status || undefined,
        city: city || undefined,
        productId: productId || undefined,
        limit,
        offset,
      })
      return NextResponse.json(result)
    }

    // default: metrics + list (limit=10)
    const [metrics, list] = await Promise.all([
      getReturnsDetailedMetrics(),
      getReturnsList({
        search,
        status: status || undefined,
        city: city || undefined,
        productId: productId || undefined,
        limit: 10,
        offset: 0,
      }),
    ])
    return NextResponse.json({ metrics, list })
  } catch (err) {
    logger.error('api.analytics.returns error', {
      view,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: 'Error al obtener analítica de devoluciones' },
      { status: 500 },
    )
  }
}
