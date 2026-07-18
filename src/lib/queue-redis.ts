// ============================================================
// queue-redis.ts — Redis-backed queue using BullMQ
// ============================================================
// Adapter de colas persistente usando BullMQ + Redis.
// Si REDIS_URL no está configurada, el factory en queue.ts
// usa la cola en memoria (MemoryQueue) como fallback.
//
// Ventajas sobre la cola en memoria:
//   - Persistencia: los jobs sobreviven reinicios del servidor.
//   - Concurrencia: múltiples workers pueden procesar en paralelo.
//   - Reintentos automáticos con backoff exponencial.
//   - Dead Letter Queue: jobs que fallan N veces se mueven a DLQ.
//
// Uso:
//   import { getQueue } from '@/lib/queue-redis'
//   const queue = getQueue()
//   if (queue) {
//     queue.add('print-job', { printJobId: '123' })
//   }

import { Queue, Worker, QueueEvents } from 'bullmq'
import IORedis from 'ioredis'
import { logger } from '@/lib/logger'

export type JobHandler = (job: { id: string; data: unknown; attempts: number }) => Promise<void>

export interface RedisQueueStats {
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
  total: number
}

let connection: IORedis | null = null
let queueInstance: Queue | null = null
let workers: Map<string, Worker> = new Map()

/** True si Redis está configurado (REDIS_URL existe). */
export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL)
}

/** Obtiene (o crea) la conexión a Redis. */
function getConnection(): IORedis {
  if (!connection) {
    const url = process.env.REDIS_URL!
    connection = new IORedis(url, {
      maxRetriesPerRequest: null, // BullMQ lo requiere
      enableReadyCheck: true,
    })
    connection.on('error', (err) => {
      logger.error('queue-redis.connection error', {
        error: err.message,
      })
    })
    connection.on('connect', () => {
      logger.info('queue-redis.connected')
    })
  }
  return connection
}

/** Obtiene (o crea) la instancia de la cola. */
export function getQueue(queueName = 'ecommerce-jobs'): Queue | null {
  if (!isRedisConfigured()) return null
  if (!queueInstance) {
    queueInstance = new Queue(queueName, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: 100, // mantener últimos 100 completados
        removeOnFail: 50, // mantener últimos 50 fallidos
      },
    })
    logger.info('queue-redis.queue-created', { queueName })
  }
  return queueInstance
}

/**
 * Registra un handler para un tipo de job.
 * Si Redis no está configurado, no hace nada (se usa MemoryQueue).
 */
export function registerWorker(
  jobType: string,
  handler: JobHandler,
  queueName = 'ecommerce-jobs',
): Worker | null {
  if (!isRedisConfigured()) return null

  // Evitar registrar el mismo worker dos veces.
  if (workers.has(jobType)) {
    logger.warn('queue-redis.worker-already-registered', { jobType })
    return workers.get(jobType)!
  }

  const worker = new Worker(
    queueName,
    async (job) => {
      // Filtrar por job.name === jobType
      if (job.name !== jobType) return
      logger.info('queue-redis.job-start', { jobType, jobId: job.id, attempts: job.attemptsMade + 1 })
      await handler({
        id: job.id ?? '',
        data: job.data,
        attempts: job.attemptsMade + 1,
      })
    },
    {
      connection: getConnection(),
      concurrency: 5, // procesar hasta 5 jobs en paralelo
    },
  )

  worker.on('completed', (job) => {
    logger.info('queue-redis.job-completed', { jobType, jobId: job.id })
  })

  worker.on('failed', (job, err) => {
    logger.error('queue-redis.job-failed', {
      jobType,
      jobId: job?.id,
      error: err.message,
      attempts: job?.attemptsMade,
    })
  })

  workers.set(jobType, worker)
  logger.info('queue-redis.worker-registered', { jobType })
  return worker
}

/**
 * Encola un job. Si Redis no está configurado, retorna null.
 */
export async function enqueueJob(
  jobType: string,
  data: unknown,
  queueName = 'ecommerce-jobs',
): Promise<string | null> {
  const queue = getQueue(queueName)
  if (!queue) return null

  const job = await queue.add(jobType, data)
  logger.info('queue-redis.job-enqueued', { jobType, jobId: job.id })
  return job.id ?? null
}

/**
 * Obtiene estadísticas de la cola.
 */
export async function getRedisQueueStats(queueName = 'ecommerce-jobs'): Promise<RedisQueueStats | null> {
  const queue = getQueue(queueName)
  if (!queue) return null

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ])

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed,
  }
}

/** Cierra todas las conexiones (para graceful shutdown). */
export async function closeRedisQueue(): Promise<void> {
  for (const [, worker] of workers) {
    await worker.close()
  }
  workers.clear()
  if (queueInstance) {
    await queueInstance.close()
    queueInstance = null
  }
  if (connection) {
    await connection.quit()
    connection = null
  }
  logger.info('queue-redis.closed')
}
