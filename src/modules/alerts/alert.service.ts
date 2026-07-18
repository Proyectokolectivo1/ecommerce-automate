// ============================================================
// alert.service.ts — Alert persistence + dedup + realtime emit
// ============================================================
// Capa de servicio para el módulo de alertas. Recibe condiciones
// (del evaluador o del worker), las deduplica contra alertas
// activas existentes (mismo type + entity), las persiste y emite
// eventos al mini-service realtime.
//
// También expone CRUD list/resolve y agregaciones para el dashboard.

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { emitAlert } from '@/lib/realtime'
import type { AlertSeverity, AlertType } from '@/lib/validation'
import type { AlertCondition } from './alert-evaluators'

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export interface Alert {
  id: string
  type: AlertType
  severity: AlertSeverity
  entity: string | null
  message: string
  resolved: boolean
  resolvedAt: Date | null
  createdAt: Date
}

export interface ListAlertsFilters {
  type?: AlertType
  severity?: AlertSeverity
  resolved?: boolean
  limit?: number
  offset?: number
}

export interface ListAlertsResult {
  alerts: Alert[]
  total: number
}

export interface ProcessAlertsResult {
  evaluated: number
  created: number
  duplicates: number
  createdIds: string[]
}

export interface AlertStats {
  total: number
  active: number
  resolved: number
  byType: Record<string, number>
  bySeverity: Record<string, number>
  critical: number
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function rowToAlert(row: {
  id: string
  type: string
  severity: string
  entity: string | null
  message: string
  resolved: boolean
  resolvedAt: Date | null
  createdAt: Date
}): Alert {
  return {
    id: row.id,
    type: row.type as AlertType,
    severity: row.severity as AlertSeverity,
    entity: row.entity,
    message: row.message,
    resolved: row.resolved,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
  }
}

// ------------------------------------------------------------
// Create with dedup
// ------------------------------------------------------------

/**
 * Crea una alerta solo si no existe una activa con mismo type + entity.
 * Si existe, devuelve la alerta existente (sin crear nueva ni emitir).
 * Si `entity` es null, la dedup se hace solo por `type` (alerta global).
 *
 * Emite un evento realtime `alert:new` cuando crea una alerta nueva.
 */
export async function createAlertIfNotExists(
  condition: AlertCondition,
): Promise<{ alert: Alert; created: boolean }> {
  // Busca alerta activa con mismo type + entity.
  const where: {
    type: string
    resolved: boolean
    entity?: string | null
  } = {
    type: condition.type,
    resolved: false,
  }
  if (condition.entity) {
    where.entity = condition.entity
  } else {
    // Alerta global (entity null): busca explícitamente entity = null.
    // Prisma: usar `entity: null` para igualdad IS NULL.
    where.entity = null
  }

  const existing = await db.alert.findFirst({
    where,
    orderBy: { createdAt: 'desc' },
  })

  if (existing) {
    logger.debug('alert.dedup skip', {
      type: condition.type,
      entity: condition.entity,
      existingId: existing.id,
    })
    return { alert: rowToAlert(existing), created: false }
  }

  const row = await db.alert.create({
    data: {
      type: condition.type,
      severity: condition.severity,
      entity: condition.entity,
      message: condition.message,
      resolved: false,
    },
  })
  const alert = rowToAlert(row)

  logger.info('alert.created', {
    id: alert.id,
    type: alert.type,
    severity: alert.severity,
    entity: alert.entity,
  })

  // Emite realtime (fire-and-forget).
  emitAlert(alert.id, alert.type, alert.severity, alert.message)

  return { alert, created: true }
}

// ------------------------------------------------------------
// Batch processing
// ------------------------------------------------------------

/**
 * Procesa un arreglo de condiciones: las deduplica y persiste.
 * Devuelve conteos y los IDs de las alertas efectivamente creadas.
 *
 * Procesa en paralelo con concurrencia controlada (5) para no
 * saturar la BD con muchas writes simultáneas.
 */
export async function processAlertConditions(
  conditions: AlertCondition[],
): Promise<ProcessAlertsResult> {
  const createdIds: string[] = []
  let created = 0
  let duplicates = 0

  const CONCURRENCY = 5
  for (let i = 0; i < conditions.length; i += CONCURRENCY) {
    const batch = conditions.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map((c) => createAlertIfNotExists(c)),
    )
    for (const r of results) {
      if (r.created) {
        created++
        createdIds.push(r.alert.id)
      } else {
        duplicates++
      }
    }
  }

  logger.info('alert.processConditions done', {
    evaluated: conditions.length,
    created,
    duplicates,
  })

  return {
    evaluated: conditions.length,
    created,
    duplicates,
    createdIds,
  }
}

// ------------------------------------------------------------
// List / Read
// ------------------------------------------------------------

export async function listAlerts(
  filters: ListAlertsFilters = {},
): Promise<ListAlertsResult> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200)
  const offset = Math.max(filters.offset ?? 0, 0)

  const where: {
    type?: string
    severity?: string
    resolved?: boolean
  } = {}
  if (filters.type) where.type = filters.type
  if (filters.severity) where.severity = filters.severity
  if (typeof filters.resolved === 'boolean') where.resolved = filters.resolved

  const [rows, total] = await Promise.all([
    db.alert.findMany({
      where,
      orderBy: [{ resolved: 'asc' }, { createdAt: 'desc' }],
      take: limit,
      skip: offset,
    }),
    db.alert.count({ where }),
  ])

  return {
    alerts: rows.map(rowToAlert),
    total,
  }
}

// ------------------------------------------------------------
// Resolve
// ------------------------------------------------------------

/**
 * Marca una alerta como resuelta (resolved=true, resolvedAt=now).
 * Lanza `AlertNotFoundError` si no existe.
 */
export async function resolveAlert(id: string): Promise<Alert> {
  const existing = await db.alert.findUnique({ where: { id } })
  if (!existing) {
    throw new AlertNotFoundError(id)
  }
  const row = await db.alert.update({
    where: { id },
    data: {
      resolved: true,
      resolvedAt: new Date(),
    },
  })
  logger.info('alert.resolved', { id, type: row.type })
  return rowToAlert(row)
}

export class AlertNotFoundError extends Error {
  code: string
  constructor(id: string) {
    super(`Alerta no encontrada: ${id}`)
    this.name = 'AlertNotFoundError'
    this.code = 'ALERT_NOT_FOUND'
  }
}

// ------------------------------------------------------------
// Stats
// ------------------------------------------------------------

export async function getAlertStats(): Promise<AlertStats> {
  const [total, active, resolved, critical, byTypeRows, bySeverityRows] =
    await Promise.all([
      db.alert.count(),
      db.alert.count({ where: { resolved: false } }),
      db.alert.count({ where: { resolved: true } }),
      db.alert.count({
        where: { resolved: false, severity: 'CRITICAL' },
      }),
      db.alert.groupBy({ by: ['type'], _count: true }),
      db.alert.groupBy({ by: ['severity'], _count: true }),
    ])

  const byType: Record<string, number> = {}
  for (const r of byTypeRows) byType[r.type] = r._count
  const bySeverity: Record<string, number> = {}
  for (const r of bySeverityRows) bySeverity[r.severity] = r._count

  return {
    total,
    active,
    resolved,
    byType,
    bySeverity,
    critical,
  }
}
