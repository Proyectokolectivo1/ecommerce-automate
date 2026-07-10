// ============================================================
// bold.ts — Bold payment provider adapter
// ============================================================
// Bold (Colombia). Docs: https://docs.bold.co/
// Modo real: POST /payment/link/v1 (Payment Links API).
// Webhook: evento payment.status_update con firma HMAC.

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

const BASE = 'https://api.bold.co'
const CHECKOUT = 'https://checkout.bold.co'

export const BoldProvider: PaymentProviderPort = {
  name: 'BOLD',

  async createPaymentLink(req: CreateLinkRequest, creds: ProviderCredentials): Promise<CreateLinkResponse> {
    if (isSandbox(creds)) return mockCreateLink('BOLD', CHECKOUT, req)
    const res = await fetch(`${BASE}/payment/link/v1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${creds.apiKey ?? ''}`,
        'x-api-key': creds.publicKey ?? '',
      },
      body: JSON.stringify({
        amount: Math.round(req.amount),
        currency: req.currency ?? 'COP',
        reference: req.reference,
        description: req.description,
        customer_email: req.customerEmail ?? undefined,
        redirect_url: req.redirectUrl ?? undefined,
      }),
    })
    if (!res.ok) throw new Error(`Bold createPaymentLink HTTP ${res.status}`)
    const json = (await res.json()) as { id: string; payment_url: string }
    return { providerTxId: String(json.id), paymentUrl: json.payment_url, status: 'PENDING' }
  },

  async getTransactionStatus(providerTxId: string, creds: ProviderCredentials): Promise<TxStatusResponse> {
    if (isSandbox(creds)) return mockStatus('BOLD', providerTxId)
    const res = await fetch(`${BASE}/payment/v1/transactions/${providerTxId}`, {
      headers: { Authorization: `Bearer ${creds.apiKey ?? ''}` },
    })
    if (!res.ok) throw new Error(`Bold getTransactionStatus HTTP ${res.status}`)
    const json = (await res.json()) as { data: { status: string; amount: number } }
    return { providerTxId, status: mapStatus(json.data.status), amount: json.data.amount }
  },

  parseWebhook(body: unknown, headers: Record<string, string>, creds: ProviderCredentials): WebhookPayload | null {
    // Bold firma con HMAC SHA256 del body en header `x-signature`.
    if (!isSandbox(creds) && creds.secret) {
      const sig = headers['x-signature'] ?? headers['X-Signature'] ?? ''
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
      const expected = crypto.createHmac('sha256', creds.secret).update(bodyStr).digest('hex')
      if (!verifySignature(sig, expected)) return null
    }
    if (isSandbox(creds)) return parseMockWebhook('BOLD', body)

    const raw = body as Record<string, unknown>
    const data = (raw.data ?? raw) as Record<string, unknown> | undefined
    return {
      provider: 'BOLD',
      providerTxId: data?.id != null ? String(data.id) : null,
      reference: (data?.reference ?? null) as string | null,
      status: mapStatus(String(data?.status ?? raw.event ?? '')),
      amount: typeof data?.amount === 'number' ? (data.amount as number) : undefined,
      raw: body,
    }
  },
}

function mapStatus(s: string): TxStatusResponse['status'] {
  const v = String(s ?? '').toLowerCase()
  if (v === 'approved' || v === 'paid') return 'APPROVED'
  if (v === 'rejected' || v === 'failed') return 'DECLINED'
  if (v === 'refunded') return 'REFUNDED'
  return 'PENDING'
}
