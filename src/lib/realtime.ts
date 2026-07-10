// ============================================================
// realtime.ts — Server-side helper to emit events to the WS service
// ============================================================
// Bridge HTTP→WS: la API de Next.js llama a esta función para emitir
// eventos al mini-service socket.io (puerto 3003).
//
// Es fire-and-forget: si el servicio está caído, no bloquea la
// operación principal (solo loguea el error).

import { logger } from '@/lib/logger'

const REALTIME_URL = process.env.REALTIME_URL || 'http://localhost:3003/emit'
const REALTIME_SECRET = process.env.REALTIME_SECRET || 'dev-realtime-secret'

/** Emite un evento al servicio realtime (socket.io). */
export async function emitRealtime(
  event: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)
    await fetch(REALTIME_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-realtime-secret': REALTIME_SECRET,
      },
      body: JSON.stringify({ event, data }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
  } catch (err) {
    // No bloquear el flujo principal si el servicio realtime no responde.
    logger.debug('realtime.emit failed (non-blocking)', {
      event,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/** Emite un evento de nuevo pedido. */
export function emitOrderCreated(orderId: string, orderNumber: string, status: string): void {
  void emitRealtime('order:created', { orderId, orderNumber, status, at: Date.now() })
}

/** Emite un evento de transición de estado. */
export function emitOrderTransition(
  orderId: string,
  orderNumber: string,
  from: string,
  to: string,
  actor: string,
): void {
  void emitRealtime('order:transition', { orderId, orderNumber, from, to, actor, at: Date.now() })
}

/** Emite un evento de confirmación de pago. */
export function emitPaymentConfirmed(
  orderId: string,
  provider: string,
  amount: number,
  status: string,
): void {
  void emitRealtime('payment:confirmed', { orderId, provider, amount, status, at: Date.now() })
}

/** Emite un evento de actualización de guía. */
export function emitGuideStatus(
  shipmentId: string,
  guideNumber: string,
  status: string,
): void {
  void emitRealtime('guide:status', { shipmentId, guideNumber, status, at: Date.now() })
}

/** Emite un evento de nueva alerta. */
export function emitAlert(alertId: string, type: string, severity: string, message: string): void {
  void emitRealtime('alert:new', { alertId, type, severity, message, at: Date.now() })
}
