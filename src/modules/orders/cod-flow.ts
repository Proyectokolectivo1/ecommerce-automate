// ============================================================
// cod-flow.ts — Pago contra entrega (COD) helpers
// ============================================================
// Funciones puras para evaluar y calcular el flujo de pago contra
// entrega (COD). No tocan la base de datos — operan sobre la orden
// recibida como argumento, así son testeables y reutilizables desde
// el service, la UI y el orchestrator.

import type { Order, OrderItem } from '@prisma/client'

/** Orden mínima requerida por las helpers de COD. */
export interface CodOrderLike {
  paymentMethod: string
  codPaid: boolean
  status: string
  transportCost?: number
  items?: Pick<OrderItem, 'quantity' | 'unitCost' | 'total'>[]
}

// Costo base de transporte (COP). Heurística de demo.
const TRANSPORT_BASE_COST = 5000
// Multiplicador por gramo para costo de transporte.
const TRANSPORT_WEIGHT_RATE = 0.05

/**
 * Devuelve true si la orden es pago contra entrega (COD).
 * Acepta tanto "COD" como variantes en minúsculas o con guiones.
 */
export function isCodOrder(order: Pick<CodOrderLike, 'paymentMethod'>): boolean {
  const method = (order?.paymentMethod ?? '').toString().toUpperCase().replace(/[-_\s]/g, '')
  return method === 'COD'
}

/**
 * Devuelve true si la orden requiere pago de transporte:
 * - es COD
 * - todavía no se ha pagado el transporte (`codPaid` es false)
 * - el estado actual es PENDIENTE_PAGO_TRANSPORTE
 */
export function requiresTransportPayment(order: CodOrderLike): boolean {
  if (!isCodOrder(order)) return false
  if (order.codPaid) return false
  return order.status === 'PENDIENTE_PAGO_TRANSPORTE'
}

/**
 * Calcula el costo de transporte de la orden.
 *
 * Heurística de demo:
 *   - Si la orden ya tiene `transportCost` > 0, lo retorna tal cual.
 *   - En caso contrario: base $5.000 + (peso total * $0.05/gramo).
 *
 * El "peso" en este demo se aproxima como `quantity * 100` gramos por ítem
 * cuando no hay información de peso (los items no exponen `weight`).
 */
export function calculateTransportCost(
  order: Pick<CodOrderLike, 'transportCost' | 'items'>,
): number {
  if (order.transportCost && order.transportCost > 0) {
    return Math.round(order.transportCost)
  }

  const items = order.items ?? []
  // Aproximación: 100 g por unidad cuando el item no trae peso.
  // Si se quiere usar peso real, el llamador puede pasar `transportCost`.
  let approxWeightGrams = 0
  for (const item of items) {
    approxWeightGrams += (item.quantity ?? 0) * 100
  }

  const cost = TRANSPORT_BASE_COST + approxWeightGrams * TRANSPORT_WEIGHT_RATE
  return Math.round(cost)
}

/**
 * Devuelve true si la orden es COD y todavía no se ha pagado el transporte,
 * independientemente del estado actual. Útil para alertas.
 */
export function isCodPendingTransportPayment(order: CodOrderLike): boolean {
  return isCodOrder(order) && !order.codPaid
}
