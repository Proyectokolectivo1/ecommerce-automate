// ============================================================
// /api/webhooks/shopify — Receptor de webhooks de Shopify
// ============================================================
// POST — recibe el payload de un pedido de Shopify, lo importa con
// `createOrderFromShopify` (idempotente por shopifyId) y responde 200.
//
// Notas:
//   - No requiere auth (es un webhook entrante).
//   - En producción se debería validar el header `X-Shopify-Hmac-Sha256`
//     con el secreto compartido. Para el demo se omite.
//   - Se loguea la recepción del webhook para auditoría.

import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import {
  createOrderFromShopify,
  OrderTransitionError,
} from '@/modules/orders/order.service'
import type { ShopifyOrderInput } from '@/modules/orders/types'

export async function POST(request: Request) {
  // --- Headers de Shopify (para logging) ---------------------------
  const shopifyTopic = request.headers.get('x-shopify-topic') ?? null
  const shopifyDomain = request.headers.get('x-shopify-shop-domain') ?? null
  const shopifyHmac = request.headers.get('x-shopify-hmac-sha256') ?? null
  const webhookId = request.headers.get('x-shopify-webhook-id') ?? null

  logger.info('shopify.webhook received', {
    topic: shopifyTopic,
    domain: shopifyDomain,
    webhookId,
    hmacPresent: Boolean(shopifyHmac),
  })

  // --- Parse body ---------------------------------------------------
  let payload: ShopifyOrderInput
  try {
    payload = (await request.json()) as ShopifyOrderInput
  } catch {
    logger.warn('shopify.webhook invalid-json', { webhookId })
    return NextResponse.json(
      { ok: false, error: 'JSON inválido' },
      { status: 400 },
    )
  }

  // --- Validación mínima -------------------------------------------
  if (!payload?.id || !payload?.order_number) {
    logger.warn('shopify.webhook missing-fields', {
      hasId: Boolean(payload?.id),
      hasOrderNumber: Boolean(payload?.order_number),
    })
    return NextResponse.json(
      { ok: false, error: 'Faltan campos requeridos (id, order_number)' },
      { status: 400 },
    )
  }

  // --- Importación idempotente -------------------------------------
  try {
    const { order, created } = await createOrderFromShopify(payload)
    logger.info('shopify.webhook processed', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      shopifyId: payload.id,
      created,
    })
    return NextResponse.json(
      { ok: true, orderId: order.id, created },
      { status: 200 },
    )
  } catch (err) {
    // OrderTransitionError no debería ocurrir aquí porque no
    // ejecutamos transiciones, pero lo dejamos por si acaso.
    if (err instanceof OrderTransitionError) {
      logger.error('shopify.webhook transition-error', {
        shopifyId: payload.id,
        error: err.message,
      })
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 409 },
      )
    }
    logger.error('shopify.webhook processing-error', {
      shopifyId: payload.id,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { ok: false, error: 'Error al procesar webhook' },
      { status: 500 },
    )
  }
}
