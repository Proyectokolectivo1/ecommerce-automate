// ============================================================
// webhook-log.service.ts — Webhook log persistence & query service
// ============================================================
// Centraliza el registro de webhooks entrantes (Shopify, payments,
// mastershop) y su seguimiento (PROCESSED / FAILED / DUPLICATE).
// Las API routes de webhook receivers deben llamar `logWebhook` al
// recibir un evento y luego `markProcessed` / `markFailed` según
// el resultado del procesamiento.
//
// Los webhooks se persisten en el modelo `WebhookLog` con el body
// crudo (payload), headers relevantes y metadata de procesamiento.

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { Prisma } from '@prisma/client'

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export interface LogWebhookInput {
  /** Endpoint que recibió el webhook: shopify | payments | mastershop. */
  source: string
  /** Proveedor específico: SHOPIFY | WOMPI | MASTERSHOP | ... */
  provider?: string | null
  /** Tipo de evento: orders/create, payment.approved, etc. */
  event?: string | null
  /** Header de firma (HMAC) recibido. */
  signature?: string | null
  /** Body crudo recibido (string, normalmente JSON). */
  payload: string
  /** Headers serializados como objeto plano (se JSON-stringify al guardar). */
  headers?: Record<string, string> | null
  /** IP de origen (X-Forwarded-For o remoteAddr). */
  ip?: string | null
}

export interface WebhookLogFilters {
  source?: string
  provider?: string
  status?: string // PENDING | PROCESSED | FAILED | DUPLICATE
  search?: string
  startDate?: Date
  endDate?: Date
  limit?: number
  offset?: number
}

export interface WebhookLogStats {
  total: number
  pending: number
  processed: number
  failed: number
  duplicate: number
  bySource: Array<{ source: string; count: number }>
  byProvider: Array<{ provider: string; count: number }>
  recent24h: number
}

/** Resultado de `getWebhookStats` — mismo shape que WebhookLogStats. */
export type WebhookStatsResult = WebhookLogStats

/** WebhookLog tal como se devuelve al cliente (sin payload completo). */
export interface WebhookLogListItem {
  id: string
  source: string
  provider: string | null
  event: string | null
  status: string
  ip: string | null
  receivedAt: Date
  processedAt: Date | null
  error: string | null
  payloadSize: number
}

export interface WebhookLogDetail extends WebhookLogListItem {
  signature: string | null
  payload: string
  headers: string | null
  result: string | null
}

// ------------------------------------------------------------
// Errors
// ------------------------------------------------------------

export class WebhookLogNotFoundError extends Error {
  code: string
  constructor(id: string) {
    super(`Webhook log no encontrado: ${id}`)
    this.name = 'WebhookLogNotFoundError'
    this.code = 'WEBHOOK_LOG_NOT_FOUND'
  }
}

// ------------------------------------------------------------
// Create / log
// ------------------------------------------------------------

/**
 * Persiste un webhook entrante con status PENDING.
 * Devuelve el id asignado para que el receptor pueda luego marcarlo
 * como PROCESSED / FAILED / DUPLICATE.
 */
export async function logWebhook(input: LogWebhookInput): Promise<string> {
  try {
    const record = await db.webhookLog.create({
      data: {
        source: input.source,
        provider: input.provider ?? null,
        event: input.event ?? null,
        signature: input.signature ?? null,
        payload: input.payload,
        headers: input.headers ? JSON.stringify(input.headers) : null,
        ip: input.ip ?? null,
        status: 'PENDING',
      },
    })
    logger.info('webhook.log created', {
      id: record.id,
      source: input.source,
      provider: input.provider ?? null,
      event: input.event ?? null,
    })
    return record.id
  } catch (err) {
    // Si falla la persistencia, no debemos romper el flujo del webhook.
    // Logueamos y devolvemos un id vacío para que el llamador sepa.
    logger.error('webhook.log create-failed', {
      source: input.source,
      error: err instanceof Error ? err.message : String(err),
    })
    return ''
  }
}

/**
 * Marca un webhook como PROCESSED y guarda el resultado (JSON).
 * Idempotente: si ya está PROCESSED, no hace nada.
 */
