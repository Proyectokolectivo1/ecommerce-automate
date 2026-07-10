// ============================================================
// status-badge.tsx — Order status badge
// ============================================================
// Renderiza un Badge shadcn con la variante y clases correctas
// según el estado del pedido. Reutilizable en el dashboard y en
// el módulo de pedidos (Task 8).

import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/format'
import {
  ORDER_STATE_COLORS,
  ORDER_STATE_LABELS,
} from '@/modules/orders/state-machine'
import type { OrderStatus } from '@/modules/orders/types'

export interface StatusBadgeProps {
  status: string
  /** Etiqueta override; por defecto usa ORDER_STATE_LABELS. */
  label?: string
  /** Tamaño: 'sm' reduce padding y font-size para timelines / tablas densas. */
  size?: 'sm' | 'default'
  className?: string
}

function isKnownStatus(status: string): status is OrderStatus {
  return status in ORDER_STATE_LABELS
}

export function StatusBadge({ status, label, size = 'default', className }: StatusBadgeProps) {
  const known = isKnownStatus(status)
  const colors = known
    ? ORDER_STATE_COLORS[status as OrderStatus]
    : { variant: 'outline' as const, className: '' }
  const text = label ?? (known ? ORDER_STATE_LABELS[status as OrderStatus] : status)

  return (
    <Badge
      variant={colors.variant}
      className={cn(
        'gap-1 border',
        colors.className,
        size === 'sm' && 'px-1.5 py-0 text-[10px]',
        className,
      )}
    >
      {text}
    </Badge>
  )
}
