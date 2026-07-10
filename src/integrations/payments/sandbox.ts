// ============================================================
// sandbox.ts — Shared sandbox/mock helpers for payment providers
// ============================================================
// Comportamiento mock común a todas las pasarelas cuando no hay
// credenciales reales. Genera URLs e IDs plausibles y permite
// simular confirmaciones de webhook para pruebas end-to-end.

import crypto from 'node:crypto'
import type {
  CreateLinkRequest,
  CreateLinkResponse,
  ProviderCredentials,
  TxStatusResponse,
  WebhookPayload,
} from './provider'
import { mockTxId } from './provider'

/**
 * Crea una respuesta mock de link de pago para el proveedor dado.
 * Usa una URL con formato plausible del checkout hosted del proveedor.
 */
export function mockCreateLink(
  provider: string,
  checkoutBaseUrl: string,
  req: CreateLinkRequest,
): CreateLinkResponse {
  const txId = mockTxId(provider)
  const ref = encodeURIComponent(req.reference)
  return {
    providerTxId: txId,
    paymentUrl: `${checkoutBaseUrl}/${txId}?ref=${ref}&amount=${req.amount}`,
    status: 'PENDING',
  }
}

/** Devuelve estado mock PENDING para una consulta. */
export function mockStatus(
  provider: string,
  providerTxId: string,
): TxStatusResponse {
  return { providerTxId, status: 'PENDING' }
}

/**
 * Intenta parsear un webhook mock. El body debe tener `provider` y
 * opcionalmente `status`, `reference`, `providerTxId`, `amount`.
 * Si `provider` coincide, retorna el payload neutral; si no, null.
 */
export function parseMockWebhook(
  expectedProvider: string,
  body: unknown,
): WebhookPayload | null {
  const raw = body as Record<string, unknown>
  const providerField = String(raw.provider ?? '').toUpperCase()
  if (providerField && providerField !== expectedProvider) return null
  return {
    provider: expectedProvider as WebhookPayload['provider'],
    providerTxId: raw.providerTxId != null ? String(raw.providerTxId) : null,
    reference: (raw.reference ?? null) as string | null,
    status: mapMockStatus(String(raw.status ?? 'PENDING')),
    amount: typeof raw.amount === 'number' ? raw.amount : undefined,
    raw: body,
  }
}

function mapMockStatus(s: string): WebhookPayload['status'] {
  const v = s.toUpperCase()
  if (v === 'APPROVED' || v === 'APPROVED') return 'APPROVED'
  if (v === 'DECLINED' || v === 'FAILED' || v === 'ERROR') return 'DECLINED'
  if (v === 'REFUNDED' || v === 'VOIDED') return 'REFUNDED'
  return 'PENDING'
}

/**
 * Compara dos firmas hex/base64 de forma constante (timing-safe).
 */
export function verifySignature(
  received: string | undefined,
  expected: string,
): boolean {
  if (!received) return false
  try {
    const a = Buffer.from(received)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/** True si el header `creds` marca sandbox explícitamente false. */
export function wantsProduction(creds: ProviderCredentials): boolean {
  return creds.sandbox === false
}
