// ============================================================
// returns.metrics.ts — Detailed returns analytics
// ============================================================
// Métricas detalladas de devoluciones: tasa, valor perdido, top
// productos/ciudades y listado con filtros.
//
// Funciones exportadas:
//   - getReturnsDetailedMetrics() → KPIs + top arrays
//   - getReturnsList(filters)     → listado paginado de devoluciones

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { Prisma } from '@prisma/client'

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export interface ReturnsTopItem {
  id: string
  label: string
  count: number
  lostValue: number
}

export interface ReturnsDetailedMetrics {
  count: number
  totalOrders: number
  rate: number
  lostValue: number
  topProduct: string | null
  topCity: string | null
  topProducts: ReturnsTopItem[]
  topCities: ReturnsTopItem[]
}

export interface ReturnsListFilters {
  search?: string
  status?: string // RECEIVED | INSPECTED | RESTOCKED | DISCARDED
  city?: string
  productId?: string
  limit?: number
  offset?: number
}

export interface ReturnListItem {
  id: string
  orderId: string
  orderNumber: string
  orderStatus: string
  productId: string | null
  productTitle: string | null
  productSku: string | null
  reason: string | null
  city: string | null
  lostValue: number
  status: string
  createdAt: Date
}

export interface ReturnsListResult {
  returns: ReturnListItem[]
  total: number
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// ------------------------------------------------------------
// Detailed metrics
// ------------------------------------------------------------

export async function getReturnsDetailedMetrics(): Promise<ReturnsDetailedMetrics> {
  try {
    const [returns, totalOrders] = await Promise.all([
      db.return.findMany({
        select: {
          id: true,
          lostValue: true,
          productId: true,
          city: true,
          product: { select: { id: true, title: true } },
          order: { select: { id: true, city: true } },
        },
      }),
      db.order.count(),
    ])

    const count = returns.length
    const rate = totalOrders > 0 ? round2((count / totalOrders) * 100) : 0
    const lostValue = round2(returns.reduce((s, r) => s + (r.lostValue ?? 0), 0))

    // Top productos
    const productMap = new Map<string, { title: string; count: number; lostValue: number }>()
    for (const r of returns) {
      const pid = r.productId
      if (!pid) continue
      const title = r.product?.title ?? 'Producto desconocido'
      const entry = productMap.get(pid) ?? { title, count: 0, lostValue: 0 }
      entry.count += 1
      entry.lostValue += r.lostValue ?? 0
      productMap.set(pid, entry)
    }
    const topProducts: ReturnsTopItem[] = Array.from(productMap.entries())
      .map(([id, v]) => ({
        id,
        label: v.title,
        count: v.count,
        lostValue: round2(v.lostValue),
      }))
      .sort((a, b) => b.count - a.count || b.lostValue - a.lostValue)
      .slice(0, 5)
    const topProduct = topProducts.length > 0 ? topProducts[0].label : null

    // Top ciudades (city del Return con fallback al city del Order)
    const cityMap = new Map<string, { count: number; lostValue: number }>()
    for (const r of returns) {
      const city = (r.city ?? r.order?.city ?? '').toString().trim()
      if (!city) continue
      const entry = cityMap.get(city) ?? { count: 0, lostValue: 0 }
      entry.count += 1
      entry.lostValue += r.lostValue ?? 0
      cityMap.set(city, entry)
    }
    const topCities: ReturnsTopItem[] = Array.from(cityMap.entries())
      .map(([city, v]) => ({
        id: city,
        label: city,
        count: v.count,
        lostValue: round2(v.lostValue),
      }))
      .sort((a, b) => b.count - a.count || b.lostValue - a.lostValue)
      .slice(0, 5)
    const topCity = topCities.length > 0 ? topCities[0].label : null

    return {
      count,
      totalOrders,
      rate,
      lostValue,
      topProduct,
      topCity,
      topProducts,
      topCities,
    }
  } catch (err) {
    logger.error('returns.metrics.detailed error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return {
      count: 0,
      totalOrders: 0,
      rate: 0,
      lostValue: 0,
      topProduct: null,
      topCity: null,
      topProducts: [],
      topCities: [],
    }
  }
}

// ------------------------------------------------------------
// List with filters
// ------------------------------------------------------------

export async function getReturnsList(
  filters: ReturnsListFilters = {},
): Promise<ReturnsListResult> {
  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 200)
  const offset = Math.max(filters.offset ?? 0, 0)

  const where: Prisma.ReturnWhereInput = {}
  if (filters.status && filters.status !== 'ALL') {
    where.status = filters.status
  }
  if (filters.productId) {
    where.productId = filters.productId
  }
  if (filters.city && filters.city !== 'ALL') {
    // El campo `city` en Return puede ser null — buscamos también en Order.city.
    where.OR = [
      { city: filters.city },
      { order: { city: filters.city } },
    ]
  }
  if (filters.search && filters.search.trim().length > 0) {
    const q = filters.search.trim()
    where.OR = [
      ...(where.OR ?? []),
      { order: { orderNumber: { contains: q } } },
      { product: { title: { contains: q } } },
      { product: { sku: { contains: q } } },
      { reason: { contains: q } },
    ]
  }

  try {
    const [rows, total] = await Promise.all([
      db.return.findMany({
        where,
        include: {
          order: { select: { id: true, orderNumber: true, status: true, city: true } },
          product: { select: { id: true, title: true, sku: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.return.count({ where }),
    ])

    const returns: ReturnListItem[] = rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      orderNumber: r.order?.orderNumber ?? '',
      orderStatus: r.order?.status ?? '',
      productId: r.productId,
      productTitle: r.product?.title ?? null,
      productSku: r.product?.sku ?? null,
      reason: r.reason,
      city: r.city ?? r.order?.city ?? null,
      lostValue: round2(r.lostValue ?? 0),
      status: r.status,
      createdAt: r.createdAt,
    }))

    return { returns, total }
  } catch (err) {
    logger.error('returns.metrics.list error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return { returns: [], total: 0 }
  }
}
