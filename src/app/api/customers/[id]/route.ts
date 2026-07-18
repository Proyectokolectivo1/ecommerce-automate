// ============================================================
// /api/customers/[id] — Detalle de cliente
// ============================================================
// GET — devuelve el cliente con sus últimas 50 órdenes + conteo.
//       Requiere auth.

import { NextResponse } from 'next/server'
import { getCurrentUserOrFallback } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { getCustomerById } from '@/modules/customers/customer.service'

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
    const customer = await getCustomerById(id)
    if (!customer) {
      return NextResponse.json(
        { error: `Cliente no encontrado: ${id}` },
        { status: 404 },
      )
    }
    return NextResponse.json(customer)
  } catch (err) {
    logger.error('api.customers.get error', {
      id,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: 'Error al obtener cliente' },
      { status: 500 },
    )
  }
}
