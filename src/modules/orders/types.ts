// ============================================================
// types.ts — Order module types
// ============================================================
// Tipos compartidos del módulo de pedidos. Incluye el estado del
// FSM, el tipo de Pedido con relaciones (resultado de consultas
// Prisma con `include`), la forma mínima del payload de un webhook
// de Shopify y los filtros de listado.

import type { Prisma } from '@prisma/client'
import type { ORDER_STATUSES } from '@/lib/validation'

// ------------------------------------------------------------
// FSM states
// ------------------------------------------------------------

/** Estado del pedido dentro del FSM de 8 estados. */
export type OrderStatus = (typeof ORDER_STATUSES)[number]

// ------------------------------------------------------------
// Order with relations — Tipos derivados de Prisma `include`
// ------------------------------------------------------------

/** Payload estándar de `include` para cargar un pedido con todas sus relaciones. */
export const ORDER_INCLUDE = {
  customer: true,
  items: {
    include: { product: true },
  },
  shipments: {
    include: { trackingEvents: true },
  },
  transactions: true,
  statusLogs: {
    orderBy: { createdAt: 'asc' as const },
  },
  printJobs: true,
} satisfies Prisma.OrderInclude

/** Pedido con todas sus relaciones (resultado de `findUnique({ include: ORDER_INCLUDE })`). */
export type OrderWithRelations = Prisma.OrderGetPayload<{
  include: typeof ORDER_INCLUDE
}>

/** Pedido ligero (con cliente + items + conteo de envíos) para listados. */
export type OrderListItem = Prisma.OrderGetPayload<{
  include: {
    customer: true
    items: true
    _count: { select: { shipments: true } }
  }
}>

// ------------------------------------------------------------
// Shopify webhook input (forma mínima)
// ------------------------------------------------------------

export interface ShopifyAddressInput {
  first_name?: string
  last_name?: string
  address1?: string
  address2?: string
  city?: string
  province?: string
  zip?: string
  country?: string
  phone?: string
}

export interface ShopifyCustomerInput {
  id?: number | string
  email?: string
  phone?: string
  first_name?: string
  last_name?: string
  note?: string
}

export interface ShopifyLineItemInput {
  id?: number | string
  variant_id?: number | string | null
  product_id?: number | string | null
  sku?: string | null
  title?: string
  variant_title?: string | null
  quantity?: number
  price?: string | number
  grams?: number
  requires_shipping?: boolean
}

export interface ShopifyOrderInput {
  id: number | string
  order_number: number | string
  name?: string
  email?: string
  phone?: string
  financial_status?: string
  fulfillment_status?: string
  currency?: string
  total_price?: string | number
  subtotal_price?: string | number
  total_shipping_price_set?: {
    shop_money?: { amount?: string | number }
  }
  customer?: ShopifyCustomerInput | null
  shipping_address?: ShopifyAddressInput | null
  billing_address?: ShopifyAddressInput | null
  line_items?: ShopifyLineItemInput[]
  note?: string | null
  processed_at?: string
  created_at?: string
  // Marcador propio (en caso de no venir de Shopify nativo).
  paymentMethod?: 'PREPAID' | 'COD'
}

// ------------------------------------------------------------
// Order list filters
// ------------------------------------------------------------

export interface OrderFilters {
  status?: string
  search?: string
  paymentMethod?: string
  limit?: number
  offset?: number
}
