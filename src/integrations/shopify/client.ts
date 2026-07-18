// ============================================================
// client.ts — Shopify Admin API client + webhook verification
// ============================================================
// Cliente para la Shopify Admin API (REST) y verificación de
// webhooks (HMAC SHA256 con el API secret compartido).
//
// Funciona en modo mock cuando no hay credenciales configuradas.
// Modo real: GET/POST a https://{shop}.myshopify.com/admin/api/2024-07/{resource}.json

import crypto from 'node:crypto'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

export interface ShopifyConfig {
  shop: string          // e.g. "mi-tienda.myshopify.com"
  accessToken: string   // Admin API access token
  apiSecret: string     // webhook shared secret (App Secret)
  apiKey?: string
}

export interface ShopifyOrder {
  id: number
  order_number: number
  email?: string
  phone?: string
  note?: string
  financial_status?: string
  paymentMethod?: 'PREPAID' | 'COD'
  total_price?: string
  total_shipping_price_set?: { shop_money?: { amount?: string } }
  processed_at?: string
  created_at?: string
  customer?: {
    id?: number
    email?: string
    phone?: string
    first_name?: string
    last_name?: string
  }
  shipping_address?: {
    city?: string
    address1?: string
    address2?: string
  }
  line_items?: Array<{
    id?: number
    product_id?: number
    title?: string
    variant_title?: string
    sku?: string
    quantity?: number
    price?: string
    grams?: number
  }>
}

/** Lee la config de Shopify desde IntegrationSetting. */
export async function getShopifyConfig(): Promise<ShopifyConfig | null> {
  const setting = await db.integrationSetting.findUnique({
    where: { provider: 'SHOPIFY' },
  })
  if (!setting || !setting.active) return null
  try {
    const cfg = JSON.parse(setting.config) as ShopifyConfig
    if (!cfg.shop || !cfg.accessToken) return null
    return cfg
  } catch {
    logger.warn('shopify.config parse-error')
    return null
  }
}

/** True si Shopify no está configurado (modo mock/sin integración). */
export async function isShopifyConfigured(): Promise<boolean> {
  return (await getShopifyConfig()) !== null
}

/** Obtiene un pedido de Shopify por ID (Admin API REST). */
export async function getShopifyOrder(orderId: number | string, cfg: ShopifyConfig): Promise<ShopifyOrder | null> {
  const url = `https://${cfg.shop}/admin/api/2024-07/orders/${orderId}.json`
  const res = await fetch(url, {
    headers: { 'X-Shopify-Access-Token': cfg.accessToken },
  })
  if (!res.ok) {
    logger.error('shopify.getOrder failed', { orderId, status: res.status })
    return null
  }
  const json = (await res.json()) as { order: ShopifyOrder }
  return json.order
}

/** Actualiza el note de un pedido en Shopify. */
export async function updateShopifyOrderNote(
  orderId: number | string,
  note: string,
  cfg: ShopifyConfig,
): Promise<boolean> {
  const url = `https://${cfg.shop}/admin/api/2024-07/orders/${orderId}.json`
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'X-Shopify-Access-Token': cfg.accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ order: { id: Number(orderId), note } }),
  })
  if (!res.ok) {
    logger.error('shopify.updateNote failed', { orderId, status: res.status })
    return false
  }
  return true
}

/**
 * Verifica la firma HMAC SHA256 de un webhook de Shopify.
 * @param rawBody - body crudo como string (importante: no parseado).
 * @param hmac - header `X-Shopify-Hmac-Sha256` (base64).
 * @param apiSecret - App Secret de la app de Shopify.
 */
