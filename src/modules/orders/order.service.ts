// ============================================================
// order.service.ts — Server-side order service
// ============================================================
// Lógica de dominio del módulo de pedidos. Todas las funciones
// usan `db` (Prisma) y son server-side puras (sin 'use server').
// Usadas por las API routes de /api/orders/* y por el webhook de
// Shopify.

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import type { Prisma, Customer } from '@prisma/client'
import { canTransition } from './state-machine'
import { calculateTransportCost, isCodOrder } from './cod-flow'
import {
  ORDER_INCLUDE,
  type OrderFilters,
  type OrderListItem,
  type OrderStatus,
  type OrderWithRelations,
  type ShopifyOrderInput,
  type ShopifyLineItemInput,
} from './types'

// ------------------------------------------------------------
// Errors
// ------------------------------------------------------------

/** Error lanzado cuando una transición de estado no es válida. */
export class OrderTransitionError extends Error {
  code: string
  fromStatus: string
  toStatus: string
  constructor(fromStatus: string, toStatus: string) {
    super(
      `Transición inválida: ${fromStatus} → ${toStatus}. ` +
        `Use getAllowedTransitions() para ver los estados permitidos.`,
    )
    this.name = 'OrderTransitionError'
    this.code = 'ORDER_INVALID_TRANSITION'
    this.fromStatus = fromStatus
    this.toStatus = toStatus
  }
}

/** Error lanzado cuando un pedido no existe. */
export class OrderNotFoundError extends Error {
  code: string
  constructor(id: string) {
    super(`Pedido no encontrado: ${id}`)
    this.name = 'OrderNotFoundError'
    this.code = 'ORDER_NOT_FOUND'
  }
}

// ------------------------------------------------------------
// List & get
// ------------------------------------------------------------

/**
 * Lista pedidos con filtros. Incluye cliente, items y conteo de envíos.
 * Orden por `placedAt` DESC.
 */
