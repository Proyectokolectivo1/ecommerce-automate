// ============================================================
// product.analytics.ts — Product analytics & ranking
// ============================================================
// Funciones de analítica de productos a partir de OrderItem.
// Excluye pedidos CANCELADO y DEVUELTO (igual que sales.metrics).
//
// Funciones exportadas:
//   - getStarProducts()     → top 5 por cantidad, ingreso y profit
//   - getProductRanking()   → ranking completo con filtros y paginación
//   - getProductStats()     → KPIs globales del catálogo

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { Prisma } from '@prisma/client'

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

/** Estados excluidos de las métricas de producto. */
const EXCLUDED_STATUSES = ['CANCELADO', 'DEVUELTO']

export interface ProductAggregated {
  id: string
  title: string
  sku: string | null
  variant: string | null
  imageUrl: string | null
  active: boolean
  price: number
  cost: number
  inventoryQty: number
  quantity: number
  revenue: number
  costTotal: number
  profit: number
  margin: number
  ordersCount: number
}

export interface StarProducts {
  topByQuantity: ProductAggregated[]
  topByRevenue: ProductAggregated[]
  topByProfit: ProductAggregated[]
}

export interface ProductRankingFilters {
  search?: string
  activeOnly?: boolean
  sortBy?: 'quantity' | 'revenue' | 'profit' | 'margin' | 'ordersCount'
  sortDir?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export interface ProductRankingResult {
  products: ProductAggregated[]
  total: number
}

export interface ProductStats {
  totalProducts: number
  activeProducts: number
  totalUnitsSold: number
  totalRevenue: number
  avgMargin: number
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

interface RawAggregate {
  id: string
  title: string
  sku: string | null
  variant: string | null
  imageUrl: string | null
  active: boolean
  price: number
  cost: number
  inventoryQty: number
  quantity: number
  revenue: number
  costTotal: number
  ordersCount: number
  orderIds: Set<string>
}

/**
 * Trae todos los OrderItem de pedidos no cancelados/devueltos y los
 * agrega por producto en memoria. Esta función es la base para las
 * 3 funciones de ranking y para stats.
 */
async function aggregateProductData(): Promise<Map<string, RawAggregate>> {
  const items = await db.orderItem.findMany({
    where: {
      order: { status: { notIn: EXCLUDED_STATUSES } },
    },
    select: {
      productId: true,
      title: true,
      sku: true,
      quantity: true,
      unitPrice: true,
      unitCost: true,
      total: true,
      orderId: true,
      product: {
        select: {
          id: true,
          title: true,
          sku: true,
          variant: true,
          imageUrl: true,
          active: true,
          price: true,
          cost: true,
          inventoryQty: true,
        },
      },
    },
  })

  const byProduct = new Map<string, RawAggregate>()
  for (const it of items) {
    const key = it.productId
    const entry =
      byProduct.get(key) ??
      {
        id: it.productId,
        title: it.product?.title ?? it.title,
        sku: it.product?.sku ?? it.sku ?? null,
        variant: it.product?.variant ?? null,
        imageUrl: it.product?.imageUrl ?? null,
        active: it.product?.active ?? true,
        price: it.product?.price ?? 0,
        cost: it.product?.cost ?? 0,
        inventoryQty: it.product?.inventoryQty ?? 0,
        quantity: 0,
        revenue: 0,
        costTotal: 0,
        ordersCount: 0,
        orderIds: new Set<string>(),
      }
    entry.quantity += it.quantity
    entry.revenue += it.total
    entry.costTotal += it.unitCost * it.quantity
    entry.orderIds.add(it.orderId)
    byProduct.set(key, entry)
  }
  return byProduct
}

/** Convierte un RawAggregate en el ProductAggregated final. */
function toAggregated(raw: RawAggregate): ProductAggregated {
  const revenue = round2(raw.revenue)
  const costTotal = round2(raw.costTotal)
  const profit = round2(revenue - costTotal)
  const margin = revenue > 0 ? round2((profit / revenue) * 100) : 0
  return {
    id: raw.id,
    title: raw.title,
    sku: raw.sku,
    variant: raw.variant,
    imageUrl: raw.imageUrl,
    active: raw.active,
    price: round2(raw.price),
    cost: round2(raw.cost),
    inventoryQty: raw.inventoryQty,
    quantity: raw.quantity,
    revenue,
    costTotal,
    profit,
    margin,
    ordersCount: raw.orderIds.size,
  }
}

// ------------------------------------------------------------
// Star products (top 5 por cantidad / ingreso / profit)
// ------------------------------------------------------------

export async function getStarProducts(limit = 5): Promise<StarProducts> {
  const safeLimit = Math.min(Math.max(limit, 1), 50)
  try {
    const byProduct = await aggregateProductData()
    const all = Array.from(byProduct.values()).map(toAggregated)

    const topByQuantity = [...all]
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .slice(0, safeLimit)
    const topByRevenue = [...all]
      .sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity)
      .slice(0, safeLimit)
    const topByProfit = [...all]
      .sort((a, b) => b.profit - a.profit || b.revenue - a.revenue)
      .slice(0, safeLimit)

    return { topByQuantity, topByRevenue, topByProfit }
  } catch (err) {
    logger.error('product.analytics.getStarProducts error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return { topByQuantity: [], topByRevenue: [], topByProfit: [] }
  }
}

// ------------------------------------------------------------
// Ranking con filtros + paginación
// ------------------------------------------------------------

export async function getProductRanking(
  filters: ProductRankingFilters = {},
): Promise<ProductRankingResult> {
  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 200)
  const offset = Math.max(filters.offset ?? 0, 0)
  const sortBy = filters.sortBy ?? 'revenue'
  const sortDir = filters.sortDir ?? 'desc'

