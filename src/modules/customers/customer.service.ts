// ============================================================
// customer.service.ts — Server-side customer service (CRM)
// ============================================================
// Lógica de dominio del módulo de clientes. Todas las funciones
// usan `db` (Prisma) y son server-side puras (sin 'use server').
// Usadas por las API routes de /api/customers/* y por el módulo de
// pedidos para mantener las estadísticas denormalizadas del cliente.
//
// Responsabilidades:
//   - listCustomers: listado con filtros + paginación
//   - getCustomerById: detalle con órdenes + stats
//   - getCustomerStats: KPIs globales del CRM
//   - reclassifyCustomer / reclassifyAllCustomers: recálculo de
//     clasificación basado en umbrales
//   - updateCustomerStatsAfterOrder / adjustCustomerStatsOnCancellation:
//     mantenimiento incremental de stats tras eventos de pedido

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { Prisma } from '@prisma/client'
import {
  classifyCustomer,
  buildCustomerStats,
  calculateDaysSinceLastOrder,
  CLASSIFICATION_THRESHOLDS,
} from './classification'
import type { CustomerClassification } from '@/lib/validation'

// ------------------------------------------------------------
// Types & filters
// ------------------------------------------------------------

export interface CustomerFilters {
  search?: string
  classification?: string
  city?: string
  limit?: number
  offset?: number
  sortBy?: 'name' | 'totalSpent' | 'ordersCount' | 'lastOrderAt' | 'createdAt'
  sortDir?: 'asc' | 'desc'
}

/** Cliente para listados (sin órdenes anidadas, ligero). */
export type CustomerListItem = Prisma.CustomerGetPayload<{
  include: { _count: { select: { orders: true } } }
}>

/** Cliente con órdenes y conteos para el detalle. */
export type CustomerDetail = Prisma.CustomerGetPayload<{
  include: {
    orders: {
      select: {
        id: true
        orderNumber: true
        status: true
        paymentMethod: true
        total: true
        placedAt: true
        city: true
        _count: { select: { shipments: true; returns: true } }
      }
      orderBy: { placedAt: 'desc' }
      take: 50
    }
    _count: { select: { orders: true } }
  }
}>

export interface CustomerStats {
  total: number
  byClassification: Record<CustomerClassification, number>
  withEmail: number
  withPhone: number
  byCity: Array<{ city: string; count: number }>
  avgSpent: number
  totalSpent: number
  totalOrders: number
  inactiveCount: number
}

export interface ReclassifyResult {
  customerId: string
  from: string
  to: string
  changed: boolean
  reasons: string[]
}

export interface ReclassifyAllResult {
  processed: number
  changed: number
  details: ReclassifyResult[]
}

// ------------------------------------------------------------
// Errors
// ------------------------------------------------------------

export class CustomerNotFoundError extends Error {
  code: string
  constructor(id: string) {
    super(`Cliente no encontrado: ${id}`)
    this.name = 'CustomerNotFoundError'
    this.code = 'CUSTOMER_NOT_FOUND'
  }
}

// ------------------------------------------------------------
// List & get
// ------------------------------------------------------------

/**
 * Lista clientes con filtros y paginación.
 * Incluye el conteo de órdenes. Orden por `createdAt` DESC por defecto.
 */
export async function listCustomers(
  filters: CustomerFilters = {},
): Promise<{ customers: CustomerListItem[]; total: number }> {
  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 200)
  const offset = Math.max(filters.offset ?? 0, 0)
  const sortBy = filters.sortBy ?? 'createdAt'
  const sortDir = filters.sortDir ?? 'desc'

  const where: Prisma.CustomerWhereInput = {}
  if (filters.classification && filters.classification !== 'ALL') {
    where.classification = filters.classification
  }
  if (filters.city && filters.city !== 'ALL') {
    where.city = filters.city
  }
  if (filters.search && filters.search.trim().length > 0) {
    const q = filters.search.trim()
    where.OR = [
      { name: { contains: q } },
      { email: { contains: q } },
      { phone: { contains: q } },
      { city: { contains: q } },
    ]
  }

  // Prisma orderBy con clave dinámica
  const orderBy: Prisma.CustomerOrderByWithRelationInput = {
    [sortBy]: sortDir,
  }

  const [customers, total] = await Promise.all([
    db.customer.findMany({
      where,
      include: { _count: { select: { orders: true } } },
      orderBy,
      take: limit,
      skip: offset,
    }),
    db.customer.count({ where }),
  ])

  return { customers, total }
}