export function verifyShopifyWebhook(
  rawBody: string,
  hmac: string | null,
  apiSecret: string,
): boolean {
  if (!hmac || !apiSecret) return false
  const computed = crypto.createHmac('sha256', apiSecret).update(rawBody, 'utf8').digest('base64')
  try {
    const a = Buffer.from(hmac)
    const b = Buffer.from(computed)
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ============================================================
// Inventory sync — funciones para sincronizar inventario
// ============================================================

export interface ShopifyInventoryLevel {
  inventory_item_id: number
  location_id: number
  available: number | null
}

/**
 * Obtiene los niveles de inventario desde Shopify.
 * GET /admin/api/2024-07/inventory_levels.json
 */
export async function getShopifyInventoryLevels(
  cfg: ShopifyConfig,
): Promise<ShopifyInventoryLevel[]> {
  try {
    const url = `https://${cfg.shop}/admin/api/2024-07/inventory_levels.json?limit=250`
    const res = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': cfg.accessToken },
    })
    if (!res.ok) {
      logger.error('shopify.getInventoryLevels failed', { status: res.status })
      return []
    }
    const json = (await res.json()) as { inventory_levels: ShopifyInventoryLevel[] }
    return json.inventory_levels ?? []
  } catch (err) {
    logger.error('shopify.getInventoryLevels error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

/**
 * Obtiene los productos con sus inventory_item_id desde Shopify.
 * GET /admin/api/2024-07/products.json?fields=id,variants
 */
export async function getShopifyProductInventoryIds(
  cfg: ShopifyConfig,
): Promise<Map<string, number>> {
  try {
    const url = `https://${cfg.shop}/admin/api/2024-07/products.json?fields=id,variants&limit=250`
    const res = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': cfg.accessToken },
    })
    if (!res.ok) {
      logger.error('shopify.getProductInventoryIds failed', { status: res.status })
      return new Map()
    }
    const json = (await res.json()) as {
      products: Array<{
        id: number
        variants: Array<{ inventory_item_id: number }>
      }>
    }
    const map = new Map<string, number>()
    for (const product of json.products ?? []) {
      if (product.variants?.[0]?.inventory_item_id) {
        map.set(String(product.id), product.variants[0].inventory_item_id)
      }
    }
    return map
  } catch (err) {
    logger.error('shopify.getProductInventoryIds error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return new Map()
  }
}

// ============================================================
// Fulfillment — actualizar Shopify con guía + tracking
// ============================================================

export interface ShopifyFulfillmentInput {
  orderId: number | string
  guideNumber: string
  carrier: string
  trackingUrl?: string
  notifyCustomer?: boolean
}

/**
 * Crea un fulfillment en Shopify (registra la guía + tracking).
 * POST /admin/api/2024-07/orders/{order_id}/fulfillments.json
 */
export async function createShopifyFulfillment(
  input: ShopifyFulfillmentInput,
  cfg: ShopifyConfig,
): Promise<boolean> {
  try {
    const url = `https://${cfg.shop}/admin/api/2024-07/orders/${input.orderId}/fulfillments.json`
    const body: Record<string, unknown> = {
      fulfillment: {
        tracking_number: input.guideNumber,
        tracking_company: input.carrier,
        tracking_url: input.trackingUrl ?? '',
        notify_customer: input.notifyCustomer ?? true,
      },
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': cfg.accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errText = await res.text()
      logger.error('shopify.createFulfillment failed', {
        orderId: input.orderId,
        status: res.status,
        errText: errText.slice(0, 200),
      })
      return false
    }

    logger.info('shopify.createFulfillment success', {
      orderId: input.orderId,
      guideNumber: input.guideNumber,
      carrier: input.carrier,
    })
    return true
  } catch (err) {
    logger.error('shopify.createFulfillment error', {
      orderId: input.orderId,
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

// ============================================================
// Tags — añadir etiquetas a pedidos
// ============================================================

/**
 * Añade un tag a un pedido de Shopify.
 */
export async function addShopifyOrderTag(
  orderId: number | string,
  tag: string,
  cfg: ShopifyConfig,
): Promise<boolean> {
  try {
    const getUrl = `https://${cfg.shop}/admin/api/2024-07/orders/${orderId}.json?fields=id,tags`
    const getRes = await fetch(getUrl, {
      headers: { 'X-Shopify-Access-Token': cfg.accessToken },
    })
    if (!getRes.ok) {
      logger.error('shopify.addTag getOrder failed', { orderId, status: getRes.status })
      return false
    }
    const getOrder = (await getRes.json()) as { order: { tags?: string } }
    const currentTags = getOrder.order.tags ?? ''

    const existingTags = currentTags.split(',').map((t) => t.trim())
    if (existingTags.includes(tag)) {
      logger.info('shopify.addTag already-exists', { orderId, tag })
      return true
    }

    const newTags = [...existingTags.filter(Boolean), tag].join(', ')
    const updateUrl = `https://${cfg.shop}/admin/api/2024-07/orders/${orderId}.json`
    const updateRes = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': cfg.accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ order: { id: Number(orderId), tags: newTags } }),
    })

    if (!updateRes.ok) {
      logger.error('shopify.addTag updateOrder failed', { orderId, status: updateRes.status })
      return false
    }

    logger.info('shopify.addTag success', { orderId, tag, newTags })
    return true
  } catch (err) {
    logger.error('shopify.addTag error', {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}
