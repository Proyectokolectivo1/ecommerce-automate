// ============================================================
// mercadopago.ts — Mercado Pago payment provider adapter
// ============================================================
// Mercado Pago. Docs: https://www.mercadopago.com.co/developers/es
// Modo real: POST /checkout/preferences → init_point (checkout URL).
// Webhook: topic=payment, id=payment_id; GET /v1/payments/:id.

import crypto from 'node:crypto'
import type {
  CreateLinkRequest,
  CreateLinkResponse,
  PaymentProviderPort,
  ProviderCredentials,
  TxStatusResponse,
  WebhookPayload,
} from './provider'
import { isSandbox } from './provider'
import { mockCreateLink, mockStatus, parseMockWebhook, verifySignature } from './sandbox'

const BASE = 'https://api.mercadopago.com'
const CHECKOUT = 'https://www.mercadopago.com.co/checkout/v1/redirect'

export const MercadoPagoProvider: PaymentProviderPort = {
  name: 'MERCADOPAGO',

  async createPaymentLink(req: CreateLinkRequest, creds: ProviderCredentials): Promise<CreateLinkResponse> {
    if (isSandbox(creds)) return mockCreateLink('MERCADOPAGO', CHECKOUT, req)
    const res = await fetch(`${BASE}/checkout/preferences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${creds.accessToken ?? creds.apiKey ?? ''}`,
      },
      body: JSON.stringify({
        items: [{ title: req.description, quantity: 1, unit_price: req.amount, currency_id: req.currency ?? 'COP' }],
        external_reference: req.reference,
        payer: req.customerEmail ? { email: req.customerEmail } : undefined,
        back_urls: req.redirectUrl ? { success: req.redirectUrl, failure: req.redirectUrl, pending: req.redirectUrl } : undefined,
      }),
    })
    if (!res.ok) throw new Error(`MercadoPago createPaymentLink HTTP ${res.status}`)
    const json = (await res.json()) as { id: string; init_point: string }
    return { providerTxId: json.id, paymentUrl: json.init_point, status: 'PENDING' }
  },

  async getTransactionStatus(providerTxId: string, creds: ProviderCredentials): Promise<TxStatusResponse> {
    if (isSandbox(creds)) return mockStatus('MERCADOPAGO', providerTxId)
    const res = await fetch(`${BASE}/v1/payments/${providerTxId}`, {
      headers: { Authorization: `Bearer ${creds.accessToken ?? creds.apiKey ?? ''}` },
    })
    if (!res.ok) throw new Error(`MercadoPago getTransactionStatus HTTP ${res.status}`)
    const json = (await res.json()) as { status: string; transaction_amount?: number }
    return { providerTxId, status: mapStatus(json.status), amount: json.transaction_amount }
  },

  parseWebhook(body: unknown, headers: Record<string, string>, creds: ProviderCredentials): WebhookPayload | null {
    // Mercado Pago valida con x-signature: hmac sha256 de data.id + x-request-id.
    if (!isSandbox(creds) && creds.secret) {
      const sig = headers['x-signature'] ?? headers['X-Signature'] ?? ''
      const requestId = headers['x-request-id'] ?? headers['X-Request-Id'] ?? ''
      const raw = body as Record<string, unknown>
      const dataId = String(raw.data?.id ?? raw.id ?? '')
      const expected = crypto.createHmac('sha256', creds.secret).update(`id:${dataId};request-id:${requestId}`).digest('hex')
      // MP envía "ts=...,v1=..."
      const v1 = sig.split(',').find((p) => p.startsWith('v1='))?.split('=')[1]
      if (!verifySignature(v1, expected)) return null
    }
    if (isSandbox(creds)) return parseMockWebhook('MERCADOPAGO', body)

    const raw = body as Record<string, unknown>
    return {
      provider: 'MERCADOPAGO',
      providerTxId: raw.data?.id != null ? String(raw.data.id) : null,
      reference: (raw.external_reference ?? null) as string | null,
      status: 'PENDING', // MP webhook solo avisa el topic; hay que hacer GET. El service lo resuelve.
      raw: body,
    }
  },
}

function mapStatus(s: string): TxStatusResponse['status'] {
  const v = String(s ?? '').toLowerCase()
  if (v === 'approved') return 'APPROVED'
  if (v === 'rejected' || v === 'cancelled') return 'DECLINED'
  if (v === 'refunded') return 'REFUNDED'
  return 'PENDING'
}
