// ============================================================
// print-worker.ts — Periodic print queue processor
// ============================================================
// Worker que procesa la cola de impresión cada N segundos.
// Se arranca al importar el módulo (una sola vez por proceso).
//
// En producción se reemplazaría por un worker BullMQ separado.
// Aquí usamos setInterval en el proceso del dev server.

import { processPrintQueue } from '@/modules/logistics/printing.service'
import { logger } from '@/lib/logger'

const INTERVAL_MS = 15_000 // 15 segundos
const MAX_TICKS = 4 // limita el número de ticks por intervalo

let started = false
let timer: NodeJS.Timeout | null = null

/** Arranca el worker de impresión (idempotente). */
export function startPrintWorker(): void {
  if (started) return
  started = true

  const tick = async () => {
    try {
      let ticks = 0
      // Procesa en ronda hasta vaciar la cola o alcanzar MAX_TICKS.
      while (ticks < MAX_TICKS) {
        const { processed, failed } = await processPrintQueue()
        if (processed === 0 && failed === 0) break
        ticks++
      }
    } catch (err) {
      logger.error('print-worker.tick-error', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Primer tick diferado (no bloquea el arranque).
  setTimeout(tick, 3_000)
  timer = setInterval(tick, INTERVAL_MS)

  logger.info('print-worker.started', { intervalMs: INTERVAL_MS })
}

/** Detiene el worker (para tests/shutdown). */
export function stopPrintWorker(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  started = false
  logger.info('print-worker.stopped')
}

// Auto-arranque al importar (solo en el servidor, no en edge).
if (typeof window === 'undefined') {
  startPrintWorker()
}
