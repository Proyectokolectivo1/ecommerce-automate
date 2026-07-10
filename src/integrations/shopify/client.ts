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