export async function listOrders(
  filters: OrderFilters = {},
): Promise<{ orders: OrderListItem[]; total: number }> {
  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 200)
  const offset = Math.max(filters.offset ?? 0, 0)

  const where: Prisma.OrderWhereInput = {}
  if (filters.status && filters.status !== 'ALL') {
    where.status = filters.status
  }
  if (filters.paymentMethod && filters.paymentMethod !== 'ALL') {
    where.paymentMethod = filters.paymentMethod
  }
  if (filters.search && filters.search.trim().length > 0) {
    const q = filters.search.trim()
    where.OR = [
      { orderNumber: { contains: q } },
      { customer: { name: { contains: q } } },
      { customer: { email: { contains: q } } },
      { customer: { phone: { contains: q } } },
      { city: { contains: q } },
    ]
  }

  const [orders, total] = await Promise.all([
    db.order.findMany({
      where,
      include: {
        customer: true,
        items: true,
        _count: { select: { shipments: true } },
      },
      orderBy: { placedAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.order.count({ where }),
  ])

  return { orders, total }
}

/** Obtiene un pedido por id con todas sus relaciones. */
export async function getOrderById(id: string): Promise<OrderWithRelations | null> {
  return db.order.findUnique({
    where: { id },
    include: ORDER_INCLUDE,
  })
}

/** Obtiene un pedido por su orderNumber (legible para humanos). */
export async function getOrderByNumber(
  orderNumber: string,
): Promise<OrderWithRelations | null> {
  return db.order.findUnique({
    where: { orderNumber },
    include: ORDER_INCLUDE,
  })
}

// ------------------------------------------------------------
// Status transitions
// ------------------------------------------------------------

/**
 * Ejecuta una transición de estado del pedido.
 *
 * - Valida la transición con `canTransition`.
 * - Actualiza el estado y el timestamp correspondiente.
 * - Si `toStatus === PAGO_TRANSPORTE_CONFIRMADO`, marca `codPaid = true`.
 * - Crea un `OrderStatusLog` con actor + reason.
 * - Devuelve el pedido actualizado con todas sus relaciones.
 *
 * @throws OrderTransitionError si la transición no es válida.
 * @throws OrderNotFoundError si el pedido no existe.
 */
export async function transitionStatus(
  orderId: string,
  toStatus: string,
  actor: string,
  reason?: string,
): Promise<OrderWithRelations> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, orderNumber: true, paidAt: true },
  })
  if (!order) {
    throw new OrderNotFoundError(orderId)
  }

  const fromStatus = order.status
  if (fromStatus === toStatus) {
    // No-op: ya está en ese estado. Devolvemos el pedido tal cual.
    logger.info('order.transition no-op (same status)', {
      orderId,
      status: fromStatus,
      actor,
    })
    return db.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE }) as Promise<OrderWithRelations>
  }

  if (!canTransition(fromStatus, toStatus)) {
    throw new OrderTransitionError(fromStatus, toStatus)
  }

  // Construye el payload de actualización según el estado destino.
  const now = new Date()
  const updateData: Prisma.OrderUpdateInput = { status: toStatus }

  switch (toStatus) {
    case 'PAGO_TRANSPORTE_CONFIRMADO':
      updateData.codPaid = true
      updateData.transportPaidAt = now
      break
    case 'PREPARANDO':
      // No hay timestamp específico para "preparando" en el schema.
      break
    case 'ENVIADO':
      updateData.shippedAt = now
      break
    case 'ENTREGADO':
      updateData.deliveredAt = now
      updateData.paidAt = order.paidAt ? undefined : now
      break
    case 'DEVUELTO':
      updateData.returnedAt = now
      break
    case 'CANCELADO':
      updateData.cancelledAt = now
      break
    case 'PENDIENTE_PAGO_TRANSPORTE':
      // Entrada al flujo COD. Sin timestamps específicos.
      break
    case 'NUEVO':
      // No debería transicionar a NUEVO desde otro estado.
      break
  }

  // Limpia campos `undefined` que Prisma rechaza en `update.data`.
  // (Solo pasamos las propiedades definidas.)
  const cleanData: Prisma.OrderUpdateInput = {}
  for (const [k, v] of Object.entries(updateData)) {
    if (v !== undefined) (cleanData as Record<string, unknown>)[k] = v
  }

  const [updated] = await db.$transaction([
    db.order.update({
      where: { id: orderId },
      data: cleanData,
      include: ORDER_INCLUDE,
    }),
    db.orderStatusLog.create({
      data: {
        orderId,
        fromStatus,
        toStatus,
        reason: reason ?? null,
        actor: actor || 'system',
        metadata: JSON.stringify({ at: now.toISOString() }),
      },
    }),
  ])

  logger.info('order.transition', {
    orderId,
    orderNumber: order.orderNumber,
    from: fromStatus,
    to: toStatus,
    actor,
    reason: reason ?? null,
  })

  return updated
}

// ------------------------------------------------------------
// Shopify import (idempotent)
// ------------------------------------------------------------

/**
 * Crea o actualiza un pedido a partir del payload de un webhook de Shopify.
 *
 * - Idempotente: si ya existe un pedido con el mismo `shopifyId`, lo retorna
 *   sin modificar (los webhooks pueden reintentarse).
 * - Crea el cliente si no existe (matched por shopifyId o email).
 * - Crea los productos si no existen (matched por shopifyId o sku).
 * - Crea los items del pedido.
 * - Estado inicial: NUEVO si el método de pago es PREPAID o no definido;
 *   PENDIENTE_PAGO_TRANSPORTE si es COD.
 */
