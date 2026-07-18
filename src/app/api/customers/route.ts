// ============================================================
// /api/customers — Listado + stats de clientes (CRM)
// ============================================================
// GET — devuelve listado paginado con filtros y, si `?stats=true`,
//       los KPIs globales del CRM. Requiere auth.

import { NextResponse } from 'next/server'
import { getCurrentUserOrFallback } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { listCustomers, getCustomerStats } from '@/modules/customers/customer.service'

const VALID_CLASSIFICATIONS = new Set(['VIP', 'FRECUENTE', 'NUEVO', 'INACTIVO', 'ALL'])
const VALID_SORT_BY = new Set(['name', 'totalSpent', 'ordersCount', 'lastOrderAt', 'createdAt'])

export async function GET(request: Request) {
  const user = await getCurrentUserOrFallback()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const url = new URL(request.url)
  const params = url.searchParams

  const search = params.get('search') ?? undefined
  const classification = params.get('classification') ?? undefined
  const city = params.get('city') ?? undefined
  const sortBy = params.get('sortBy') ?? undefined
  const sortDir = params.get('sortDir') ?? undefined
  const limitParam = params.get('limit')
  const offsetParam = params.get('offset')
  const wantStats = params.get('stats') === 'true'

  if (classification && !VALID_CLASSIFICATIONS.has(classification)) {
    return NextResponse.json(
      { error: `Clasificación inválida: ${classification}` },
      { status: 400 },
    )
  }
  if (sortBy && !VALID_SORT_BY.has(sortBy)) {
    return NextResponse.json(
      { error: `sortBy inválido: ${sortBy}` },
      { status: 400 },
    )
  }
  if (sortDir && !['asc', 'desc'].includes(sortDir)) {
    return NextResponse.json(
      { error: `sortDir inválido: ${sortDir}` },
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
    if (wantStats) {
      const [stats, list] = await Promise.all([
        getCustomerStats(),
        listCustomers({
          search,
          classification: classification || undefined,
          city: city || undefined,
          limit,
          offset,
          sortBy: sortBy as 'name' | 'totalSpent' | 'ordersCount' | 'lastOrderAt' | 'createdAt' | undefined,
          sortDir: sortDir as 'asc' | 'desc' | undefined,
        }),
      ])
      return NextResponse.json({ ...list, stats })
    }

    const result = await listCustomers({
      search,
      classification: classification || undefined,
      city: city || undefined,
      limit,
      offset,
      sortBy: sortBy as 'name' | 'totalSpent' | 'ordersCount' | 'lastOrderAt' | 'createdAt' | undefined,
      sortDir: sortDir as 'asc' | 'desc' | undefined,
    })
    return NextResponse.json(result)
  } catch (err) {
    logger.error('api.customers.list error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: 'Error al listar clientes' },
      { status: 500 },
    )
  }
}
