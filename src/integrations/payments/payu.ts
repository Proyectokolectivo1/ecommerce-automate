// ============================================================
// payu.ts — PayU payment provider adapter
// ============================================================
// PayU Latam. Docs: https://developers.payulatam.com/latam/
// Modo real: POST /payments-api/4.0/service.cgi (SUBMIT_TRANSACTION).
// Webhook: POST form-encoded con state_pol (4=APPROVED, 6=DECLINED).

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
import { mockCreateLink, mockStatus, parseMockWebhook } from './sandbox'

const BASE = 'https://api.payulatam.com'
const BASE_TEST = 'https://sandbox.api.payulatam.com'
const CHECKOUT = 'https://checkout.payulatam.com/ppp-web-gateway-payu'

export const PayUProvider: PaymentProviderPort = {
  name: 'PAYU',

  async createPaymentLink(req: CreateLinkRequest, creds: ProviderCredentials): Promise<CreateLinkResponse> {
    if (isSandbox(creds)) return mockCreateLink('PAYU', CHECKOUT, req)
    const apiKey = creds.apiKey ?? ''
    const merchantId = creds.merchantId ?? ''
    const res = await fetch(`${base(creds)}/payments-api/4.0/service.cgi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        test: false,
        language: 'es',
        command: 'SUBMIT_TRANSACTION',
        merchant: { apiKey, apiLogin: creds.publicKey ?? '' },
        transaction: {
          order: {
            accountId: creds.accountId ?? '',
            referenceCode: req.reference,
            description: req.description,
            language: 'es',
            signature: md5(`${apiKey}~${merchantId}~${req.reference}~${req.amount}~${req.currency ?? 'COP'}`),
            additionalValues: { TX_VALUE: { value: req.amount, currency: req.currency ?? 'COP' } },
            buyer: { emailAddress: req.customerEmail ?? undefined },
          },
          type: 'AUTHORIZATION_AND_CAPTURE',
          paymentMethod: 'PSE',
          expirationDate: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          returnURL: req.redirectUrl ?? undefined,
        },
      }),
    })
    if (!res.ok) throw new Error(`PayU createPaymentLink HTTP ${res.status}`)
    const json = (await res.json()) as { transactionResponse: { transactionId: string; extraParameters?: { BANK_URL?: string } } }
    return {
      providerTxId: String(json.transactionResponse.transactionId),
      paymentUrl: json.transactionResponse.extraParameters?.BANK_URL ?? '',
      status: 'PENDING',
    }
  },

  async getTransactionStatus(providerTxId: string, creds: ProviderCredentials): Promise<TxStatusResponse> {
    if (isSandbox(creds)) return mockStatus('PAYU', providerTxId)
    const res = await fetch(`${base(creds)}/reports-api/4.0/general.cgi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        test: false,
        language: 'es',
        command: 'TRANSACTION_RESPONSE_DETAIL',
        merchant: { apiLogin: creds.publicKey ?? '', apiKey: creds.apiKey ?? '' },
        details: { transactionId: providerTxId },
      }),
    })
    if (!res.ok) throw new Error(`PayU getTransactionStatus HTTP ${res.status}`)
    const json = (await res.json()) as { result: { state: string } }
    return { providerTxId, status: mapStatus(json.result.state) }
  },

  parseWebhook(body: unknown, _headers: Record<string, string>, creds: ProviderCredentials): WebhookPayload | null {
    if (isSandbox(creds)) return parseMockWebhook('PAYU', body)
    const raw = body as Record<string, unknown>
    return {
      provider: 'PAYU',
      providerTxId: raw.transactionId != null ? String(raw.transactionId) : null,
      reference: (raw.reference_sale ?? raw.referenceCode ?? null) as string | null,
      status: mapStatus(String(raw.transactionState ?? raw.state_pol ?? '')),
      amount: typeof raw.value === 'string' ? Number(raw.value) : (raw.value as number | undefined),
      raw: body,
    }
  },
}

function base(creds: ProviderCredentials): string {
  return creds.sandbox === false ? BASE : BASE_TEST
}

function mapStatus(s: string): TxStatusResponse['status'] {
  const v = String(s ?? '').toUpperCase()
  // PayU: 4=APPROVED, 5=EXPIRED, 6=DECLINED, 7=PENDING
  if (v === '4' || v === 'APPROVED') return 'APPROVED'
  if (v === '6' || v === 'DECLINED' || v === '5') return 'DECLINED'
  if (v === 'REFUNDED') return 'REFUNDED'
  return 'PENDING'
}

function md5(s: string): string {
  return crypto.createHash('md5').update(s).digest('hex')
}
