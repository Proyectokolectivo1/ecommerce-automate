// ============================================================
// /api/orders/[id]/dispatch — Trigger shipment creation
// ============================================================
// POST — crea el envío para un pedido (BODEGA, ADMIN).
//   Llama a createShipmentForOrder que orquesta:
//   Mastershop dispatch → Shipment guardado → transición ENVIADO
//   → encolar impresión → notificar cliente.

import { NextResponse } from 'next/server'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { createShipmentForOrder, ShipmentError } from '@/modules/logistics/shipment.service'
import { OrderNotFoundError } from '@/modules/orders/order.service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let user
  try {
    user = requireRole(await getCurrentUser(), 'ADMIN', 'BODEGA')
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 403
    return NextResponse.json({ error: (err as Error).message }, { status: statusCode })
  }

  const { id: orderId } = await params

  // Carrier opcional via body.
  let body: { carrier?: string } = {}
  try {
    body = await request.json()
  } catch {
    // body vacío es válido
  }

  try {
    const result = await createShipmentForOrder({
      orderId,
      actor: user.id,
      carrier: body.carrier,
    })

    logger.info('api.dispatch success', {
      orderId,
      guideNumber: result.guideNumber,
      userId: user.id,
    })

    return NextResponse.json({
      ok: true,
      shipmentId: result.shipment.id,
      guideNumber: result.guideNumber,
      carrier: result.carrier,
      pdfUrl: result.pdfUrl,
    })
  } catch (err) {
    if (err instanceof OrderNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    if (err instanceof ShipmentError) {
      return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status: 409 })
    }
    logger.error('api.dispatch error', {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Error al crear el envío' }, { status: 500 })
  }
}
