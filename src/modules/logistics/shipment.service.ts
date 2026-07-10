// ============================================================
// shipment.service.ts — Logistics domain service
// ============================================================
// Lógica de dominio para envíos y guías. Orquesta:
//   - createShipment: llama Mastershop createDispatch, guarda Shipment,
//     transiciona el pedido a ENVIADO, encola PrintJob, notifica al cliente.
//   - getShipmentByGuide: busca por número de guía.
//   - listShipments: lista con filtros.
//   - updateTrackingFromCallback: actualiza estado + crea TrackingEvent
//     (usado por el webhook de Mastershop).
//
// Usa el adapter Mastershop (mock/real) y delega la impresión a
// printing.service y la notificación a notifications helpers.

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { audit } from '@/lib/audit'
import { createDispatch, getMastershopConfig } from '@/integrations/mastershop/client'
import { transitionStatus, OrderNotFoundError } from '@/modules/orders/order.service'
import { enqueuePrintJob } from './printing.service'
import { notifyGuideCreated } from '@/integrations/notifications/notify-customer'
import { emitGuideStatus, emitOrderTransition } from '@/lib/realtime'
import type { Prisma, Shipment } from '@prisma/client'

// ------------------------------------------------------------
// Errors
// ------------------------------------------------------------

export class ShipmentError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ShipmentError'
    this.code = code
  }
}

// ------------------------------------------------------------
// Create shipment (the core dispatch flow)
// ------------------------------------------------------------

export interface CreateShipmentInput {
  orderId: string
  actor: string
  /** Carrier override; si null usa defaultCarrier de la config. */
  carrier?: string
}

export interface ShipmentResult {
  shipment: Shipment & { trackingEvents: unknown[] }
  guideNumber: string
  carrier: string
  pdfUrl: string | null
  printed: boolean
}

/**
 * Crea un envío para un pedido:
 *   1. Valida que el pedido exista y esté en estado despachable
 *      (PAGO_TRANSPORTE_CONFIRMADO o PREPARANDO).
 *   2. Lee la config de Mastershop (fallback a mock si no hay).
 *   3. Llama createDispatch → recibe guideNumber + carrier + pdfUrl.
 *   4. Guarda Shipment en DB.
 *   5. Transiciona el pedido: PREPARANDO → ENVIADO.
 *   6. Encola PrintJob para impresión automática.
 *   7. Notifica al cliente (WhatsApp + Email) con la guía + tracking.
 *   8. Emite eventos realtime.
 *
 * Idempotente: si ya existe un Shipment con guideNumber para esta orden,
 * retorna el existente sin duplicar.
 */
