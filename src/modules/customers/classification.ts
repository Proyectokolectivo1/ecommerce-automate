// ============================================================
// classification.ts — Customer classification pure functions
// ============================================================
// Funciones puras (sin side-effects) para clasificar clientes en
// 4 categorías: VIP | FRECUENTE | NUEVO | INACTIVO.
//
// Reglas de negocio (umbrales configurables):
//   - VIP        → totalSpent ≥ VIP_MIN_SPENT AND ordersCount ≥ VIP_MIN_ORDERS
//   - FRECUENTE  → ordersCount ≥ FRECUENTE_MIN_ORDERS (y no es VIP)
//   - INACTIVO   → daysSinceLastOrder ≥ INACTIVE_DAYS (y no es VIP/FRECUENTE)
//   - NUEVO      → en cualquier otro caso
//
// `classifyCustomer` opera sobre un objeto `CustomerStats` que puede
// armarse desde el modelo Prisma `Customer` o desde datos calculados.

import type { CustomerClassification } from '@/lib/validation'

// ------------------------------------------------------------
// Thresholds
// ------------------------------------------------------------

export const CLASSIFICATION_THRESHOLDS = {
  /** Gasto mínimo (COP) para clasificar como VIP. */
  VIP_MIN_SPENT: 2_000_000,
  /** Cantidad mínima de pedidos para clasificar como VIP. */
  VIP_MIN_ORDERS: 5,
  /** Cantidad mínima de pedidos para clasificar como FRECUENTE. */
  FRECUENTE_MIN_ORDERS: 3,
  /** Días sin pedidos para clasificar como INACTIVO. */
  INACTIVE_DAYS: 90,
} as const

/** Etiquetas legibles en español. */
export const CLASSIFICATION_LABELS: Record<CustomerClassification, string> = {
  VIP: 'VIP',
  FRECUENTE: 'Frecuente',
  NUEVO: 'Nuevo',
  INACTIVO: 'Inactivo',
}

/**
 * Clases Tailwind para los badges de clasificación.
 * Sin usar indigo/azul: VIP ámbar, FRECUENTE teal, NUEVO zinc, INACTIVO rose.
 */
export const CLASSIFICATION_BADGE_CLASSES: Record<CustomerClassification, string> = {
  VIP: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700',
  FRECUENTE:
    'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-700',
  NUEVO:
    'bg-zinc-200 text-zinc-800 border-zinc-300 dark:bg-zinc-700/60 dark:text-zinc-100 dark:border-zinc-600',
  INACTIVO:
    'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700',
}

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

/**
 * Estadísticas de un cliente usadas para la clasificación.
 * Se construye desde el modelo `Customer` (campos denormalizados) o
 * desde agregaciones calculadas al vuelo.
 */
export interface CustomerStats {
  totalSpent: number
  ordersCount: number
  lastOrderAt: Date | null
}

/** Resultado de la clasificación: la categoría + metadata para auditoría. */
export interface ClassificationResult {
  classification: CustomerClassification
  reasons: string[]
}

// ------------------------------------------------------------
// Helpers (puros)
// ------------------------------------------------------------

/**
 * Calcula los días transcurridos desde la última orden del cliente.
 * Si `lastOrderAt` es null, devuelve `Infinity` (cliente sin pedidos).
 * La fecha de referencia es "ahora" por defecto, pero puede sobreescribirse
 * con `now` para tests deterministas.
 */
export function calculateDaysSinceLastOrder(
  lastOrderAt: Date | null,
  now: Date = new Date(),
): number {
  if (!lastOrderAt) return Number.POSITIVE_INFINITY
  const diffMs = now.getTime() - lastOrderAt.getTime()
  if (diffMs <= 0) return 0
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

/**
 * Clasifica un cliente a partir de sus estadísticas.
 *
 * Aplica las reglas en orden de prioridad:
 *   1. VIP        → spent ≥ VIP_MIN_SPENT AND orders ≥ VIP_MIN_ORDERS
 *   2. FRECUENTE  → orders ≥ FRECUENTE_MIN_ORDERS
 *   3. INACTIVO   → daysSinceLastOrder ≥ INACTIVE_DAYS
 *   4. NUEVO      → default
 *
 * Devuelve la clasificación + las razones (para auditoría/debug).
 */
export function classifyCustomer(
  stats: CustomerStats,
  now: Date = new Date(),
): ClassificationResult {
  const reasons: string[] = []
  const daysSince = calculateDaysSinceLastOrder(stats.lastOrderAt, now)

  // VIP: gasto + pedidos
  if (
    stats.totalSpent >= CLASSIFICATION_THRESHOLDS.VIP_MIN_SPENT &&
    stats.ordersCount >= CLASSIFICATION_THRESHOLDS.VIP_MIN_ORDERS
  ) {
    reasons.push(
      `Gasto ${stats.totalSpent} ≥ ${CLASSIFICATION_THRESHOLDS.VIP_MIN_SPENT}`,
      `Pedidos ${stats.ordersCount} ≥ ${CLASSIFICATION_THRESHOLDS.VIP_MIN_ORDERS}`,
    )
    return { classification: 'VIP', reasons }
  }

  // FRECUENTE: pedidos
  if (stats.ordersCount >= CLASSIFICATION_THRESHOLDS.FRECUENTE_MIN_ORDERS) {
    reasons.push(
      `Pedidos ${stats.ordersCount} ≥ ${CLASSIFICATION_THRESHOLDS.FRECUENTE_MIN_ORDERS}`,
    )
    return { classification: 'FRECUENTE', reasons }
  }

  // INACTIVO: días sin comprar
  if (daysSince >= CLASSIFICATION_THRESHOLDS.INACTIVE_DAYS) {
    reasons.push(
      `Días sin comprar ${daysSince === Number.POSITIVE_INFINITY ? '∞' : daysSince} ≥ ${CLASSIFICATION_THRESHOLDS.INACTIVE_DAYS}`,
    )
    return { classification: 'INACTIVO', reasons }
  }

  // NUEVO: default
  reasons.push('Sin criterios para VIP/FRECUENTE/INACTIVO')
  return { classification: 'NUEVO', reasons }
}

/**
 * Construye un objeto `CustomerStats` a partir de un cliente Prisma.
 * Acepta cualquier objeto con los campos denormalizados (totalSpent,
 * ordersCount, lastOrderAt).
 */
export function buildCustomerStats(customer: {
  totalSpent: number | null
  ordersCount: number | null
  lastOrderAt: Date | null
}): CustomerStats {
  return {
    totalSpent: customer.totalSpent ?? 0,
    ordersCount: customer.ordersCount ?? 0,
    lastOrderAt: customer.lastOrderAt ?? null,
  }
}

/**
 * Devuelve true si el cliente necesita ser reclasificado.
 *
 * Útil para saber si un evento (nueva orden, cancelación, paso del tiempo)
 * cambió la categoría del cliente respecto a la que tiene almacenada.
 */
export function needsReclassification(
  currentClassification: string,
  stats: CustomerStats,
  now: Date = new Date(),
): boolean {
  const result = classifyCustomer(stats, now)
  return result.classification !== currentClassification
}
