// ============================================================
// provider.ts — Payment provider common interface (Port)
// ============================================================
// Contrato común que implementan todas las pasarelas de pago
// (Wompi, PayU, Mercado Pago, ePayco, Bold).
//
// Cada adapter es responsable de:
//   - createPaymentLink: generar un link de pago (checkout URL).
//   - getTransactionStatus: consultar el estado de una transacción.
//   - parseWebhook: validar + parsear el webhook entrante a un
//     formato neutral (WebhookPayload).
//
// Los adapters funcionan en modo "sandbox/mock" cuando no hay
// credenciales reales configuradas: generan URLs y IDs plausibles
// sin hacer llamadas de red reales. Al configurar credenciales
// reales (IntegrationSetting), el mismo código pasa a usar la API
// del proveedor sin cambiar la lógica de dominio.

import type { PaymentProvider as ProviderName } from '@/lib/validation'

// ------------------------------------------------------------
// Tipos neutralizados
// ------------------------------------------------------------

/** Estado neutral de una transacción de pago. */
export type NeutralTxStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'REFUNDED'

/** Solicitud para crear un link de pago. */
export interface CreateLinkRequest {
  /** Referencia interna única (se guarda en Transaction.reference). */
  reference: string
  /** Monto en la moneda indicada. */
  amount: number
  /** Código ISO 4217. Por defecto COP. */
  currency?: string
  /** Descripción visible para el cliente. */
  description: string
  /** Email del cliente (para notificación del proveedor). */
  customerEmail?: string | null
  /** Teléfono del cliente. */
  customerPhone?: string | null
  /** URL de retorno tras el pago. */
  redirectUrl?: string | null
}

/** Respuesta de creación de link de pago. */
export interface CreateLinkResponse {
  /** ID de la transacción en el proveedor. */
  providerTxId: string
  /** URL de checkout a enviar al cliente. */
  paymentUrl: string
  /** Estado inicial. */
  status: NeutralTxStatus
}

/** Respuesta de consulta de estado. */
export interface TxStatusResponse {
  providerTxId: string
  status: NeutralTxStatus
  /** Monto aprobado (si aplica). */
  amount?: number
}

/** Payload neutralizado de un webhook entrante. */
export interface WebhookPayload {
  /** Nombre del proveedor que originó el evento. */
  provider: ProviderName
  /** ID de transacción en el proveedor. */
  providerTxId: string | null
  /** Referencia interna (si viene en el webhook). */
  reference: string | null
  /** Estado reportado. */
  status: NeutralTxStatus
  /** Monto reportado (si viene). */
  amount?: number
  /** Evento crudo (para auditoría). */
  raw: unknown
}

/** Credenciales leídas de IntegrationSetting.config (JSON). */
export interface ProviderCredentials {
  apiKey?: string
  privateKey?: string
  publicKey?: string
  merchantId?: string
  accountId?: string
  secret?: string
  integritySecret?: string
  sandbox?: boolean
  [k: string]: string | boolean | undefined
}

// ------------------------------------------------------------
// Interfaz del Port
// ------------------------------------------------------------

export interface PaymentProviderPort {
  /** Nombre del proveedor. */
  readonly name: ProviderName
  /** Crea un link de pago. */
  createPaymentLink(
    req: CreateLinkRequest,
    creds: ProviderCredentials,
  ): Promise<CreateLinkResponse>
  /** Consulta el estado de una transacción. */
  getTransactionStatus(
    providerTxId: string,
    creds: ProviderCredentials,
  ): Promise<TxStatusResponse>
  /**
   * Valida y parsea un webhook entrante.
   * @returns payload neutralizado, o null si la firma es inválida.
   */
  parseWebhook(
    body: unknown,
    headers: Record<string, string>,
    creds: ProviderCredentials,
  ): WebhookPayload | null
}

// ------------------------------------------------------------
// Helpers compartidos
// ------------------------------------------------------------

/** True si las credenciales están vacías → modo sandbox/mock. */
export function isSandbox(creds: ProviderCredentials): boolean {
  if (creds.sandbox === true) return true
  return !creds.apiKey && !creds.privateKey && !creds.publicKey
}

/** Genera un ID de transacción plausible para modo mock. */
export function mockTxId(provider: string): string {
  const suffix = Math.random().toString(36).slice(2, 12).toUpperCase()
  return `${provider}-${suffix}`
}

/** Etiqueta legible del proveedor. */
export const PROVIDER_LABELS: Record<ProviderName, string> = {
  WOMPI: 'Wompi',
  PAYU: 'PayU',
  MERCADOPAGO: 'Mercado Pago',
  EPAYCO: 'ePayco',
  BOLD: 'Bold',
}

/** Colores Tailwind para badges de proveedor (sin azul/índigo). */
export const PROVIDER_BADGE_CLASSES: Record<ProviderName, string> = {
  WOMPI: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700',
  PAYU: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700',
  MERCADOPAGO: 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-700',
  EPAYCO: 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-700',
  BOLD: 'bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-700',
}
