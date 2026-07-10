// ============================================================
// /api/webhooks/payments — Receptor de webhooks de pasarelas
// ============================================================
// POST — recibe el webhook de cualquier pasarela, identifica el
// proveedor (por header `x-payment-provider` o por el campo
// `provider` del body en modo mock), lo parsea con el adapter
// correspondiente y confirma el pago de forma idempotente.
//
// No requiere auth (es un webhook entrante). La validación de
// firma la hace cada adapter en `parseWebhook`.

import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { getPaymentProvider, isSupportedProvider } from '@/integrations/payments/registry'
import { getProviderCredentials, confirmPaymentFromWebhook } from '@/modules/payments/payment.service'
import { db } from '@/lib/db'

function normalizeHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value
  })
  return out
}

export async function POST(request: Request) {
  const headers = normalizeHeaders(request.headers)

  // El proveedor puede venir en un header custom o en el body (modo mock).
  const providerHeader = headers['x-payment-provider'] ?? null

  let body: unknown
  let rawBody: string
  try {
    rawBody = await request.text()
    body = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    // Algunas pasarelas envían form-encoded.
    logger.warn('payments.webhook non-json-body', { contentType: headers['content-type'] })
    return NextResponse.json({ ok: false, error: 'Body inválido' }, { status: 400 })
  }

  const bodyObj = body as Record<string, unknown>
  const providerName =
    providerHeader ??
    (typeof bodyObj.provider === 'string' ? bodyObj.provider : null) ??
    inferProviderFromHeaders(headers)

  if (!providerName || !isSupportedProvider(providerName)) {
    logger.warn('payments.webhook unknown-provider', { providerHeader, providerName })
    return NextResponse.json(
      { ok: false, error: 'Proveedor no identificado o no soportado' },
      { status: 400 },
    )
  }

  const provider = providerName.toUpperCase() as 'WOMPI' | 'PAYU' | 'MERCADOPAGO' | 'EPAYCO' | 'BOLD'
  const adapter = getPaymentProvider(provider)

  // Lee credenciales (puede ser null → modo sandbox/mock).
  const creds = (await getProviderCredentials(provider)) ?? {}

  // Parsea + valida firma.
  const payload = adapter.parseWebhook(body, headers, creds)
  if (!payload) {
    logger.warn('payments.webhook invalid-signature', { provider })
    return NextResponse.json({ ok: false, error: 'Firma inválida' }, { status: 401 })
  }

  logger.info('payments.webhook received', {
    provider: payload.provider,
    providerTxId: payload.providerTxId,
    reference: payload.reference,
    status: payload.status,
  })

  // Confirma el pago (idempotente).
  try {
    const txn = await confirmPaymentFromWebhook(payload)
    if (!txn) {
      // Transacción no encontrada — igual respondemos 200 para que el
      // proveedor no reintente infinitamente, pero lo logueamos.
      logger.warn('payments.webhook transaction-not-found', {
        provider: payload.provider,
        providerTxId: payload.providerTxId,
      })
      return NextResponse.json({ ok: true, matched: false }, { status: 200 })
    }
    return NextResponse.json({ ok: true, matched: true, transactionId: txn.id, status: txn.status }, { status: 200 })
  } catch (err) {
    logger.error('payments.webhook processing-error', {
      provider: payload.provider,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ ok: false, error: 'Error al procesar webhook' }, { status: 500 })
  }
}

/** Heurística: algunos proveedores envían headers identificadores. */
function inferProviderFromHeaders(headers: Record<string, string>): string | null {
  if (headers['x-event-hash'] || headers['x-shopify-topic']?.includes('wompi')) return 'WOMPI'
  if (headers['x-signature']?.includes('v1=')) return 'MERCADOPAGO'
  if (headers['x-ref-payco']) return 'EPAYCO'
  if (headers['x-signature'] && !headers['x-event-hash']) return 'BOLD'
  if (headers['content-type']?.includes('form')) return 'PAYU'
  return null
}

/** GET útil para mostrar las URLs de webhook en el panel de integraciones. */
export async function GET() {
  const providers = await db.integrationSetting.findMany({
    where: {
      provider: { in: ['WOMPI', 'PAYU', 'MERCADOPAGO', 'EPAYCO', 'BOLD'] },
    },
    select: { provider: true, active: true },
  })
  return NextResponse.json({
    endpoint: '/api/webhooks/payments',
    method: 'POST',
    configuredProviders: providers,
    note: 'Envíe el header X-Payment-Provider o el campo "provider" en el body.',
  })
}
