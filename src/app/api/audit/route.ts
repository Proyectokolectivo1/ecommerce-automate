// ============================================================
// /api/audit — Log de auditoría
// ============================================================
// GET — lista logs con filtros. Si `?stats=true`, devuelve KPIs.
//       Si `?distinct=actions|entities`, devuelve valores únicos
//       para filtros UI. Requiere auth.

import { NextResponse } from 'next/server'
import { getCurrentUserOrFallback } from '@/lib/auth'
import { logger } from '@/lib/logger'
import {
  listAuditLogs,
  getAuditStats,
  getDistinctActions,
  getDistinctEntities,
} from '@/modules/admin/audit.service'

export async function GET(request: Request) {
  const user = await getCurrentUserOrFallback()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const url = new URL(request.url)
  const params = url.searchParams

  // Caso especial: devolver valores únicos para filtros UI.
  const distinct = params.get('distinct')
  if (distinct === 'actions') {
    try {
      return NextResponse.json({ values: await getDistinctActions() })
    } catch (err) {
      logger.error('api.audit.distinct-actions error', {
        error: err instanceof Error ? err.message : String(err),
      })
      return NextResponse.json({ error: 'Error al obtener acciones' }, { status: 500 })
    }
  }
  if (distinct === 'entities') {
    try {
      return NextResponse.json({ values: await getDistinctEntities() })
    } catch (err) {
      logger.error('api.audit.distinct-entities error', {
        error: err instanceof Error ? err.message : String(err),
      })
      return NextResponse.json({ error: 'Error al obtener entidades' }, { status: 500 })
    }
  }

  const search = params.get('search') ?? undefined
  const action = params.get('action') ?? undefined
  const entity = params.get('entity') ?? undefined
  const userId = params.get('userId') ?? undefined
  const startDateStr = params.get('startDate')
  const endDateStr = params.get('endDate')
  const limitParam = params.get('limit')
  const offsetParam = params.get('offset')
  const wantStats = params.get('stats') === 'true'

  const startDate = startDateStr ? new Date(startDateStr) : undefined
  const endDate = endDateStr ? new Date(endDateStr) : undefined
  if ((startDateStr && Number.isNaN(startDate?.getTime())) || (endDateStr && Number.isNaN(endDate?.getTime()))) {
    return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
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
    if (wantStats) {
      const [stats, list] = await Promise.all([
        getAuditStats(),
        listAuditLogs({
          search,
          action: action || undefined,
          entity: entity || undefined,
          userId: userId || undefined,
          startDate,
          endDate,
          limit,
          offset,
        }),
      ])
      return NextResponse.json({ ...list, stats })
    }
    const result = await listAuditLogs({
      search,
      action: action || undefined,
      entity: entity || undefined,
      userId: userId || undefined,
      startDate,
      endDate,
      limit,
      offset,
    })
    return NextResponse.json(result)
  } catch (err) {
    logger.error('api.audit.list error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Error al listar auditoría' }, { status: 500 })
  }
}
