// ============================================================
// /api/orders — Listado de pedidos
// ============================================================
// GET  — lista pedidos con filtros (auth requerida)
// POST — creación manual (no implementado, devuelve 405)

import { NextResponse } from 'next/server'
import { getCurrentUserOrFallback } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { listOrders } from '@/modules/orders/order.service'
import { ORDER_STATUSES } from '@/lib/validation'

const VALID_PAYMENT_METHODS = new Set(['PREPAID', 'COD', 'ALL'])

export async function GET(request: Request) {
  // --- Auth ---------------------------------------------------------
  const user = await getCurrentUserOrFallback()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // --- Parse query --------------------------------------------------
  const url = new URL(request.url)
  const params = url.searchParams

  const status = params.get('status') ?? undefined
  const search = params.get('search') ?? undefined
  const paymentMethod = params.get('paymentMethod') ?? undefined
  const limitParam = params.get('limit')
  const offsetParam = params.get('offset')

  // Validación de `status`
  if (status && status !== 'ALL' && !ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number])) {
    return NextResponse.json(
      { error: `Estado inválido: ${status}` },
      { status: 400 },
    )
  }
  if (paymentMethod && !VALID_PAYMENT_METHODS.has(paymentMethod)) {
    return NextResponse.json(
      { error: `Método de pago inválido: ${paymentMethod}` },
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
    const result = await listOrders({
      status: status === 'ALL' ? undefined : status,
      search: search || undefined,
      paymentMethod: paymentMethod === 'ALL' ? undefined : paymentMethod || undefined,
      limit,
      offset,
    })
    return NextResponse.json(result)
  } catch (err) {
    logger.error('api.orders.list error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: 'Error al listar pedidos' },
      { status: 500 },
    )
  }
}

// POST no implementado — creación manual queda para una tarea posterior.
export async function POST() {
  return NextResponse.json(
    { error: 'Creación manual no implementada. Use el webhook de Shopify.' },
    { status: 405 },
  )
}
