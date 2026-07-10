// ============================================================
// payment.service.ts — Payment domain service
// ============================================================
// Orquesta la creación de links de pago, el guardado de
// transacciones y la confirmación idempotente vía webhook.
//
// Usa el registry de providers para resolver el adapter correcto
// y lee las credenciales desde IntegrationSetting.

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { audit } from '@/lib/audit'
import { getPaymentProvider } from '@/integrations/payments/registry'
import type {
  ProviderCredentials,
  WebhookPayload,
  NeutralTxStatus,
} from '@/integrations/payments/provider'
import type { PaymentProvider } from '@/lib/validation'
import { transitionStatus, OrderNotFoundError } from '@/modules/orders/order.service'

// ------------------------------------------------------------
// Config loading
// ------------------------------------------------------------

/** Lee las credenciales de un proveedor desde IntegrationSetting. */
export async function getProviderCredentials(
  provider: PaymentProvider,
): Promise<ProviderCredentials | null> {
  const setting = await db.integrationSetting.findUnique({
    where: { provider },
  })
  if (!setting || !setting.active) return null
  try {
    return JSON.parse(setting.config) as ProviderCredentials
  } catch {
    logger.warn('payment.config parse-error', { provider })
    return null
  }
}

// ------------------------------------------------------------
// Create payment link (for COD transport cost)
// ------------------------------------------------------------

export interface CreatePaymentLinkInput {
  orderId: string
  orderNumber: string
  amount: number
  description: string
  customerEmail?: string | null
  customerPhone?: string | null
  provider: PaymentProvider
  redirectUrl?: string | null
}

/**
 * Crea un link de pago para el transporte (COD) y guarda la transacción.
 * - Genera una `reference` única: TR-{orderNumber}-{timestamp}.
 * - Llama al adapter del proveedor.
 * - Guarda la Transaction con status PENDING.
 * - Marca en el Order el codPaymentLink + codPaymentId.
 */
export async function createTransportPaymentLink(
  input: CreatePaymentLinkInput,
): Promise<{ transaction: TransactionResult; paymentUrl: string }> {
  const creds = await getProviderCredentials(input.provider)
  if (!creds) {
    throw new PaymentConfigError(
      `Proveedor ${input.provider} no configurado. Configure las credenciales en Integraciones.`,
    )
  }

  const adapter = getPaymentProvider(input.provider)
  const reference = `TR-${input.orderNumber.replace('#', '')}-${Date.now()}`

  logger.info('payment.createLink start', {
    orderId: input.orderId,
    provider: input.provider,
    amount: input.amount,
    reference,
  })

  const link = await adapter.createPaymentLink(
    {
      reference,
      amount: input.amount,
      currency: 'COP',
      description: input.description,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      redirectUrl: input.redirectUrl,
    },
    creds,
  )

  // Guarda la transacción + marca el link en la orden (transacción).
  const transaction = await db.$transaction(async (tx) => {
    const txn = await tx.transaction.create({
      data: {
        orderId: input.orderId,
        provider: input.provider,
        type: 'TRANSPORT',
        amount: input.amount,
        currency: 'COP',
        status: link.status,
        reference,
        providerTxId: link.providerTxId,
        paymentUrl: link.paymentUrl,
        rawResponse: JSON.stringify({ created: true, sandbox: !creds.apiKey && !creds.privateKey }),
      },
    })
    await tx.order.update({
      where: { id: input.orderId },
      data: {
        codPaymentLink: link.paymentUrl,
        codPaymentId: reference,
      },
    })
    return txn
  })

  logger.info('payment.createLink success', {
    transactionId: transaction.id,
    orderId: input.orderId,
    providerTxId: link.providerTxId,
    paymentUrl: link.paymentUrl,
  })

  return {
    transaction: toResult(transaction),
    paymentUrl: link.paymentUrl,
  }
}

// ------------------------------------------------------------
// Confirm payment (from webhook) — idempotent
// ------------------------------------------------------------

/**
 * Confirma una transacción a partir de un webhook parseado.
 *
 * - Idempotente: si la transacción ya está APPROVED, no hace nada.
 * - Busca la Transaction por providerTxId o reference.
 * - Actualiza el status + rawResponse.
 * - Si era TRANSPORT y pasa a APPROVED, transiciona el pedido:
 *     PENDIENTE_PAGO_TRANSPORTE → PAGO_TRANSPORTE_CONFIRMADO.
 *
 * @returns la transacción actualizada, o null si no se encontró.
 */