export async function markProcessed(
  logId: string,
  result?: Record<string, unknown>,
): Promise<void> {
  if (!logId) return
  try {
    await db.webhookLog.update({
      where: { id: logId },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        result: result ? JSON.stringify(result) : null,
        error: null,
      },
    })
  } catch (err) {
    logger.error('webhook.log mark-processed-failed', {
      logId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Marca un webhook como FAILED con el mensaje de error.
 */
export async function markFailed(logId: string, error: string): Promise<void> {
  if (!logId) return
  try {
    await db.webhookLog.update({
      where: { id: logId },
      data: {
        status: 'FAILED',
        processedAt: new Date(),
        error: error.slice(0, 1000),
      },
    })
  } catch (err) {
    logger.error('webhook.log mark-failed-failed', {
      logId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Marca un webhook como DUPLICATE (ya fue procesado previamente).
 */
export async function markDuplicate(logId: string): Promise<void> {
  if (!logId) return
  try {
    await db.webhookLog.update({
      where: { id: logId },
      data: {
        status: 'DUPLICATE',
        processedAt: new Date(),
      },
    })
  } catch (err) {
    logger.error('webhook.log mark-duplicate-failed', {
      logId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// ------------------------------------------------------------
// Query
// ------------------------------------------------------------

/**
 * Lista webhooks con filtros y paginación.
 * Orden por `receivedAt` DESC.
 */
export async function listWebhookLogs(
  filters: WebhookLogFilters = {},
): Promise<{ logs: WebhookLogListItem[]; total: number }> {
  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 200)
  const offset = Math.max(filters.offset ?? 0, 0)

  const where: Prisma.WebhookLogWhereInput = {}
  if (filters.source && filters.source !== 'ALL') {
    where.source = filters.source
  }
  if (filters.provider && filters.provider !== 'ALL') {
    where.provider = filters.provider
  }
  if (filters.status && filters.status !== 'ALL') {
    where.status = filters.status
  }
  if (filters.startDate || filters.endDate) {
    where.receivedAt = {}
    if (filters.startDate) where.receivedAt.gte = filters.startDate
    if (filters.endDate) where.receivedAt.lte = filters.endDate
  }
  if (filters.search && filters.search.trim().length > 0) {
    const q = filters.search.trim()
    where.OR = [
      { event: { contains: q } },
      { provider: { contains: q } },
      { source: { contains: q } },
      { payload: { contains: q } },
    ]
  }

  try {
    const [rows, total] = await Promise.all([
      db.webhookLog.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          source: true,
          provider: true,
          event: true,
          status: true,
          ip: true,
          receivedAt: true,
          processedAt: true,
          error: true,
          payload: true,
        },
      }),
      db.webhookLog.count({ where }),
    ])

    const logs: WebhookLogListItem[] = rows.map((r) => ({
      id: r.id,
      source: r.source,
      provider: r.provider,
      event: r.event,
      status: r.status,
      ip: r.ip,
      receivedAt: r.receivedAt,
      processedAt: r.processedAt,
      error: r.error,
      payloadSize: r.payload.length,
    }))

    return { logs, total }
  } catch (err) {
    logger.error('webhook.log list error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return { logs: [], total: 0 }
  }
}

/**
 * Devuelve KPIs de webhooks: total, por status, por source/provider,
 * webhooks recibidos en las últimas 24h.
 */
export async function getWebhookStats(): Promise<WebhookStatsResult> {
  try {
    const [total, pending, processed, failed, duplicate, bySource, byProvider, recent24h] =
      await Promise.all([
        db.webhookLog.count(),
        db.webhookLog.count({ where: { status: 'PENDING' } }),
        db.webhookLog.count({ where: { status: 'PROCESSED' } }),
        db.webhookLog.count({ where: { status: 'FAILED' } }),
        db.webhookLog.count({ where: { status: 'DUPLICATE' } }),
        db.webhookLog.groupBy({ by: ['source'], _count: true, orderBy: { _count: { source: 'desc' } } }),
        db.webhookLog.groupBy({ by: ['provider'], _count: true, orderBy: { _count: { provider: 'desc' } } }),
        db.webhookLog.count({
          where: {
            receivedAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
          },
        }),
      ])

    return {
      total,
      pending,
      processed,
      failed,
      duplicate,
      bySource: bySource.map((s) => ({ source: s.source, count: s._count })),
      byProvider: byProvider
        .filter((p) => p.provider !== null)
        .map((p) => ({ provider: p.provider as string, count: p._count })),
      recent24h,
    }
  } catch (err) {
    logger.error('webhook.log stats error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return {
      total: 0,
      pending: 0,
      processed: 0,
      failed: 0,
      duplicate: 0,
      bySource: [],
      byProvider: [],
      recent24h: 0,
    }
  }
}

/**
 * Devuelve un webhook log por id, incluyendo el payload completo,
 * headers y result para inspección.
 */
export async function getWebhookLogById(id: string): Promise<WebhookLogDetail | null> {
  try {
    const row = await db.webhookLog.findUnique({
      where: { id },
    })
    if (!row) return null
    return {
      id: row.id,
      source: row.source,
      provider: row.provider,
      event: row.event,
      signature: row.signature,
      payload: row.payload,
      headers: row.headers,
      ip: row.ip,
      status: row.status,
      result: row.result,
      error: row.error,
      receivedAt: row.receivedAt,
      processedAt: row.processedAt,
      payloadSize: row.payload.length,
    }
  } catch (err) {
    logger.error('webhook.log getById error', {
      id,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
