// ============================================================
// alert-worker.ts — Periodic alert evaluator
// ============================================================
// Worker que cada 5 minutos ejecuta todos los evaluadores y
// persiste/deduplica las condiciones resultantes vía
// `processAlertConditions`.
//
// Se arranca automáticamente al importar el módulo si estamos en
// el servidor (typeof window === 'undefined'). Es idempotente: si
// se importa varias veces solo arranca un timer.

import { logger } from '@/lib/logger'
import { evaluateAllAlerts } from './alert-evaluators'
import { processAlertConditions } from './alert.service'

const INTERVAL_MS = 5 * 60 * 1000 // 5 minutos
const FIRST_RUN_DELAY_MS = 10_000 // primer tick diferido (10s)

let started = false
let timer: NodeJS.Timeout | null = null
let running = false

/** Ejecuta una ronda del worker: evalúa + persiste. */
export async function runAlertWorkerTick(): Promise<void> {
  if (running) {
    logger.debug('alert-worker.skip-already-running')
    return
  }
  running = true
  const start = Date.now()
  try {
    // IMPORTANT: evaluateAllAlerts returns { conditions, results }.
    // Solo nos interesan las `conditions` para persistirlas.
    const { conditions, results } = await evaluateAllAlerts()
    if (conditions.length === 0) {
      logger.debug('alert-worker.tick no-conditions', {
        evaluators: results.length,
        durationMs: Date.now() - start,
      })
      return
    }
    const summary = await processAlertConditions(conditions)
    logger.info('alert-worker.tick done', {
      ...summary,
      durationMs: Date.now() - start,
    })
  } catch (err) {
    logger.error('alert-worker.tick-error', {
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    })
  } finally {
    running = false
  }
}

/** Arranca el worker (idempotente). */
export function startAlertWorker(): void {
  if (started) return
  started = true

  // Primer tick diferido para no competir con el arranque del dev server.
  setTimeout(() => {
    void runAlertWorkerTick()
  }, FIRST_RUN_DELAY_MS)

  timer = setInterval(() => {
    void runAlertWorkerTick()
  }, INTERVAL_MS)
  timer.unref?.()

  logger.info('alert-worker.started', { intervalMs: INTERVAL_MS })
}

/** Detiene el worker (para tests/shutdown). */
export function stopAlertWorker(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  started = false
  logger.info('alert-worker.stopped')
}

// Auto-arranque al importar (solo en el servidor).
if (typeof window === 'undefined') {
  startAlertWorker()
}