export async function createShipmentForOrder(
  input: CreateShipmentInput,
): Promise<ShipmentResult> {
  const { orderId, actor } = input

  // 1. Carga el pedido con relaciones necesarias.
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      items: { include: { product: true } },
    },
  })
  if (!order) {
    throw new OrderNotFoundError(orderId)
  }

  // Estados despachables: PREPARANDO o PAGO_TRANSPORTE_CONFIRMADO.
  // (Un pedido en PAGO_TRANSPORTE_CONFIRMADO puede saltar directamente a ENVIADO.)
  const dispatchableStates = ['PREPARANDO', 'PAGO_TRANSPORTE_CONFIRMADO']
  if (!dispatchableStates.includes(order.status)) {
    throw new ShipmentError(
      'ORDER_NOT_DISPATCHABLE',
      `El pedido #${order.orderNumber} no puede despacharse desde el estado "${order.status}". ` +
        `Debe estar en PREPARANDO o PAGO_TRANSPORTE_CONFIRMADO.`,
    )
  }

  // Idempotencia: si ya tiene un envío con guía, no duplicar.
  const existingShipment = await db.shipment.findFirst({
    where: { orderId, guideNumber: { not: null } },
    include: { trackingEvents: true },
  })
  if (existingShipment && existingShipment.guideNumber) {
    logger.info('shipment.already-exists', { orderId, guideNumber: existingShipment.guideNumber })
    return {
      shipment: existingShipment,
      guideNumber: existingShipment.guideNumber,
      carrier: existingShipment.carrier ?? 'N/A',
      pdfUrl: existingShipment.pdfUrl,
      printed: false,
    }
  }

  // 2. Config de Mastershop (si no hay, usa un mock implícito).
  const cfg = (await getMastershopConfig()) ?? {
    apiUrl: 'mock://mastershop',
    apiKey: 'mock',
    merchantId: '',
    defaultCarrier: 'SERVIENTREGA',
  }

  // 3. Calcula peso total y valor declarado desde los items.
  const weightGrams = order.items.reduce((sum, it) => {
    const unitWeight = it.product?.weight ?? 0
    return sum + unitWeight * it.quantity
  }, 0)
  const productName = order.items.map((i) => i.title).slice(0, 3).join(', ') || 'Pedido'
  const declaredValue = Math.round(order.total)

  // 4. Llama Mastershop createDispatch.
  logger.info('shipment.create start', { orderId, orderNumber: order.orderNumber })

  const dispatch = await createDispatch(
    {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customer.name,
      customerPhone: order.customer.phone ?? null,
      city: order.city ?? 'N/A',
      address: order.address ?? 'N/A',
      productName,
      weightGrams: Math.max(weightGrams, 100),
      declaredValue,
      carrier: input.carrier,
    },
    cfg,
  )

  // 5. Guarda Shipment.
  const shipment = await db.shipment.create({
    data: {
      orderId: order.id,
      carrier: dispatch.carrier,
      guideNumber: dispatch.guideNumber,
      mastershopId: dispatch.mastershopId,
      status: 'CREATED',
      pdfUrl: dispatch.pdfUrl,
      trackingEvents: {
        create: {
          status: 'CREATED',
          message: `Guía generada por ${dispatch.carrier}`,
          city: order.city,
          occurredAt: new Date(),
        },
      },
    },
    include: { trackingEvents: true },
  })

  logger.info('shipment.created', {
    shipmentId: shipment.id,
    guideNumber: dispatch.guideNumber,
    carrier: dispatch.carrier,
  })

  // 6. Transición PREPARANDO/PAGO_TRANSPORTE_CONFIRMADO → ENVIADO.
  try {
    await transitionStatus(
      order.id,
      'ENVIADO',
      actor,
      `Guía ${dispatch.guideNumber} generada (${dispatch.carrier})`,
    )
    emitOrderTransition(order.id, order.orderNumber, order.status, 'ENVIADO', actor)
  } catch (err) {
    // Si la transición falla (ej. ya estaba ENVIADO), no revertimos el envío.
    logger.warn('shipment.transition-failed', {
      orderId: order.id,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // 7. Encola impresión automática.
  const printJob = await enqueuePrintJob({
    orderId: order.id,
    guideNumber: dispatch.guideNumber,
    pdfUrl: dispatch.pdfUrl,
    actor,
  })

  // 8. Notifica al cliente (fire-and-forget, no bloquea).
  void notifyGuideCreated({
    orderNumber: order.orderNumber,
    customerName: order.customer.name,
    customerPhone: order.customer.phone,
    customerEmail: order.customer.email,
    guideNumber: dispatch.guideNumber,
    carrier: dispatch.carrier,
    city: order.city,
  }).catch((err) =>
    logger.error('shipment.notify-failed', {
      orderId: order.id,
      error: err instanceof Error ? err.message : String(err),
    }),
  )

  // 9. Auditoría + realtime.
  void audit.log({
    userId: actor !== 'system' ? actor : null,
    action: 'SHIPMENT_CREATED',
    entity: 'Shipment',
    entityId: shipment.id,
    metadata: {
      orderId: order.id,
      guideNumber: dispatch.guideNumber,
      carrier: dispatch.carrier,
    },
  })
  emitGuideStatus(shipment.id, dispatch.guideNumber, 'CREATED')

  return {
    shipment,
    guideNumber: dispatch.guideNumber,
    carrier: dispatch.carrier,
    pdfUrl: dispatch.pdfUrl,
    printed: printJob.status === 'PRINTED',
  }
}

// ------------------------------------------------------------
// Query helpers
// ------------------------------------------------------------

/** Incluye estándar para cargar un Shipment con sus relaciones. */
const SHIPMENT_INCLUDE = {
  order: {
    include: {
      customer: true,
      items: true,
    },
  },
  trackingEvents: {
    orderBy: { occurredAt: 'asc' as const },
  },
} satisfies Prisma.ShipmentInclude

export type ShipmentWithRelations = Prisma.ShipmentGetPayload<{
  include: typeof SHIPMENT_INCLUDE
}>

/** Busca un envío por número de guía. */
export async function getShipmentByGuide(
  guideNumber: string,
): Promise<ShipmentWithRelations | null> {
  return db.shipment.findUnique({
    where: { guideNumber },
    include: SHIPMENT_INCLUDE,
  })
}

/** Busca un envío por id. */
export async function getShipmentById(
  id: string,
): Promise<ShipmentWithRelations | null> {
  return db.shipment.findUnique({
    where: { id },
    include: SHIPMENT_INCLUDE,
  })
}

export interface ShipmentFilters {
  status?: string
  carrier?: string
  search?: string
  limit?: number
  offset?: number
}

/** Lista envíos con filtros + paginación. */
export async function listShipments(filters: ShipmentFilters = {}): Promise<{
  shipments: ShipmentWithRelations[]
  total: number
}> {
  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 200)
  const offset = Math.max(filters.offset ?? 0, 0)

  const where: Prisma.ShipmentWhereInput = {}
  if (filters.status && filters.status !== 'ALL') {
    where.status = filters.status
  }
  if (filters.carrier && filters.carrier !== 'ALL') {
    where.carrier = filters.carrier
  }
  if (filters.search && filters.search.trim()) {
    const q = filters.search.trim()
    where.OR = [
      { guideNumber: { contains: q } },
      { carrier: { contains: q } },
      { order: { orderNumber: { contains: q } } },
      { order: { customer: { name: { contains: q } } } },
    ]
  }

  const [shipments, total] = await Promise.all([
    db.shipment.findMany({
      where,
      include: SHIPMENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.shipment.count({ where }),
  ])

  return { shipments, total }
}

/** Stats para la página de impresión/guías. */
export async function getShipmentStats(): Promise<{
  total: number
  byStatus: Record<string, number>
  printed: number
  pendingPrint: number
}> {
  const groups = await db.shipment.groupBy({
    by: ['status'],
    _count: true,
  })
  const byStatus: Record<string, number> = {}
  let total = 0
  for (const g of groups) {
    byStatus[g.status] = g._count
    total += g._count
  }

  const printed = await db.printJob.count({ where: { status: 'PRINTED' } })
  const pendingPrint = await db.printJob.count({
    where: { status: { in: ['QUEUED', 'SENT'] } },
  })

  return { total, byStatus, printed, pendingPrint }
}

// ------------------------------------------------------------
// Tracking update (called by Mastershop webhook)
// ------------------------------------------------------------

export interface TrackingUpdate {
  guideNumber: string
  status: string
  message?: string
  city?: string
  occurredAt?: Date
}

/**
 * Actualiza el tracking de un envío desde un callback de Mastershop.
 * Crea un TrackingEvent y actualiza Shipment.status.
 * Si DELIVERED/RETURNED, transiciona el Order.
 */
export async function updateTrackingFromCallback(
  update: TrackingUpdate,
): Promise<{ shipment: Shipment | null; orderTransitioned: boolean }> {
  const shipment = await db.shipment.findUnique({
    where: { guideNumber: update.guideNumber },
    include: { order: { select: { id: true, status: true, orderNumber: true } } },
  })
  if (!shipment) {
    return { shipment: null, orderTransitioned: false }
  }

  const normalized = normalizeShipmentStatus(update.status)
  const occurredAt = update.occurredAt ?? new Date()

  await db.$transaction([
    db.shipment.update({
      where: { id: shipment.id },
      data: { status: normalized },
    }),
    db.trackingEvent.create({
      data: {
        shipmentId: shipment.id,
        status: normalized,
        message: update.message ?? null,
        city: update.city ?? null,
        occurredAt,
      },
    }),
  ])

  // Transición de pedido según estado de la guía.
  let orderTransitioned = false
  const order = shipment.order
  try {
    if (normalized === 'DELIVERED' && order.status === 'ENVIADO') {
      await transitionStatus(order.id, 'ENTREGADO', 'system:mastershop', `Guía ${update.guideNumber} entregada`)
      orderTransitioned = true
    } else if (normalized === 'RETURNED' && order.status === 'ENVIADO') {
      await transitionStatus(order.id, 'DEVUELTO', 'system:mastershop', `Guía ${update.guideNumber} devuelta`)
      orderTransitioned = true
    }
  } catch (err) {
    logger.warn('shipment.tracking-transition-skipped', {
      orderId: order.id,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  emitGuideStatus(shipment.id, update.guideNumber, normalized)

  void audit.log({
    action: 'GUIDE_STATUS_UPDATE',
    entity: 'Shipment',
    entityId: shipment.id,
    metadata: {
      guideNumber: update.guideNumber,
      status: normalized,
      orderTransitioned,
    },
  })

  const updated = await db.shipment.findUnique({ where: { id: shipment.id } })
  return { shipment: updated, orderTransitioned }
}

function normalizeShipmentStatus(s: string): string {
  const v = s.toUpperCase()
  if (v === 'IN_TRANSIT' || v === 'EN_TRANSITO' || v === 'TRANSIT') return 'IN_TRANSIT'
  if (v === 'DELIVERED' || v === 'ENTREGADO') return 'DELIVERED'
  if (v === 'RETURNED' || v === 'DEVUELTO') return 'RETURNED'
  if (v === 'PRINTED' || v === 'IMPRESO') return 'PRINTED'
  if (v === 'CREATED' || v === 'CREADO') return 'CREATED'
  return v
}
