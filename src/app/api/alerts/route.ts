// ============================================================
// /api/alerts — Alert list + stats + on-demand evaluation
// ============================================================
// GET  — lista paginada con filtros + stats agregadas. Auth con
//        fallback (lectura).
// POST — dispara evaluación inmediata de todos los evaluadores y
//        persiste las nuevas condiciones (deduplicadas). Solo ADMIN.
//        Se invoca con `?evaluate=true` (body vacío).

import { NextResponse } from 'next/server'
import { getCurrentUser, getCurrentUserOrFallback, requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import type { AlertSeverity, AlertType } from '@/lib/validation'
import { ALERT_SEVERITIES, ALERT_TYPES } from '@/lib/validation'
import {
  getAlertStats,
  listAlerts,
  processAlertConditions,
  type ListAlertsFilters,
} from '@/modules/alerts/alert.service'
import { evaluateAllAlerts } from '@/modules/alerts/alert-evaluators'

export async function GET(request: Request) {
  const user = await getCurrentUserOrFallback()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  try {
    const url = new URL(request.url)
    const typeParam = url.searchParams.get('type') as AlertType | null
    const severityParam = url.searchParams.get('severity') as AlertSeverity | null
    const resolvedParam = url.searchParams.get('resolved')
    const limitParam = url.searchParams.get('limit')
    const offsetParam = url.searchParams.get('offset')

    const filters: ListAlertsFilters = {}
    if (typeParam && ALERT_TYPES.includes(typeParam)) filters.type = typeParam
    if (severityParam && ALERT_SEVERITIES.includes(severityParam)) filters.severity = severityParam
    if (resolvedParam === 'true') filters.resolved = true
    else if (resolvedParam === 'false') filters.resolved = false
    if (limitParam) filters.limit = parseInt(limitParam, 10)
    if (offsetParam) filters.offset = parseInt(offsetParam, 10)

    const [list, stats] = await Promise.all([
      listAlerts(filters),
      getAlertStats(),
    ])

    return NextResponse.json({
      alerts: list.alerts,
      total: list.total,
      stats,
      filters,
    })
  } catch (err) {
    logger.error('api.alerts.list error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: 'Error al listar alertas' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  let user
  try {
    user = requireRole(await getCurrentUser(), 'ADMIN')
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 403
    return NextResponse.json({ error: (err as Error).message }, { status: statusCode })
  }

  // Solo procede si ?evaluate=true (defensivo).
  const url = new URL(request.url)
  const evaluate = url.searchParams.get('evaluate')
  if (evaluate !== 'true') {
    return NextResponse.json(
      { error: 'Use POST /api/alerts?evaluate=true para disparar la evaluación' },
      { status: 400 },
    )
  }

  try {
    const start = Date.now()
    // IMPORTANT: evaluateAllAlerts returns { conditions, results }.
    const { conditions, results } = await evaluateAllAlerts()
    const summary = await processAlertConditions(conditions)

    logger.info('api.alerts.evaluate success', {
      ...summary,
      evaluators: results.length,
      rejected: results.filter((r) => r.status === 'rejected').length,
      durationMs: Date.now() - start,
      userId: user.id,
    })

    return NextResponse.json({
      ok: true,
      ...summary,
      evaluatorResults: results.map((r) => ({
        name: r.name,
        type: r.type,
        status: r.status,
        count: r.conditions.length,
        error: r.error,
        durationMs: r.durationMs,
      })),
      durationMs: Date.now() - start,
    })
  } catch (err) {
    logger.error('api.alerts.evaluate error', {
      error: err instanceof Error ? err.message : String(err),
      userId: user.id,
    })
    return NextResponse.json(
      { error: 'Error al evaluar alertas' },
      { status: 500 },
    )
  }
}