/**
 * Obtiene un cliente por id, incluyendo sus últimas 50 órdenes
 * (con conteo de envíos/devoluciones) y el conteo total.
 */
export async function getCustomerById(id: string): Promise<CustomerDetail | null> {
  return db.customer.findUnique({
    where: { id },
    include: {
      orders: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentMethod: true,
          total: true,
          placedAt: true,
          city: true,
          _count: { select: { shipments: true, returns: true } },
        },
        orderBy: { placedAt: 'desc' },
        take: 50,
      },
      _count: { select: { orders: true } },
    },
  })
}

// ------------------------------------------------------------
// Stats
// ------------------------------------------------------------

/**
 * KPIs globales del CRM: total, distribución por clasificación,
 * cobertura de email/teléfono, top ciudades, promedios.
 */
export async function getCustomerStats(): Promise<CustomerStats> {
  try {
    const [total, classifications, emailCount, phoneCount, cityGroups, spentAgg, ordersAgg] =
      await Promise.all([
        db.customer.count(),
        db.customer.groupBy({
          by: ['classification'],
          _count: true,
        }),
        db.customer.count({ where: { NOT: { email: null } } }),
        db.customer.count({ where: { NOT: { phone: null } } }),
        db.customer.groupBy({
          by: ['city'],
          _count: true,
          orderBy: { _count: { city: 'desc' } },
          take: 10,
        }),
        db.customer.aggregate({ _sum: { totalSpent: true }, _avg: { totalSpent: true } }),
        db.customer.aggregate({ _sum: { ordersCount: true } }),
      ])

    const byClassification: Record<CustomerClassification, number> = {
      VIP: 0,
      FRECUENTE: 0,
      NUEVO: 0,
      INACTIVO: 0,
    }
    for (const c of classifications) {
      const key = c.classification as CustomerClassification
      if (key in byClassification) {
        byClassification[key] = c._count
      }
    }

    // Inactivos: sin orden en los últimos INACTIVE_DAYS
    const inactiveSince = new Date()
    inactiveSince.setDate(inactiveSince.getDate() - CLASSIFICATION_THRESHOLDS.INACTIVE_DAYS)
    const inactiveCount = await db.customer.count({
      where: {
        OR: [{ lastOrderAt: null }, { lastOrderAt: { lt: inactiveSince } }],
      },
    })

    const byCity = cityGroups
      .filter((g) => g.city !== null && g.city !== '')
      .map((g) => ({ city: g.city as string, count: g._count }))

    return {
      total,
      byClassification,
      withEmail: emailCount,
      withPhone: phoneCount,
      byCity,
      avgSpent: Math.round(spentAgg._avg.totalSpent ?? 0),
      totalSpent: Math.round(spentAgg._sum.totalSpent ?? 0),
      totalOrders: ordersAgg._sum.ordersCount ?? 0,
      inactiveCount,
    }
  } catch (err) {
    logger.error('customer.stats error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return {
      total: 0,
      byClassification: { VIP: 0, FRECUENTE: 0, NUEVO: 0, INACTIVO: 0 },
      withEmail: 0,
      withPhone: 0,
      byCity: [],
      avgSpent: 0,
      totalSpent: 0,
      totalOrders: 0,
      inactiveCount: 0,
    }
  }
}

// ------------------------------------------------------------
// Reclassification
// ------------------------------------------------------------

/**
 * Recalcula la clasificación de un cliente a partir de sus estadísticas
 * denormalizadas (totalSpent, ordersCount, lastOrderAt). Si la nueva
 * clasificación difiere de la actual, la actualiza en DB.
 *
 * @throws CustomerNotFoundError si el cliente no existe.
 */
export async function reclassifyCustomer(id: string): Promise<ReclassifyResult> {
  const customer = await db.customer.findUnique({
    where: { id },
    select: { id: true, classification: true, totalSpent: true, ordersCount: true, lastOrderAt: true },
  })
  if (!customer) {
    throw new CustomerNotFoundError(id)
  }

  const stats = buildCustomerStats(customer)
  const result = classifyCustomer(stats)
  const changed = result.classification !== customer.classification

  if (changed) {
    await db.customer.update({
      where: { id },
      data: { classification: result.classification },
    })
    logger.info('customer.reclassified', {
      customerId: id,
      from: customer.classification,
      to: result.classification,
      reasons: result.reasons,
    })
  }

  return {
    customerId: id,
    from: customer.classification,
    to: result.classification,
    changed,
    reasons: result.reasons,
  }
}