export async function createOrderFromShopify(
  payload: ShopifyOrderInput,
): Promise<{ order: OrderWithRelations; created: boolean }> {
  const shopifyId = String(payload.id)
  const orderNumber = `#${payload.order_number}`

  // Idempotencia: si ya existe, devolver sin tocar.
  const existing = await db.order.findUnique({
    where: { shopifyId },
    include: ORDER_INCLUDE,
  })
  if (existing) {
    logger.info('order.shopify already-imported', { shopifyId, orderNumber })
    return { order: existing, created: false }
  }

  // --- Cliente -------------------------------------------------------
  const customerPayload = payload.customer ?? null
  const customerEmail =
    (customerPayload?.email ?? payload.email ?? '').toString().trim().toLowerCase() || null
  const customerPhone = (customerPayload?.phone ?? payload.phone ?? '').toString().trim() || null
  const customerName =
    [customerPayload?.first_name, customerPayload?.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || payload.email?.split('@')[0] || 'Cliente Shopify'

  let customer: Customer | null = null
  if (customerPayload?.id) {
    customer = await db.customer.findUnique({
      where: { shopifyId: String(customerPayload.id) },
    })
  }
  if (!customer && customerEmail) {
    customer = await db.customer.findFirst({ where: { email: customerEmail } })
  }
  if (!customer) {
    customer = await db.customer.create({
      data: {
        shopifyId: customerPayload?.id ? String(customerPayload.id) : null,
        name: customerName,
        email: customerEmail,
        phone: customerPhone,
        classification: 'NUEVO',
      },
    })
  }

  // --- Items + productos ---------------------------------------------
  const lineItems = payload.line_items ?? []
  const itemsData: Array<{
    product: { id: string }
    title: string
    sku: string | null
    quantity: number
    unitPrice: number
    unitCost: number
    total: number
  }> = []

  let subtotal = 0
  for (const li of lineItems) {
    const product = await upsertProductFromShopify(li)
    const qty = Math.max(Number(li.quantity ?? 1), 0)
    const unitPrice = toNumber(li.price, product.price)
    const unitCost = product.cost
    const lineTotal = +(unitPrice * qty).toFixed(2)
    subtotal += lineTotal
    itemsData.push({
      product: { id: product.id },
      title: li.title || product.title,
      sku: li.sku ?? product.sku ?? null,
      quantity: qty,
      unitPrice,
      unitCost,
      total: lineTotal,
    })
  }

  // --- Costos / totales ----------------------------------------------
  const shippingCost = toNumber(
    payload.total_shipping_price_set?.shop_money?.amount,
    0,
  )
  const total = toNumber(payload.total_price, subtotal + shippingCost)
  const paymentMethod: 'PREPAID' | 'COD' =
    payload.paymentMethod === 'COD' ? 'COD' : 'PREPAID'
  const initialStatus: OrderStatus =
    paymentMethod === 'COD'
      ? 'PENDIENTE_PAGO_TRANSPORTE'
      : 'NUEVO'

  const addr = payload.shipping_address ?? null
  const city = addr?.city ?? null
  const addressLine =
    [addr?.address1, addr?.address2].filter(Boolean).join(' ').trim() || null

  // Para demo: si el pedido viene COD y no tiene transportCost, lo calculamos.
  let transportCost = 0
  if (paymentMethod === 'COD') {
    transportCost = calculateTransportCost({
      transportCost: 0,
      items: itemsData.map((i) => ({
        quantity: i.quantity,
        unitCost: i.unitCost,
        total: i.total,
      })),
    })
  }

  const placedAt = payload.processed_at || payload.created_at
    ? new Date(payload.processed_at || payload.created_at!)
    : new Date()

  // --- Creación del pedido (transacción) -----------------------------
  const order = await db.order.create({
    data: {
      shopifyId,
      orderNumber,
      customerId: customer.id,
      status: initialStatus,
      paymentMethod,
      subtotal: round2(subtotal),
      shippingCost: round2(shippingCost),
      transportCost: round2(transportCost),
      total: round2(total),
      declaredValue: 0,
      city,
      address: addressLine,
      notes: payload.note ?? null,
      codPaid: false,
      placedAt,
      items: {
        create: itemsData.map((i) => ({
          productId: i.product.id,
          title: i.title,
          sku: i.sku,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          unitCost: i.unitCost,
          total: i.total,
        })),
      },
      statusLogs: {
        create: {
          fromStatus: null,
          toStatus: initialStatus,
          reason: `Importado desde Shopify (${payload.financial_status ?? 'n/a'})`,
          actor: 'shopify',
          metadata: JSON.stringify({
            shopifyId,
            orderNumber,
            paymentMethod,
            importedAt: new Date().toISOString(),
          }),
        },
      },
    },
    include: ORDER_INCLUDE,
  })

  // Actualiza stats del cliente (fire-and-forget).
  void db.customer
    .update({
      where: { id: customer.id },
      data: {
        totalSpent: { increment: order.total },
        ordersCount: { increment: 1 },
        lastOrderAt: order.placedAt,
      },
    })
    .catch((err) =>
      logger.error('order.shopify customer-stats-update failed', {
        customerId: customer.id,
        error: err instanceof Error ? err.message : String(err),
      }),
    )

  logger.info('order.shopify created', {
    orderId: order.id,
    orderNumber: order.orderNumber,
    shopifyId,
    paymentMethod,
    status: initialStatus,
    isCod: isCodOrder({ paymentMethod: order.paymentMethod }),
  })

  return { order, created: true }
}

/**
 * Upsert de producto desde una line_item de Shopify.
 * Match por shopifyId, sku, o crea uno nuevo.
 */
async function upsertProductFromShopify(li: ShopifyLineItemInput) {
  const shopifyProductId = li.product_id ? String(li.product_id) : null
  const sku = li.sku?.trim() || null
  const title = li.title || 'Producto Shopify'
  const variantTitle = li.variant_title?.trim() || null
  const price = toNumber(li.price, 0)
  const weight = Number(li.grams ?? 0)

  // 1) Match por shopifyId
  if (shopifyProductId) {
    const found = await db.product.findUnique({
      where: { shopifyId: shopifyProductId },
    })
    if (found) {
      // Actualiza precio/title si cambiaron (sin tocar stock ni costo).
      return db.product.update({
        where: { id: found.id },
        data: {
          title,
          variant: variantTitle,
          price,
          weight,
        },
      })
    }
  }
  // 2) Match por sku
  if (sku) {
    const found = await db.product.findUnique({ where: { sku } })
    if (found) {
      return db.product.update({
        where: { id: found.id },
        data: { title, variant: variantTitle, price, weight },
      })
    }
  }
  // 3) Crea producto nuevo
  return db.product.create({
    data: {
      shopifyId: shopifyProductId,
      sku,
      title,
      variant: variantTitle,
      price,
      weight,
      cost: 0, // se debe llenar luego desde la planilla de costos
      inventoryQty: 0,
    },
  })
}

// ------------------------------------------------------------
// Stats & recent
// ------------------------------------------------------------

/** Tipo del resultado de `getOrderStats`. */
export type OrderStats = {
  total: number
  NUEVO: number
  PENDIENTE_PAGO_TRANSPORTE: number
  PAGO_TRANSPORTE_CONFIRMADO: number
  PREPARANDO: number
  ENVIADO: number
  ENTREGADO: number
  DEVUELTO: number
  CANCELADO: number
  codPendingCount: number
}

/**
 * Devuelve conteos de pedidos agrupados por estado + total.
 * `codPendingCount` = pedidos COD con `codPaid=false` y no cancelados.
 */
export async function getOrderStats(): Promise<OrderStats> {
  const groups = await db.order.groupBy({
    by: ['status'],
    _count: true,
  })

  const stats: OrderStats = {
    total: 0,
    NUEVO: 0,
    PENDIENTE_PAGO_TRANSPORTE: 0,
    PAGO_TRANSPORTE_CONFIRMADO: 0,
    PREPARANDO: 0,
    ENVIADO: 0,
    ENTREGADO: 0,
    DEVUELTO: 0,
    CANCELADO: 0,
    codPendingCount: 0,
  }

  for (const g of groups) {
    const status = g.status as keyof Omit<OrderStats, 'total' | 'codPendingCount'>
    if (status in stats) {
      stats[status] = g._count
    }
    stats.total += g._count
  }

  stats.codPendingCount = await db.order.count({
    where: {
      paymentMethod: 'COD',
      codPaid: false,
      status: { not: 'CANCELADO' },
    },
  })

  return stats
}

/**
 * Devuelve los últimos N pedidos (con cliente), ordenados por placedAt DESC.
 */
export async function getRecentOrders(limit = 5): Promise<OrderListItem[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 50)
  return db.order.findMany({
    include: {
      customer: true,
      items: true,
      _count: { select: { shipments: true } },
    },
    orderBy: { placedAt: 'desc' },
    take: safeLimit,
  })
}

// ------------------------------------------------------------
// Number helpers
// ------------------------------------------------------------

function toNumber(value: string | number | undefined | null, fallback = 0): number {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
