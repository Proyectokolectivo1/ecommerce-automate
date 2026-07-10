// ============================================================
// /api/webhooks/mastershop — Callback de estado de guías
// ============================================================
// POST — Mastershop notifica cambios de estado de una guía
// (IN_TRANSIT, DELIVERED, RETURNED, PRINTED). El handler:
//   1. Parsea el callback (guideNumber + status).
//   2. Busca el Shipment por guideNumber.
//   3. Actualiza el Shipment.status.
//   4. Crea un TrackingEvent.
//   5. Si DELIVERED/RETURNED, transiciona el Order correspondiente.
//
// No requiere auth (webhook entrante). En producción se valida con
// la firma compartida de Mastershop.

import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { transitionStatus } from '@/modules/orders/order.service'

interface MastershopCallbackBody {
  guide_number?: string
  guideNumber?: string
  status?: string
  message?: string
  city?: string
  occurred_at?: string
  occurredAt?: string
}

export async function POST(request: Request) {
  let body: MastershopCallbackBody
  try {
    body = (await request.json()) as MastershopCallbackBody
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 })
  }

  const guideNumber = body.guide_number ?? body.guideNumber ?? null
  const status = (body.status ?? '').toUpperCase()
  if (!guideNumber || !status) {
    return NextResponse.json(
      { ok: false, error: 'Faltan guide_number o status' },
      { status: 400 },
    )
  }

  const normalizedStatus = normalizeShipmentStatus(status)
  const occurredAt = body.occurred_at ?? body.occurredAt
    ? new Date(body.occurred_at ?? body.occurred_at!)
    : new Date()

  logger.info('mastershop.webhook received', { guideNumber, status: normalizedStatus })

  const shipment = await db.shipment.findUnique({
    where: { guideNumber },
    include: { order: { select: { id: true, status: true, orderNumber: true } } },
  })
  if (!shipment) {
    logger.warn('mastershop.webhook shipment-not-found', { guideNumber })
    return NextResponse.json({ ok: true, matched: false }, { status: 200 })
  }

  // Actualiza el shipment + crea tracking event (transacción).
  await db.$transaction([
    db.shipment.update({
      where: { id: shipment.id },
      data: { status: normalizedStatus },
    }),
    db.trackingEvent.create({
      data: {
        shipmentId: shipment.id,
        status: normalizedStatus,
        message: body.message ?? null,
        city: body.city ?? null,
        occurredAt,
      },
    }),
  ])

  // Transición de pedido según estado de la guía.
  const order = shipment.order
  let orderTransitioned = false
  try {
    if (normalizedStatus === 'DELIVERED' && order.status === 'ENVIADO') {
      await transitionStatus(order.id, 'ENTREGADO', 'system:mastershop-webhook', `Guía ${guideNumber} entregada`)
      orderTransitioned = true
    } else if (normalizedStatus === 'RETURNED' && order.status === 'ENVIADO') {
      await transitionStatus(order.id, 'DEVUELTO', 'system:mastershop-webhook', `Guía ${guideNumber} devuelta`)
      orderTransitioned = true
    }
  } catch (err) {
    logger.warn('mastershop.webhook order-transition-skipped', {
      orderId: order.id,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  void audit.log({
    action: 'GUIDE_STATUS_UPDATE',
    entity: 'Shipment',
    entityId: shipment.id,
    metadata: { guideNumber, status: normalizedStatus, orderTransitioned },
  })

  return NextResponse.json({
    ok: true,
    matched: true,
    shipmentId: shipment.id,
    status: normalizedStatus,
    orderTransitioned,
  })
}

function normalizeShipmentStatus(s: string): string {
  const v = s.toUpperCase()
  if (v === 'IN_TRANSIT' || v === 'EN_TRANSITO' || v === 'TRANSIT') return 'IN_TRANSIT'
  if (v === 'DELIVERED' || v === 'ENTREGADO') return 'DELIVERED'
  if (v === 'RETURNED' || v === 'DEVUELTO') return 'RETURNED'
  if (v === 'PRINTED' || v === 'IMPRESO') return 'PRINTED'
  return v
}
