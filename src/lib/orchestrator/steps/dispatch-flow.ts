// ============================================================
// dispatch-flow.ts — Orchestrator flow for order dispatch
// ============================================================
// Define el flujo de despacho como secuencia de steps declarativos.
// Sustituye a n8n en el sandbox. El flujo:
//
//   1. validate-order    — verifica que la orden pueda despacharse
//   2. create-dispatch   — llama Mastershop, guarda Shipment
//   3. generate-guide    — (integrado en create-dispatch)
//   4. print-guide       — encola PrintJob
//   5. notify-customer   — WhatsApp + Email al cliente
//
// En la práctica, createShipmentForOrder ya orquesta todo esto de
// forma transaccional. Este flujo declarativo se expone como
// alternativa para cuando se quiera ejecutar via n8n real (los
// steps se mapean 1:1 a endpoints HTTP).

import { defineFlow, type Step } from '@/lib/orchestrator'
import { db } from '@/lib/db'
import { createShipmentForOrder } from '@/modules/logistics/shipment.service'
import { ShipmentError } from '@/modules/logistics/shipment.service'

// ------------------------------------------------------------
// Steps
// ------------------------------------------------------------

const validateOrderStep: Step = {
  name: 'validate-order',
  async run(ctx) {
    const orderId = ctx.orderId as string
    if (!orderId) {
      throw new Error('validate-order: orderId requerido en el contexto')
    }
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentMethod: true,
        codPaid: true,
        city: true,
        address: true,
        customer: { select: { id: true, name: true, phone: true, email: true } },
        items: { select: { id: true, title: true, quantity: true, product: { select: { weight: true } } } },
      },
    })
    if (!order) {
      throw new ShipmentError('ORDER_NOT_FOUND', `Pedido ${orderId} no encontrado`)
    }
    const dispatchable = ['PREPARANDO', 'PAGO_TRANSPORTE_CONFIRMADO']
    if (!dispatchable.includes(order.status)) {
      throw new ShipmentError(
        'ORDER_NOT_DISPATCHABLE',
        `Pedido ${order.orderNumber} no puede despacharse desde ${order.status}`,
      )
    }
    return { order }
  },
}

const createDispatchStep: Step = {
  name: 'create-dispatch',
  onFailure: 'notify-error',
  async run(ctx) {
    const orderId = ctx.orderId as string
    const actor = (ctx.actor as string) ?? 'system:orchestrator'
    const result = await createShipmentForOrder({ orderId, actor })
    return {
      shipmentId: result.shipment.id,
      guideNumber: result.guideNumber,
      carrier: result.carrier,
      pdfUrl: result.pdfUrl,
    }
  },
}

const notifyErrorStep: Step = {
  name: 'notify-error',
  async run(ctx) {
    // En modo demo solo logueamos. En producción crearía una Alert.
    const orderId = ctx.orderId as string
    const error = ctx.__error as string | undefined
    console.warn(`[dispatch-flow] error para orden ${orderId}: ${error ?? 'unknown'}`)
    return { recovered: true, notifiedAt: new Date().toISOString() }
  },
}

// ------------------------------------------------------------
// Flow definition
// ------------------------------------------------------------

export const dispatchFlow = defineFlow('dispatch-order', [
  validateOrderStep,
  createDispatchStep,
  // print-guide y notify-customer ya están integrados en createShipmentForOrder,
  // pero los declaramos como steps explícitos para documentación/futuro n8n.
  {
    name: 'print-guide',
    async run(ctx) {
      // createShipmentForOrder ya encola la impresión; este step es no-op.
      return { printQueued: Boolean(ctx.guideNumber) }
    },
  },
  {
    name: 'notify-customer',
    async run(ctx) {
      // createShipmentForOrder ya notifica; este step es no-op.
      return { notified: Boolean(ctx.guideNumber) }
    },
  },
  notifyErrorStep,
])

/** Ejecuta el flujo de despacho para una orden. */
export async function runDispatchFlow(
  orderId: string,
  actor: string = 'system:orchestrator',
): Promise<{ status: string; guideNumber?: string; error?: string }> {
  const { orchestrator } = await import('@/lib/orchestrator')
  if (!orchestrator.has('dispatch-order')) {
    orchestrator.register(dispatchFlow)
  }
  const result = await orchestrator.execute('dispatch-order', { orderId, actor })
  return {
    status: result.status,
    guideNumber: result.context.guideNumber as string | undefined,
    error: result.error,
  }
}
