// ============================================================
// audit.ts — Audit log helper
// ============================================================
// Centraliza la escritura de AuditLog en la base de datos.
// Usado por API routes y por el orchestrator para registrar acciones
// críticas (login, cambio de estado de pedido, generación de guía, etc.).

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

export interface AuditInput {
  userId?: string | null
  action: string
  entity: string
  entityId?: string | null
  ip?: string | null
  metadata?: Record<string, unknown> | null
}

export interface Audit {
  log(input: AuditInput): Promise<string | null>
}

export const audit: Audit = {
  async log(input: AuditInput): Promise<string | null> {
    try {
      const record = await db.auditLog.create({
        data: {
          userId: input.userId ?? null,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId ?? null,
          ip: input.ip ?? null,
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        },
      })
      logger.info(`audit.log ${input.action}`, {
        entity: input.entity,
        entityId: input.entityId,
        auditId: record.id,
      })
      return record.id
    } catch (err) {
      // La auditoría no debe romper el flujo principal: loguea y continúa.
      logger.error('audit.log failed', {
        action: input.action,
        entity: input.entity,
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  },
}
