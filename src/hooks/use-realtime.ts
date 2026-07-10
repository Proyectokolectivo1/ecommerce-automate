// ============================================================
// use-realtime.ts — Client hook for socket.io events
// ============================================================
// Conecta al mini-service realtime (puerto 3003 vía XTransformPort)
// y expone los eventos entrantes como callbacks.
//
// Uso:
//   useRealtime({
//     onOrderCreated: (d) => refetch(),
//     onAlert: (d) => toast(d.message),
//   })

'use client'

import { useEffect, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'

type Handler = (data: Record<string, unknown>) => void

interface UseRealtimeOptions {
  onOrderCreated?: Handler
  onOrderTransition?: Handler
  onPaymentConfirmed?: Handler
  onGuideStatus?: Handler
  onAlert?: Handler
  enabled?: boolean
}

export function useRealtime(options: UseRealtimeOptions): void {
  const { enabled = true } = options
  const handlersRef = useRef(options)

  useEffect(() => {
    // Mantener el ref actualizado dentro del effect (no durante el render).
    handlersRef.current = options
  })

  useEffect(() => {
    if (!enabled) return

    // Conexión vía gateway Caddy con XTransformPort.
    const socket: Socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      timeout: 10000,
    })

    const dispatch = (event: string, data: Record<string, unknown>) => {
      const h = handlersRef.current
      switch (event) {
        case 'order:created':
          h.onOrderCreated?.(data)
          break
        case 'order:transition':
          h.onOrderTransition?.(data)
          break
        case 'payment:confirmed':
          h.onPaymentConfirmed?.(data)
          break
        case 'guide:status':
          h.onGuideStatus?.(data)
          break
        case 'alert:new':
          h.onAlert?.(data)
          break
      }
    }

    socket.on('order:created', (d: Record<string, unknown>) => dispatch('order:created', d))
    socket.on('order:transition', (d: Record<string, unknown>) => dispatch('order:transition', d))
    socket.on('payment:confirmed', (d: Record<string, unknown>) => dispatch('payment:confirmed', d))
    socket.on('guide:status', (d: Record<string, unknown>) => dispatch('guide:status', d))
    socket.on('alert:new', (d: Record<string, unknown>) => dispatch('alert:new', d))

    return () => {
      socket.removeAllListeners()
      socket.disconnect()
    }
  }, [enabled])
}

/** Hook simple: devuelve true cuando el socket está conectado. */
export function useRealtimeConnected(): boolean {
  return false // placeholder — la versión con estado se puede agregar luego
}
