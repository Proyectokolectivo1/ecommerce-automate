// ============================================================
// state-machine.ts — Order FSM (8 estados)
// ============================================================
// Máquina de estados finita del pedido. Define los 8 estados del
// dominio, las transiciones permitidas y utilidades para validarlas.
//
// Estados (sección 7 del diseño):
//   1. NUEVO                       — Pedido recién creado (webhook Shopify)
//   2. PENDIENTE_PAGO_TRANSPORTE   — Esperando pago de transporte (COD)
//   3. PAGO_TRANSPORTE_CONFIRMADO  — Transporte pago confirmado
//   4. PREPARANDO                  — En bodega preparando
//   5. ENVIADO                     — Con guía, despachado
//   6. ENTREGADO                   — Entregado al cliente (terminal)
//   7. DEVUELTO                    — Retornado por transportadora (terminal)
//   8. CANCELADO                   — Cancelado (terminal)

import { ORDER_STATUSES } from '@/lib/validation'
import type { OrderStatus } from './types'

// ------------------------------------------------------------
// Estados
// ------------------------------------------------------------

/** Lista de los 8 estados del FSM. */
export const ORDER_STATES: OrderStatus[] = [...ORDER_STATUSES]

// ------------------------------------------------------------
// Transiciones permitidas
// ------------------------------------------------------------

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NUEVO: ['PENDIENTE_PAGO_TRANSPORTE', 'PREPARANDO', 'CANCELADO'],
  PENDIENTE_PAGO_TRANSPORTE: ['PAGO_TRANSPORTE_CONFIRMADO', 'CANCELADO'],
  PAGO_TRANSPORTE_CONFIRMADO: ['PREPARANDO', 'CANCELADO'],
  PREPARANDO: ['ENVIADO', 'CANCELADO'],
  ENVIADO: ['ENTREGADO', 'DEVUELTO'],
  ENTREGADO: [],
  DEVUELTO: [],
  CANCELADO: [],
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/** Estados terminales (sin transiciones salientes). */
const TERMINAL_STATES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  'ENTREGADO',
  'DEVUELTO',
  'CANCELADO',
])

/** Devuelve true si la transición `from → to` está permitida. */
export function canTransition(from: string, to: string): boolean {
  const allowed = ORDER_TRANSITIONS[from as OrderStatus]
  if (!allowed) return false
  return allowed.includes(to as OrderStatus)
}

/** Devuelve la lista de estados a los que se puede transicionar desde `from`. */
export function getAllowedTransitions(from: string): OrderStatus[] {
  return ORDER_TRANSITIONS[from as OrderStatus] ?? []
}

/** Devuelve true si el estado es terminal (no acepta más transiciones). */
export function isTerminal(state: string): boolean {
  return TERMINAL_STATES.has(state as OrderStatus)
}

// ------------------------------------------------------------
// Etiquetas legibles (Español)
// ------------------------------------------------------------

export const ORDER_STATE_LABELS: Record<OrderStatus, string> = {
  NUEVO: 'Nuevo pedido',
  PENDIENTE_PAGO_TRANSPORTE: 'Pendiente pago transporte',
  PAGO_TRANSPORTE_CONFIRMADO: 'Pago transporte confirmado',
  PREPARANDO: 'Preparando',
  ENVIADO: 'Enviado',
  ENTREGADO: 'Entregado',
  DEVUELTO: 'Devuelto',
  CANCELADO: 'Cancelado',
}

// ------------------------------------------------------------
// Colores / variantes para badges
// ------------------------------------------------------------
// shadcn Badge soporta: default | secondary | destructive | outline.
// Para "warning" (amarillo) y "success" (verde) usamos `variant` estándar +
// clases Tailwind custom vía `className`. Exportamos tanto el `variant`
// como las clases adicionales para que el componente UI pueda combinarlas.

export interface BadgeStyle {
  /** Variante estándar de shadcn/ui Badge. */
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
  /** Clases Tailwind extra para aplicar al badge (color warning/success). */
  className: string
}

export const ORDER_STATE_COLORS: Record<OrderStatus, BadgeStyle> = {
  NUEVO: {
    variant: 'secondary',
    className:
      'bg-zinc-200 text-zinc-800 border-zinc-300 dark:bg-zinc-700/60 dark:text-zinc-100 dark:border-zinc-600',
  },
  PENDIENTE_PAGO_TRANSPORTE: {
    variant: 'secondary',
    className:
      'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700',
  },
  PAGO_TRANSPORTE_CONFIRMADO: {
    variant: 'secondary',
    className:
      'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700',
  },
  PREPARANDO: {
    variant: 'secondary',
    className:
      'bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-700',
  },
  ENVIADO: {
    variant: 'secondary',
    className:
      'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-700',
  },
  ENTREGADO: {
    variant: 'secondary',
    className:
      'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700',
  },
  DEVUELTO: {
    variant: 'destructive',
    className: '',
  },
  CANCELADO: {
    variant: 'destructive',
    className: '',
  },
}
