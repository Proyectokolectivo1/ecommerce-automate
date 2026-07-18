// ============================================================
// /api/orders/[id] — Detalle de un pedido
// ============================================================
// GET — devuelve el pedido con todas sus relaciones.

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { getOrderById } from '@/modules/orders/order.service'

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUserOrFallback()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { id } = await ctx.params
  if (!id) {
    return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  }

  try {
    const order = await getOrderById(id)
    if (!order) {
      return NextResponse.json(
        { error: `Pedido no encontrado: ${id}` },
        { status: 404 },
      )
    }
    return NextResponse.json(order)
  } catch (err) {
    logger.error('api.orders.get error', {
      id,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: 'Error al obtener pedido' },
      { status: 500 },
    )
  }
}
