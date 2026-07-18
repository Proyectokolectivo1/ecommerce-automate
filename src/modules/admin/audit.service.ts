// ============================================================
// audit.service.ts — Audit log query service
// ============================================================
// Servicio de lectura del log de auditoría (AuditLog).
// Las escrituras se hacen vía `audit.log()` desde los servicios y
// API routes; aquí exponemos consultas para el panel de auditoría.
//
// Funciones exportadas:
//   - listAuditLogs(filters)   → listado paginado con filtros
//   - getAuditStats()          → KPIs (total, por acción, 24h)
//   - getDistinctActions()     → acciones únicas para filtros UI
//   - getDistinctEntities()    → entidades únicas para filtros UI

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { Prisma } from '@prisma/client'

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export interface AuditLogListItem {
  id: string
  userId: string | null
  userName: string | null
  userEmail: string | null
  action: string
  entity: string
  entityId: string | null
  ip: string | null
  metadata: Record<string, unknown> | null
  createdAt: Date
}

export interface AuditLogFilters {
  search?: string
  action?: string
  entity?: string
  userId?: string
  startDate?: Date
  endDate?: Date
  limit?: number
  offset?: number
}

/** Detalle de un log de auditoría (mismo shape que AuditLogListItem). */
export type AuditLogDetail = AuditLogListItem

export interface AuditStats {
  total: number
  recent24h: number
  recent7d: number
  byAction: Array<{ action: string; count: number }>
  byEntity: Array<{ entity: string; count: number }>
  topUsers: Array<{ userId: string; userName: string; count: number }>
}

export interface DistinctValue {
  value: string
  count: number
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function parseMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return { _raw: raw }
  }
}

// ------------------------------------------------------------
// List
// ------------------------------------------------------------

export async function listAuditLogs(
  filters: AuditLogFilters = {},
): Promise<{ logs: AuditLogListItem[]; total: number }> {
  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 200)
  const offset = Math.max(filters.offset ?? 0, 0)

  const where: Prisma.AuditLogWhereInput = {}
  if (filters.action && filters.action !== 'ALL') {
    where.action = filters.action
  }
  if (filters.entity && filters.entity !== 'ALL') {
    where.entity = filters.entity
  }
  if (filters.userId) {
    where.userId = filters.userId
  }
  if (filters.startDate || filters.endDate) {
    where.createdAt = {}
    if (filters.startDate) where.createdAt.gte = filters.startDate
    if (filters.endDate) where.createdAt.lte = filters.endDate
  }
  if (filters.search && filters.search.trim().length > 0) {
    const q = filters.search.trim()
    where.OR = [
      { action: { contains: q } },
      { entity: { contains: q } },
      { entityId: { contains: q } },
      { ip: { contains: q } },
      { metadata: { contains: q } },
      { user: { email: { contains: q } } },
      { user: { name: { contains: q } } },
    ]
  }

  try {
    const [rows, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.auditLog.count({ where }),
    ])

    const logs: AuditLogListItem[] = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.user?.name ?? null,
      userEmail: r.user?.email ?? null,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      ip: r.ip,
      metadata: parseMetadata(r.metadata),
      createdAt: r.createdAt,
    }))

    return { logs, total }
  } catch (err) {
    logger.error('audit.service list error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return { logs: [], total: 0 }
  }
}

// ------------------------------------------------------------
// Stats
// ------------------------------------------------------------

export async function getAuditStats(): Promise<AuditStats> {
  try {
    const now = Date.now()
    const since24h = new Date(now - 24 * 60 * 60 * 1000)
    const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000)

    const [total, recent24h, recent7d, byAction, byEntity] = await Promise.all([
      db.auditLog.count(),
      db.auditLog.count({ where: { createdAt: { gte: since24h } } }),
      db.auditLog.count({ where: { createdAt: { gte: since7d } } }),
      db.auditLog.groupBy({
        by: ['action'],
        _count: true,
        orderBy: { _count: { action: 'desc' } },
        take: 15,
      }),
      db.auditLog.groupBy({
        by: ['entity'],
        _count: true,
        orderBy: { _count: { entity: 'desc' } },
        take: 15,
      }),
    ])

    // Top usuarios por actividad (solo los que tienen userId).
    const topUserGroups = await db.auditLog.groupBy({
      by: ['userId'],
      _count: true,
      orderBy: { _count: { userId: 'desc' } },
      take: 5,
    })
    const userIds = topUserGroups
      .filter((g) => g.userId !== null)
      .map((g) => g.userId as string)
    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    })
    const userMap = new Map(users.map((u) => [u.id, u.name]))
    const topUsers = topUserGroups
      .filter((g) => g.userId !== null)
      .map((g) => ({
        userId: g.userId as string,
        userName: userMap.get(g.userId as string) ?? 'Usuario eliminado',
        count: g._count,
      }))

    return {
      total,
      recent24h,
      recent7d,
      byAction: byAction.map((g) => ({ action: g.action, count: g._count })),
      byEntity: byEntity.map((g) => ({ entity: g.entity, count: g._count })),
      topUsers,
    }
  } catch (err) {
    logger.error('audit.service stats error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return {
      total: 0,
      recent24h: 0,
      recent7d: 0,
      byAction: [],
      byEntity: [],
      topUsers: [],
    }
  }
}

// ------------------------------------------------------------
// Distinct values (para filtros UI)
// ------------------------------------------------------------

export async function getDistinctActions(): Promise<DistinctValue[]> {
  try {
    const groups = await db.auditLog.groupBy({
      by: ['action'],
      _count: true,
      orderBy: { _count: { action: 'desc' } },
    })
    return groups.map((g) => ({ value: g.action, count: g._count }))
  } catch (err) {
    logger.error('audit.service distinct-actions error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

export async function getDistinctEntities(): Promise<DistinctValue[]> {
  try {
    const groups = await db.auditLog.groupBy({
      by: ['entity'],
      _count: true,
      orderBy: { _count: { entity: 'desc' } },
    })
    return groups.map((g) => ({ value: g.entity, count: g._count }))
  } catch (err) {
    logger.error('audit.service distinct-entities error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}