/**
 * Recalcula la clasificación de todos los clientes.
 * Procesa en lotes para no saturar memoria. Devuelve el detalle solo
 * de los clientes cuya clasificación cambió (para auditoría).
 */
export async function reclassifyAllCustomers(): Promise<ReclassifyAllResult> {
  const batchSize = 200
  let processed = 0
  let changed = 0
  const changedDetails: ReclassifyResult[] = []
  let cursor: string | undefined

  // Iteramos en lotes usando cursor-based pagination.
  while (true) {
    const batch = await db.customer.findMany({
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        classification: true,
        totalSpent: true,
        ordersCount: true,
        lastOrderAt: true,
      },
    })

    if (batch.length === 0) break

    // Prepara los updates en una transacción para consistencia.
    const updates: Array<{ id: string; classification: CustomerClassification }> = []
    for (const c of batch) {
      const stats = buildCustomerStats(c)
      const result = classifyCustomer(stats)
      processed += 1
      if (result.classification !== c.classification) {
        changed += 1
        updates.push({ id: c.id, classification: result.classification })
        changedDetails.push({
          customerId: c.id,
          from: c.classification,
          to: result.classification,
          changed: true,
          reasons: result.reasons,
        })
      }
    }

    if (updates.length > 0) {
      await db.$transaction(
        updates.map((u) =>
          db.customer.update({
            where: { id: u.id },
            data: { classification: u.classification },
          }),
        ),
      )
    }

    cursor = batch[batch.length - 1].id
    if (batch.length < batchSize) break
  }

  logger.info('customer.reclassify-all', { processed, changed })
  return { processed, changed, details: changedDetails }
}

// ------------------------------------------------------------
// Stats maintenance (after order events)
// ------------------------------------------------------------

/**
 * Actualiza las estadísticas denormalizadas del cliente tras una
 * nueva orden. Incrementa totalSpent y ordersCount, y setea
 * lastOrderAt al máximo entre el valor actual y `placedAt`.
 *
 * NO recalcula la clasificación aquí — eso se hace con
 * `reclassifyCustomer` (para no acoplar la operación de crear orden
 * con la de reclasificar; el llamador puede invocarla luego).
 *
 * Uso típico desde order.service: fire-and-forget.
 */
export async function updateCustomerStatsAfterOrder(
  customerId: string,
  total: number,
  placedAt: Date,
): Promise<void> {
  try {
    const current = await db.customer.findUnique({
      where: { id: customerId },
      select: { lastOrderAt: true },
    })
    if (!current) {
      logger.warn('customer.updateStatsAfterOrder customer-not-found', { customerId })
      return
    }
    const lastOrderAt =
      !current.lastOrderAt || placedAt.getTime() > current.lastOrderAt.getTime()
        ? placedAt
        : current.lastOrderAt
    await db.customer.update({
      where: { id: customerId },
      data: {
        totalSpent: { increment: Math.round(total) },
        ordersCount: { increment: 1 },
        lastOrderAt,
      },
    })
  } catch (err) {
    logger.error('customer.updateStatsAfterOrder error', {
      customerId,
      total,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Ajusta las estadísticas del cliente tras una cancelación de orden.
 * Decrementa totalSpent y ordersCount. No toca `lastOrderAt` porque
 * recalcularlo requeriría re-escanear todas las órdenes (operación
 * costosa); se actualiza en el próximo `reclassifyAllCustomers`.
 */
export async function adjustCustomerStatsOnCancellation(
  customerId: string,
  total: number,
): Promise<void> {
  try {
    const current = await db.customer.findUnique({
      where: { id: customerId },
      select: { totalSpent: true, ordersCount: true },
    })
    if (!current) {
      logger.warn('customer.adjustStatsOnCancellation customer-not-found', { customerId })
      return
    }
    const newTotalSpent = Math.max(0, (current.totalSpent ?? 0) - Math.round(total))
    const newOrdersCount = Math.max(0, (current.ordersCount ?? 0) - 1)
    await db.customer.update({
      where: { id: customerId },
      data: {
        totalSpent: newTotalSpent,
        ordersCount: newOrdersCount,
      },
    })
  } catch (err) {
    logger.error('customer.adjustStatsOnCancellation error', {
      customerId,
      total,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// ------------------------------------------------------------
// Convenience exports (para uso desde otros módulos)
// ------------------------------------------------------------

export {
  classifyCustomer,
  buildCustomerStats,
  calculateDaysSinceLastOrder,
  CLASSIFICATION_THRESHOLDS,
  CLASSIFICATION_LABELS,
  CLASSIFICATION_BADGE_CLASSES,
} from './classification'