  try {
    const byProduct = await aggregateProductData()
    let all = Array.from(byProduct.values()).map(toAggregated)

    // Filtro por search (title / sku)
    if (filters.search && filters.search.trim().length > 0) {
      const q = filters.search.trim().toLowerCase()
      all = all.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.sku !== null && p.sku.toLowerCase().includes(q)),
      )
    }

    // Filtro activeOnly
    if (filters.activeOnly) {
      all = all.filter((p) => p.active)
    }

    // Ordenamiento
    all.sort((a, b) => {
      const av = a[sortBy]
      const bv = b[sortBy]
      const diff = typeof av === 'number' && typeof bv === 'number' ? av - bv : 0
      return sortDir === 'asc' ? diff : -diff
    })

    const total = all.length
    const products = all.slice(offset, offset + limit)
    return { products, total }
  } catch (err) {
    logger.error('product.analytics.getProductRanking error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return { products: [], total: 0 }
  }
}

// ------------------------------------------------------------
// Stats globales del catálogo
// ------------------------------------------------------------

export async function getProductStats(): Promise<ProductStats> {
  try {
    const [totalProducts, activeProducts, catalogAgg] = await Promise.all([
      db.product.count(),
      db.product.count({ where: { active: true } }),
      db.product.aggregate({
        _sum: { inventoryQty: true },
      }),
    ])

    const byProduct = await aggregateProductData()
    let totalUnitsSold = 0
    let totalRevenue = 0
    let totalCost = 0
    for (const raw of byProduct.values()) {
      totalUnitsSold += raw.quantity
      totalRevenue += raw.revenue
      totalCost += raw.costTotal
    }
    const totalProfit = totalRevenue - totalCost
    const avgMargin = totalRevenue > 0 ? round2((totalProfit / totalRevenue) * 100) : 0

    return {
      totalProducts,
      activeProducts,
      totalUnitsSold,
      totalRevenue: round2(totalRevenue),
      avgMargin,
    }
  } catch (err) {
    logger.error('product.analytics.getProductStats error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return {
      totalProducts: 0,
      activeProducts: 0,
      totalUnitsSold: 0,
      totalRevenue: 0,
      avgMargin: 0,
    }
  }
}

// ------------------------------------------------------------
// Prisma type re-export (para uso externo si se necesita)
// ------------------------------------------------------------

export type { Prisma }
