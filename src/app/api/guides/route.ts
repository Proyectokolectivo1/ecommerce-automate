// ============================================================
// /api/guides — List shipments (guías)
// ============================================================
// GET — lista envíos con filtros + paginación (auth requerida).
// Query params: status, carrier, search, limit, offset.

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { listShipments, getShipmentStats } from '@/modules/logistics/shipment.service'
import { SHIPMENT_STATUSES } from '@/lib/validation'

const VALID_STATUSES = new Set([...SHIPMENT_STATUSES.map((s) => s), 'ALL'])

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const url = new URL(request.url)
  const params = url.searchParams
  const status = params.get('status') ?? undefined
  const carrier = params.get('carrier') ?? undefined
  const search = params.get('search') ?? undefined
  const limit = params.get('limit') ? Number(params.get('limit')) : 20
  const offset = params.get('offset') ? Number(params.get('offset')) : 0
  const stats = params.get('stats') === 'true'

  if (status && !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: `Estado inválido: ${status}` }, { status: 400 })
  }
  if (!Number.isFinite(limit) || limit < 1) {
    return NextResponse.json({ error: 'limit inválido' }, { status: 400 })
  }
  if (!Number.isFinite(offset) || offset < 0) {
    return NextResponse.json({ error: 'offset inválido' }, { status: 400 })
  }

  try {
    if (stats) {
      const s = await getShipmentStats()
      return NextResponse.json(s)
    }
    const result = await listShipments({
      status: status === 'ALL' ? undefined : status,
      carrier: carrier === 'ALL' ? undefined : carrier,
      search: search || undefined,
      limit,
      offset,
    })
    return NextResponse.json(result)
  } catch (err) {
    logger.error('api.guides.list error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Error al listar guías' }, { status: 500 })
  }
}
