// ============================================================
// registry.ts — Payment provider registry / factory
// ============================================================
// Resuelve el adapter correcto a partir del nombre del proveedor.
// Centraliza la lista de providers disponibles para que la UI y
// los webhooks los descubran dinámicamente.

import type { PaymentProvider as ProviderName } from '@/lib/validation'
import { PAYMENT_PROVIDERS } from '@/lib/validation'
import type { PaymentProviderPort } from './provider'
import { WompiProvider } from './wompi'
import { PayUProvider } from './payu'
import { MercadoPagoProvider } from './mercadopago'
import { EpaycoProvider } from './epayco'
import { BoldProvider } from './bold'

const REGISTRY: Record<ProviderName, PaymentProviderPort> = {
  WOMPI: WompiProvider,
  PAYU: PayUProvider,
  MERCADOPAGO: MercadoPagoProvider,
  EPAYCO: EpaycoProvider,
  BOLD: BoldProvider,
}

/** Devuelve el adapter del proveedor solicitado. @throws si no existe. */
export function getPaymentProvider(name: string): PaymentProviderPort {
  const key = name.toUpperCase() as ProviderName
  const provider = REGISTRY[key]
  if (!provider) {
    throw new Error(`Proveedor de pago no soportado: ${name}`)
  }
  return provider
}

/** Lista de nombres de proveedores disponibles. */
export const PAYMENT_PROVIDER_NAMES = PAYMENT_PROVIDERS

/** True si el nombre corresponde a un proveedor soportado. */
export function isSupportedProvider(name: string): boolean {
  return (PAYMENT_PROVIDERS as readonly string[]).includes(name.toUpperCase())
}
