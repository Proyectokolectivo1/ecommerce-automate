// ============================================================
// /api/alerts/[id]/resolve — Resolve an alert
// ============================================================
// POST — marca una alerta como resuelta (resolved=true,
//        resolvedAt=now). Requiere ADMIN, GERENCIA o SERVICIO.

import { NextResponse } from 'next/server'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { AlertNotFoundError, resolveAlert } from '@/modules/alerts/alert.service'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let user
  try {
    user = requireRole(await getCurrentUser(), 'ADMIN', 'GERENCIA', 'SERVICIO')
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 403
    return NextResponse.json({ error: (err as Error).message }, { status: statusCode })
  }

  const { id } = await params

  try {
    const alert = await resolveAlert(id)
    logger.info('api.alerts.resolve success', {
      alertId: alert.id,
      type: alert.type,
      userId: user.id,
    })
    return NextResponse.json({ ok: true, alert })
  } catch (err) {
    if (err instanceof AlertNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    logger.error('api.alerts.resolve error', {
      alertId: id,
      error: err instanceof Error ? err.message : String(err),
      userId: user.id,
    })
    return NextResponse.json(
      { error: 'Error al resolver alerta' },
      { status: 500 },
    )
  }
}
