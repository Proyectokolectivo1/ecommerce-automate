// ============================================================
// /api/orders/[id]/transition — Cambio de estado del pedido
// ============================================================
// POST — body: { toStatus, reason? }
//   Valida la transición con la FSM, actualiza el pedido, crea
//   OrderStatusLog y registra en AuditLog.

import { NextResponse } from 'next/server'
import { getCurrentUserOrFallback } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { audit } from '@/lib/audit'
import { ORDER_STATUSES } from '@/lib/validation'
import {
  transitionStatus,
  OrderTransitionError,
  OrderNotFoundError,
} from '@/modules/orders/order.service'
import { getAllowedTransitions } from '@/modules/orders/state-machine'

interface TransitionBody {
  toStatus?: string
  reason?: string
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { id } = await ctx.params
  if (!id) {
    return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  }

  // --- Parse body ---------------------------------------------------
  let body: TransitionBody
  try {
    body = (await request.json()) as TransitionBody
  } catch {
    return NextResponse.json(
      { error: 'Body inválido (JSON requerido)' },
      { status: 400 },
    )
  }

  const { toStatus, reason } = body
  if (!toStatus) {
    return NextResponse.json(
      { error: 'toStatus requerido' },
      { status: 400 },
    )
  }
  if (
    !ORDER_STATUSES.includes(toStatus as (typeof ORDER_STATUSES)[number])
  ) {
    return NextResponse.json(
      { error: `Estado destino inválido: ${toStatus}` },
      { status: 400 },
    )
  }

  // --- Ejecuta transición ------------------------------------------
  try {
    const updated = await transitionStatus(id, toStatus, user.id, reason)

    // Auditoría (fire-and-forget)
    void audit.log({
      userId: user.id,
      action: 'ORDER_TRANSITION',
      entity: 'Order',
      entityId: id,
      metadata: {
        orderNumber: updated.orderNumber,
        toStatus,
        reason: reason ?? null,
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    if (err instanceof OrderNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    if (err instanceof OrderTransitionError) {
      const allowed = getAllowedTransitions(err.fromStatus)
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          fromStatus: err.fromStatus,
          toStatus: err.toStatus,
          allowedTransitions: allowed,
        },
        { status: 409 },
      )
    }
    logger.error('api.orders.transition error', {
      id,
      toStatus,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: 'Error al cambiar estado del pedido' },
      { status: 500 },
    )
  }
}
