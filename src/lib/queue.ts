// ============================================================
// queue.ts — Simple in-memory job queue with retry
// ============================================================
// Cola de jobs en memoria para procesamiento asíncrono de tareas
// (envío de notificaciones, generación de guías, impresión, etc.).
// Procesa jobs secuencialmente con hasta 3 reintentos y backoff
// exponencial. NO es persistente: al reiniciar el proceso se pierden
// los jobs pendientes. Adecuado para el demo y para cargas livianas.

import { logger } from '@/lib/logger'

export interface QueueJob {
  id: string
  type: string
  payload: unknown
  attempts: number
  createdAt: number
  failedAt?: number
  lastError?: string
}

export type JobHandler = (payload: unknown, job: QueueJob) => Promise<void>

export interface QueueStats {
  pending: number
  totalProcessed: number
  totalFailed: number
  totalRetried: number
  isRunning: boolean
}

const MAX_ATTEMPTS = 3
const BASE_BACKOFF_MS = 1_000

export class MemoryQueue {
  private handlers = new Map<string, JobHandler>()
  private pending: QueueJob[] = []
  private processing = false
  private running = false
  private timer: NodeJS.Timeout | null = null

  private stats: QueueStats = {
    pending: 0,
    totalProcessed: 0,
    totalFailed: 0,
    totalRetried: 0,
    isRunning: false,
  }

  private seq = 0

  /** Encola un job. Devuelve el id asignado. */
  enqueue(jobType: string, payload: unknown): string {
    const id = `job_${Date.now()}_${this.seq++}`
    const job: QueueJob = {
      id,
      type: jobType,
      payload,
      attempts: 0,
      createdAt: Date.now(),
    }
    this.pending.push(job)
    this.stats.pending = this.pending.length
    logger.info(`queue.enqueue ${jobType}`, { jobId: id })
    this.kick()
    return id
  }

  /** Registra un handler para un tipo de job. */
  process(jobType: string, handler: JobHandler): void {
    this.handlers.set(jobType, handler)
    logger.debug(`queue.handler registered`, { jobType })
  }

  /** Inicia el loop de procesamiento. */
  start(): void {
    if (this.running) return
    this.running = true
    this.stats.isRunning = true
    logger.info('queue.start')
    this.kick()
  }

  /** Detiene el loop de procesamiento. */
  stop(): void {
    this.running = false
    this.stats.isRunning = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    logger.info('queue.stop')
  }

  getStats(): QueueStats {
    return { ...this.stats, pending: this.pending.length }
  }

  // ----------------------------------------------------------
  // Internos
  // ----------------------------------------------------------

  private kick(): void {
    if (!this.running) return
    if (this.processing) return
    // Procesa en el siguiente tick para no bloquear al llamador.
    this.timer = setTimeout(() => {
      void this.tick()
    }, 0)
  }

  private async tick(): Promise<void> {
    this.processing = true
    try {
      while (this.running && this.pending.length > 0) {
        const job = this.pending.shift()!
        this.stats.pending = this.pending.length
        await this.runJob(job)
      }
    } finally {
      this.processing = false
    }
  }

  private async runJob(job: QueueJob): Promise<void> {
    const handler = this.handlers.get(job.type)
    if (!handler) {
      logger.warn(`queue.noHandler for ${job.type}`, { jobId: job.id })
      this.stats.totalFailed++
      return
    }

    job.attempts++
    try {
      await handler(job.payload, job)
      this.stats.totalProcessed++
      logger.info(`queue.done ${job.type}`, { jobId: job.id, attempts: job.attempts })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      job.lastError = message
      if (job.attempts < MAX_ATTEMPTS) {
        this.stats.totalRetried++
        const backoff = BASE_BACKOFF_MS * Math.pow(2, job.attempts - 1)
        logger.warn(`queue.retry ${job.type}`, {
          jobId: job.id,
          attempt: job.attempts,
          backoff,
          error: message,
        })
        // Re-encola con backoff
        setTimeout(() => {
          this.pending.push(job)
          this.stats.pending = this.pending.length
          this.kick()
        }, backoff)
      } else {
        job.failedAt = Date.now()
        this.stats.totalFailed++
        logger.error(`queue.failed ${job.type}`, {
          jobId: job.id,
          attempts: job.attempts,
          error: message,
        })
      }
    }
  }
}

/** Singleton de cola para toda la app */
export const queue = new MemoryQueue()

// Auto-arranca la cola al importar el módulo.
queue.start()
