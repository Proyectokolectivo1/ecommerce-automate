// ============================================================
// /api/print/[id]/retry — Retry a failed print job
// ============================================================
// POST — vuelve a poner un PrintJob fallido en cola (ADMIN, BODEGA).

import { NextResponse } from 'next/server'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { retryPrintJob, PrintJobError } from '@/modules/logistics/printing.service'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let user
  try {
    user = requireRole(await getCurrentUser(), 'ADMIN', 'BODEGA')
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 403
    return NextResponse.json({ error: (err as Error).message }, { status: statusCode })
  }

  const { id } = await params

  try {
    const job = await retryPrintJob(id, user.id)
    return NextResponse.json({ ok: true, printJobId: job.id, status: job.status })
  } catch (err) {
    if (err instanceof PrintJobError) {
      const status = err.code === 'NOT_FOUND' ? 404 : err.code === 'ALREADY_PRINTED' ? 409 : 400
      return NextResponse.json({ error: err.message, code: err.code }, { status })
    }
    logger.error('api.print.retry error', {
      id,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Error al reintentar impresión' }, { status: 500 })
  }
}
