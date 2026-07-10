// ============================================================
// wompi.ts — Wompi payment provider adapter
// ============================================================
// Wompi (Bancolombia). Docs: https://docs.wompi.co/
// Modo real: POST /v1/transactions + checkout hosted por reference.
// Webhook validado con HMAC SHA256 (integritySecret).

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

const BASE_SANDBOX = 'https://sandbox.wompi.co/v1'
const BASE_PROD = 'https://production.wompi.co/v1'
const CHECKOUT = 'https://checkout.wompi.co/l'

export const WompiProvider: PaymentProviderPort = {
  name: 'WOMPI',

  async createPaymentLink(req: CreateLinkRequest, creds: ProviderCredentials): Promise<CreateLinkResponse> {
    if (isSandbox(creds)) return mockCreateLink('WOMPI', CHECKOUT, req)
    const res = await fetch(`${base(creds)}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creds.publicKey ?? ''}` },
      body: JSON.stringify({
        reference: req.reference,
        amount_in_cents: Math.round(req.amount * 100),
        currency: req.currency ?? 'COP',
        customer_email: req.customerEmail ?? undefined,
        redirect_url: req.redirectUrl ?? undefined,
      }),
    })
    if (!res.ok) throw new Error(`Wompi createPaymentLink HTTP ${res.status}`)
    const json = (await res.json()) as { data: { id: string | number; checkout_url?: string } }
    return {
      providerTxId: String(json.data.id),
      paymentUrl: json.data.checkout_url ?? `${CHECKOUT}/${json.data.id}`,
      status: 'PENDING',
    }
  },

  async getTransactionStatus(providerTxId: string, creds: ProviderCredentials): Promise<TxStatusResponse> {
    if (isSandbox(creds)) return mockStatus('WOMPI', providerTxId)
    const res = await fetch(`${base(creds)}/transactions/${providerTxId}`, {
      headers: { Authorization: `Bearer ${creds.publicKey ?? ''}` },
    })
    if (!res.ok) throw new Error(`Wompi getTransactionStatus HTTP ${res.status}`)
    const json = (await res.json()) as { data: { status: string; amount_in_cents?: number } }
    return {
      providerTxId,
      status: mapStatus(json.data.status),
      amount: json.data.amount_in_cents ? json.data.amount_in_cents / 100 : undefined,
    }
  },

  parseWebhook(body: unknown, headers: Record<string, string>, creds: ProviderCredentials): WebhookPayload | null {
    // Validación de firma HMAC (modo real).
    if (!isSandbox(creds) && creds.integritySecret) {
      const sig = headers['x-event-hash'] ?? headers['X-Event-Hash']
      const expected = crypto.createHmac('sha256', creds.integritySecret).update(JSON.stringify(body)).digest('hex')
      if (!verifySignature(sig, expected)) return null
    }
    if (isSandbox(creds)) return parseMockWebhook('WOMPI', body)

    const raw = body as Record<string, unknown>
    const data = (raw.data ?? raw.transaction ?? raw) as Record<string, unknown> | undefined
    const tx = (data?.transaction ?? data) as Record<string, unknown> | undefined
    return {
      provider: 'WOMPI',
      providerTxId: tx?.id != null ? String(tx.id) : null,
      reference: (tx?.reference as string) ?? null,
      status: mapStatus(String(tx?.status ?? '')),
      amount: typeof tx?.amount_in_cents === 'number' ? (tx.amount_in_cents as number) / 100 : undefined,
      raw: body,
    }
  },
}

function base(creds: ProviderCredentials): string {
  return creds.sandbox === false ? BASE_PROD : BASE_SANDBOX
}

function mapStatus(s: string): TxStatusResponse['status'] {
  const v = s.toUpperCase()
  if (v === 'APPROVED') return 'APPROVED'
  if (v === 'DECLINED' || v === 'ERROR') return 'DECLINED'
  if (v === 'REFUNDED' || v === 'VOIDED') return 'REFUNDED'
  return 'PENDING'
}
