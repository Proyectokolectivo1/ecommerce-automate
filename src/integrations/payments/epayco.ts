// ============================================================
// epayco.ts — ePayco payment provider adapter
// ============================================================
// ePayco (Colombia). Docs: https://docs.epayco.co/
// Modo real: POST /payment/v1/charge/create → respuesta con urlpago.
// Webhook validado con filtro x_ref_payco + firma sha256.

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

const BASE = 'https://api.secure.payco.lat'
const CHECKOUT = 'https://checkout.payco.co'
const BASE_TEST = 'https://api.secure.payco.lat' // ePayco usa el mismo host con public_key test

export const EpaycoProvider: PaymentProviderPort = {
  name: 'EPAYCO',

  async createPaymentLink(req: CreateLinkRequest, creds: ProviderCredentials): Promise<CreateLinkResponse> {
    if (isSandbox(creds)) return mockCreateLink('EPAYCO', CHECKOUT, req)
    const res = await fetch(`${base(creds)}/payment/v1/charge/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        public_key: creds.publicKey ?? '',
        amount: String(req.amount),
        currency: req.currency ?? 'COP',
        invoice: req.reference,
        description: req.description,
        email_bill: req.customerEmail ?? undefined,
        url_response: req.redirectUrl ?? undefined,
        url_confirmation: req.redirectUrl ?? undefined,
      }),
    })
    if (!res.ok) throw new Error(`ePayco createPaymentLink HTTP ${res.status}`)
    const json = (await res.json()) as { data: { ref_payco: string; urlpasarela?: string } }
    return {
      providerTxId: String(json.data.ref_payco),
      paymentUrl: json.data.urlpasarela ?? `${CHECKOUT}/payment/${json.data.ref_payco}`,
      status: 'PENDING',
    }
  },

  async getTransactionStatus(providerTxId: string, creds: ProviderCredentials): Promise<TxStatusResponse> {
    if (isSandbox(creds)) return mockStatus('EPAYCO', providerTxId)
    const res = await fetch(`${base(creds)}/payment/v1/transaction/${providerTxId}?public_key=${creds.publicKey ?? ''}`)
    if (!res.ok) throw new Error(`ePayco getTransactionStatus HTTP ${res.status}`)
    const json = (await res.json()) as { data: { estado: string; valor: string } }
    return { providerTxId, status: mapStatus(json.data.estado), amount: Number(json.data.valor) }
  },

  parseWebhook(body: unknown, _headers: Record<string, string>, creds: ProviderCredentials): WebhookPayload | null {
    if (isSandbox(creds)) return parseMockWebhook('EPAYCO', body)
    const raw = body as Record<string, unknown>
    // ePayco firma con sha256(p_cust_id_cliente^p_id_invoice^p_key)
    if (creds.secret && raw.x_signature) {
      const expected = crypto
        .createHash('sha256')
        .update(`${creds.merchantId}^${raw.x_ref_payco ?? ''}^${creds.secret}`)
        .digest('hex')
      if (!verifySignature(raw.x_signature as string, expected)) return null
    }
    return {
      provider: 'EPAYCO',
      providerTxId: raw.x_ref_payco != null ? String(raw.x_ref_payco) : null,
      reference: (raw.x_id_invoice ?? null) as string | null,
      status: mapStatus(String(raw.x_cod_response ?? raw.x_transaction_state ?? '')),
      amount: raw.x_amount != null ? Number(raw.x_amount) : undefined,
      raw: body,
    }
  },
}

function base(creds: ProviderCredentials): string {
  return creds.sandbox === false ? BASE : BASE_TEST
}

function mapStatus(s: string): TxStatusResponse['status'] {
  const v = String(s ?? '').toLowerCase()
  // ePayco: 1=Aceptada, 2=Rechazada, 3=Pendiente, 4=Fallida
  if (v === '1' || v === 'aceptada' || v === 'aprobada') return 'APPROVED'
  if (v === '2' || v === 'rechazada' || v === '4' || v === 'fallida') return 'DECLINED'
  if (v === 'reembolsada') return 'REFUNDED'
  return 'PENDING'
}
