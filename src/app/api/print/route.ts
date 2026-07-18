// ============================================================
// /api/print — Print queue management
// ============================================================
// GET  — lista PrintJobs con filtros + paginación.
//        ?stats=true devuelve solo estadísticas.

import { NextResponse } from 'next/server'
import { getCurrentUserOrFallback, requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { listPrintJobs, getPrintJobStats, processPrintQueue } from '@/modules/logistics/printing.service'
import { PRINT_JOB_STATUSES } from '@/lib/validation'

const VALID_STATUSES = new Set([...PRINT_JOB_STATUSES.map((s) => s), 'ALL'])

export async function GET(request: Request) {
  let user
  try {
    user = requireRole(await getCurrentUser(), 'ADMIN', 'BODEGA')
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 403
    return NextResponse.json({ error: (err as Error).message }, { status: statusCode })
  }

  const url = new URL(request.url)
  const params = url.searchParams
  const status = params.get('status') ?? undefined
  const search = params.get('search') ?? undefined
  const limit = params.get('limit') ? Number(params.get('limit')) : 20
  const offset = params.get('offset') ? Number(params.get('offset')) : 0
  const stats = params.get('stats') === 'true'

  if (status && !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: `Estado inválido: ${status}` }, { status: 400 })
  }

  try {
    if (stats) {
      const s = await getPrintJobStats()
      return NextResponse.json(s)
    }
    const result = await listPrintJobs({
      status: status === 'ALL' ? undefined : status,
      search: search || undefined,
      limit,
      offset,
    })
    return NextResponse.json(result)
  } catch (err) {
    logger.error('api.print.list error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Error al listar trabajos de impresión' }, { status: 500 })
  }
}

// POST /api/print?process=true — fuerza el procesamiento de la cola.
export async function POST(request: Request) {
  let user
  try {
    user = requireRole(await getCurrentUser(), 'ADMIN', 'BODEGA')
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 403
    return NextResponse.json({ error: (err as Error).message }, { status: statusCode })
  }

  const url = new URL(request.url)
  if (url.searchParams.get('process') !== 'true') {
    return NextResponse.json({ error: 'Use ?process=true para forzar el procesamiento' }, { status: 400 })
  }

  try {
    const result = await processPrintQueue()
    logger.info('api.print.process', { ...result, userId: user.id })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    logger.error('api.print.process error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Error al procesar la cola' }, { status: 500 })
  }
}
