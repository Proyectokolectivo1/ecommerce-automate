// ============================================================
// /api/webhooks/log — Listado + stats de webhooks
// ============================================================
// GET — lista webhooks con filtros. Si `?stats=true`, devuelve KPIs.
//       Requiere auth.

import { NextResponse } from 'next/server'
import { getCurrentUserOrFallback } from '@/lib/auth'
import { logger } from '@/lib/logger'
import {
  listWebhookLogs,
  getWebhookStats,
} from '@/modules/webhooks/webhook-log.service'

const VALID_STATUSES = new Set(['PENDING', 'PROCESSED', 'FAILED', 'DUPLICATE', 'ALL'])

export async function GET(request: Request) {
  const user = await getCurrentUserOrFallback()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const url = new URL(request.url)
  const params = url.searchParams

  const search = params.get('search') ?? undefined
  const source = params.get('source') ?? undefined
  const provider = params.get('provider') ?? undefined
  const status = params.get('status') ?? undefined
  const startDateStr = params.get('startDate')
  const endDateStr = params.get('endDate')
  const limitParam = params.get('limit')
  const offsetParam = params.get('offset')
  const wantStats = params.get('stats') === 'true'

  if (status && !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: `Status inválido: ${status}` }, { status: 400 })
  }

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
        getWebhookStats(),
        listWebhookLogs({
          search,
          source: source || undefined,
          provider: provider || undefined,
          status: status || undefined,
          startDate,
          endDate,
          limit,
          offset,
        }),
      ])
      return NextResponse.json({ ...list, stats })
    }
    const result = await listWebhookLogs({
      search,
      source: source || undefined,
      provider: provider || undefined,
      status: status || undefined,
      startDate,
      endDate,
      limit,
      offset,
    })
    return NextResponse.json(result)
  } catch (err) {
    logger.error('api.webhooks.log.list error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Error al listar webhooks' }, { status: 500 })
  }
}
