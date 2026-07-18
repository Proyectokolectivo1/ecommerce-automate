// ============================================================
// /api/webhooks/simulate — Simulate webhook for testing
// ============================================================
// POST — simula el envío de un webhook (Shopify/pasarela/Mastershop)
// hacia el receptor correspondiente. Útil para probar el flujo
// completo sin necesidad de configurar integraciones reales.
//
// Body:
//   { source: 'SHOPIFY' | 'PAYMENTS' | 'MASTERSHOP', ...payload }
//
// El simulador genera payloads realistas según el source:
//   - SHOPIFY: pedido de prueba con items + customer + shipping_address
//   - PAYMENTS: confirmación de pago APPROVED para una transacción existente
//   - MASTERSHOP: callback de estado de guía (IN_TRANSIT/DELIVERED/RETURNED)

import { NextResponse } from 'next/server'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { db } from '@/lib/db'

interface SimulateRequest {
  source: 'SHOPIFY' | 'PAYMENTS' | 'MASTERSHOP'
  // Para SHOPIFY: opcional, genera datos si no se proveen
  shopifyOrderId?: number
  orderNumber?: number
  paymentMethod?: 'PREPAID' | 'COD'
  // Para PAYMENTS: necesita transactionId o providerTxId
  transactionId?: string
  paymentStatus?: 'APPROVED' | 'DECLINED' | 'PENDING'
  provider?: 'WOMPI' | 'PAYU' | 'MERCADOPAGO' | 'EPAYCO' | 'BOLD'
  // Para MASTERSHOP: necesita guideNumber
  guideNumber?: string
  guideStatus?: 'IN_TRANSIT' | 'DELIVERED' | 'RETURNED'
}

export async function POST(request: Request) {
  let user
  try {
    user = requireRole(await getCurrentUser(), 'ADMIN', 'GERENCIA', 'BODEGA', 'SERVICIO')
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 403
    return NextResponse.json({ error: (err as Error).message }, { status: statusCode })
  }

  let body: SimulateRequest
  try {
    body = (await request.json()) as SimulateRequest
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (!body.source || !['SHOPIFY', 'PAYMENTS', 'MASTERSHOP'].includes(body.source)) {
    return NextResponse.json({ error: 'source inválido (SHOPIFY | PAYMENTS | MASTERSHOP)' }, { status: 400 })
  }

  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

  try {
    let webhookUrl: string
    let payload: unknown
    let headers: Record<string, string>

    if (body.source === 'SHOPIFY') {
      webhookUrl = `${baseUrl}/api/webhooks/shopify`
      const orderId = body.shopifyOrderId ?? Math.floor(1000000000 + Math.random() * 9000000000)
      const orderNumber = body.orderNumber ?? Math.floor(10000 + Math.random() * 90000)
      const paymentMethod = body.paymentMethod ?? 'COD'
      payload = {
        id: orderId,
        order_number: orderNumber,
        email: `cliente.test+${orderNumber}@example.com`,
        phone: '+57 300 123 4567',
        note: `Pedido simulado para pruebas`,
        financial_status: paymentMethod === 'COD' ? 'pending' : 'paid',
        paymentMethod,
        total_price: '89900.00',
        total_shipping_price_set: { shop_money: { amount: '0.00' } },
        processed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        customer: {
          id: Math.floor(1000000000 + Math.random() * 9000000000),
          email: `cliente.test+${orderNumber}@example.com`,
          phone: '+57 300 123 4567',
          first_name: 'Cliente',
          last_name: 'Prueba',
        },
        shipping_address: {
          city: 'Bogotá',
          address1: 'Calle 100 #15-23, Apt 501',
          address2: null,
        },
        line_items: [
          {
            id: Math.floor(Math.random() * 1000000),
            product_id: Math.floor(Math.random() * 1000000),
            title: 'Producto de Prueba Simulado',
            variant_title: 'Variante A',
            sku: 'TEST-SIM-001',
            quantity: 1,
            price: '89900.00',
            grams: 500,
          },
        ],
      }
      headers = {
        'Content-Type': 'application/json',
        'x-shopify-topic': 'orders/create',
        'x-shopify-shop-domain': 'test-store.myshopify.com',
        'x-shopify-webhook-id': `sim-${Date.now()}`,
      }
    } else if (body.source === 'PAYMENTS') {
      webhookUrl = `${baseUrl}/api/webhooks/payments`
      // Busca una transacción real o usa datos del body
      let txn = null
      if (body.transactionId) {
        txn = await db.transaction.findUnique({ where: { id: body.transactionId } })
      }
      if (!txn) {
        // Busca la transacción más reciente PENDING
        txn = await db.transaction.findFirst({ where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' } })
      }
      if (!txn) {
        return NextResponse.json({
          error: 'No hay transacciones PENDING para simular. Crea un pedido COD y un link de pago primero.',
        }, { status: 404 })
      }
      const provider = (body.provider ?? txn.provider) as 'WOMPI' | 'PAYU' | 'MERCADOPAGO' | 'EPAYCO' | 'BOLD'
      const status = body.paymentStatus ?? 'APPROVED'
      payload = {
        provider,
        providerTxId: txn.providerTxId,
        reference: txn.reference,
        status,
        amount: txn.amount,
        raw: { simulated: true },
      }
      headers = {
        'Content-Type': 'application/json',
        'x-payment-provider': provider,
      }
    } else {
      // MASTERSHOP
      webhookUrl = `${baseUrl}/api/webhooks/mastershop`
      // Busca un envío real o usa el guideNumber del body
      let shipment = null
      if (body.guideNumber) {
        shipment = await db.shipment.findUnique({ where: { guideNumber: body.guideNumber } })
      }
      if (!shipment) {
        shipment = await db.shipment.findFirst({ where: { status: { in: ['CREATED', 'PRINTED', 'IN_TRANSIT'] } }, orderBy: { createdAt: 'desc' } })
      }
      if (!shipment || !shipment.guideNumber) {
        return NextResponse.json({
          error: 'No hay envíos para simular callback de Mastershop. Despacha un pedido primero.',
        }, { status: 404 })
      }
      const guideStatus = body.guideStatus ?? 'DELIVERED'
      payload = {
        guide_number: shipment.guideNumber,
        status: guideStatus,
        message: `Simulación: guía ${guideStatus.toLowerCase()}`,
        city: 'Bogotá',
        occurred_at: new Date().toISOString(),
      }
      headers = { 'Content-Type': 'application/json' }
    }

    // Envía el webhook al receptor interno
    const start = Date.now()
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    const durationMs = Date.now() - start
    const responseText = await res.text()

    let responseJson: unknown = null
    try {
      responseJson = JSON.parse(responseText)
    } catch {
      responseJson = responseText.slice(0, 500)
    }

    logger.info('webhook.simulate', {
      source: body.source,
      webhookUrl,
      status: res.status,
      durationMs,
      userId: user.id,
    })

    return NextResponse.json({
      ok: res.ok,
      simulated: true,
      source: body.source,
      webhookUrl,
      httpStatus: res.status,
      durationMs,
      response: responseJson,
      payloadSent: payload,
    })
  } catch (err) {
    logger.error('webhook.simulate error', {
      source: body.source,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Error al simular webhook' }, { status: 500 })
  }
}