export async function confirmPaymentFromWebhook(
  payload: WebhookPayload,
): Promise<TransactionResult | null> {
  // Busca la transacción por providerTxId o reference.
  const where =
    payload.providerTxId != null
      ? { providerTxId: payload.providerTxId }
      : payload.reference != null
        ? { reference: payload.reference }
        : null

  if (!where) {
    logger.warn('payment.webhook no-identifier', { provider: payload.provider })
    return null
  }

  const existing = await db.transaction.findFirst({ where })
  if (!existing) {
    logger.warn('payment.webhook transaction-not-found', {
      provider: payload.provider,
      providerTxId: payload.providerTxId,
      reference: payload.reference,
    })
    return null
  }

  // Idempotencia: si ya está aprobada, no re-procesa.
  if (existing.status === 'APPROVED' && payload.status === 'APPROVED') {
    logger.info('payment.webhook idempotent-skip', { transactionId: existing.id })
    return toResult(existing)
  }

  const updated = await db.transaction.update({
    where: { id: existing.id },
    data: {
      status: payload.status,
      providerTxId: payload.providerTxId ?? existing.providerTxId,
      rawResponse: JSON.stringify(payload.raw),
    },
  })

  logger.info('payment.confirmed', {
    transactionId: updated.id,
    orderId: updated.orderId,
    provider: updated.provider,
    status: updated.status,
  })

  // Si era pago de transporte aprobado → transiciona el pedido.
  if (
    updated.type === 'TRANSPORT' &&
    updated.status === 'APPROVED'
  ) {
    try {
      await transitionStatus(
        updated.orderId,
        'PAGO_TRANSPORTE_CONFIRMADO',
        'system:payment-webhook',
        `Pago confirmado por ${updated.provider} (ref: ${updated.reference ?? 'n/a'})`,
      )
      logger.info('payment.confirmed order-transitioned', { orderId: updated.orderId })
    } catch (err) {
      if (err instanceof OrderNotFoundError) {
        logger.error('payment.confirmed order-not-found', { orderId: updated.orderId })
      } else {
        // Transición inválida (ej. el pedido ya estaba más adelante).
        logger.warn('payment.confirmed transition-skipped', {
          orderId: updated.orderId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  void audit.log({
    action: 'PAYMENT_CONFIRMED',
    entity: 'Transaction',
    entityId: updated.id,
    metadata: {
      provider: updated.provider,
      status: updated.status,
      orderId: updated.orderId,
      amount: updated.amount,
    },
  })

  return toResult(updated)
}

// ------------------------------------------------------------
// Query status manually (poll)
// ------------------------------------------------------------

/** Consulta el estado real de una transacción en el proveedor. */
export async function refreshTransactionStatus(
  transactionId: string,
): Promise<TransactionResult | null> {
  const txn = await db.transaction.findUnique({ where: { id: transactionId } })
  if (!txn) return null
  if (!txn.providerTxId) return toResult(txn)

  const creds = await getProviderCredentials(txn.provider as PaymentProvider)
  if (!creds) return toResult(txn)

  const adapter = getPaymentProvider(txn.provider)
  const status = await adapter.getTransactionStatus(txn.providerTxId, creds)

  if (status.status !== txn.status) {
    const updated = await db.transaction.update({
      where: { id: transactionId },
      data: { status: status.status },
    })
    return toResult(updated)
  }
  return toResult(txn)
}

// ------------------------------------------------------------
// Types & errors
// ------------------------------------------------------------

export interface TransactionResult {
  id: string
  orderId: string
  provider: string
  type: string
  amount: number
  currency: string
  status: NeutralTxStatus
  reference: string | null
  providerTxId: string | null
  paymentUrl: string | null
  createdAt: Date
}

function toResult(t: {
  id: string
  orderId: string
  provider: string
  type: string
  amount: number
  currency: string
  status: string
  reference: string | null
  providerTxId: string | null
  paymentUrl: string | null
  createdAt: Date
}): TransactionResult {
  return {
    id: t.id,
    orderId: t.orderId,
    provider: t.provider,
    type: t.type,
    amount: t.amount,
    currency: t.currency,
    status: t.status as NeutralTxStatus,
    reference: t.reference,
    providerTxId: t.providerTxId,
    paymentUrl: t.paymentUrl,
    createdAt: t.createdAt,
  }
}

export class PaymentConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PaymentConfigError'
  }
}
