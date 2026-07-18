// ============================================================
// alerts-admin.test.ts — Pruebas de Alerts + Admin
// ============================================================

import { describe, it, expect } from '../runner'
import {
  evaluateCodUnpaid,
  evaluateGuideError,
  evaluateHighReturn,
  evaluateLowInventory,
  evaluateSalesDrop,
  evaluateAllAlerts,
  ALERT_EVALUATORS,
  ALERT_THRESHOLDS,
} from '@/modules/alerts/alert-evaluators'
import {
  listAlerts,
  getAlertStats,
  createAlertIfNotExists,
  processAlertConditions,
  resolveAlert,
} from '@/modules/alerts/alert.service'
import { listUsers, getUserById, getUserStats, createUser, UserError } from '@/modules/admin/user.service'
import { listAuditLogs, getAuditStats } from '@/modules/admin/audit.service'
import { hashPassword, verifyPassword, canAccess, ROLES } from '@/lib/auth-utils'

export function runAlertsAdminTests(): void {
  // ----------------------------------------------------------
  // auth-utils — Funciones puras
  // ----------------------------------------------------------
  describe('Admin / auth-utils (funciones puras)', () => {
    it('hashPassword genera hash consistente', () => {
      const hash1 = hashPassword('test123')
      const hash2 = hashPassword('test123')
      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(64) // sha256 hex
    })

    it('hashPassword genera hashes diferentes para passwords diferentes', () => {
      const hash1 = hashPassword('test123')
      const hash2 = hashPassword('test456')
      expect(hash1).not.toBe(hash2)
    })

    it('hashPassword lanza error si password es vacío', () => {
      try {
        hashPassword('')
        throw new Error('Debería lanzar error')
      } catch (err) {
        expect((err as Error).message).toContain('vacía')
      }
    })

    it('verifyPassword valida contraseña correcta', () => {
      const hash = hashPassword('miPassword123')
      expect(verifyPassword('miPassword123', hash)).toBeTruthy()
    })

    it('verifyPassword rechaza contraseña incorrecta', () => {
      const hash = hashPassword('miPassword123')
      expect(verifyPassword('wrongPassword', hash)).toBeFalsy()
    })

    it('verifyPassword rechaza hash vacío', () => {
      expect(verifyPassword('test', '')).toBeFalsy()
    })

    it('canAccess permite ADMIN a todo', () => {
      expect(canAccess('ADMIN', 'BODEGA')).toBeTruthy()
      expect(canAccess('ADMIN', 'GERENCIA', 'BODEGA')).toBeTruthy()
      expect(canAccess('ADMIN')).toBeTruthy()
    })

    it('canAccess respeta roles permitidos', () => {
      expect(canAccess('BODEGA', 'BODEGA')).toBeTruthy()
      expect(canAccess('BODEGA', 'GERENCIA')).toBeFalsy()
      expect(canAccess('GERENCIA', 'GERENCIA', 'ADMIN')).toBeTruthy()
    })

    it('canAccess rechaza rol vacío', () => {
      expect(canAccess('', 'ADMIN')).toBeFalsy()
    })

    it('ROLES tiene 4 roles', () => {
      expect(Object.keys(ROLES)).toHaveLength(4)
      expect(ROLES.ADMIN).toBe('ADMIN')
      expect(ROLES.GERENCIA).toBe('GERENCIA')
      expect(ROLES.BODEGA).toBe('BODEGA')
      expect(ROLES.SERVICIO).toBe('SERVICIO')
    })
  })

  // ----------------------------------------------------------
  // Alert Evaluators (DB)
  // ----------------------------------------------------------
  describe('Alerts / Evaluadores (DB)', () => {
    it('hay 5 evaluadores registrados', () => {
      expect(ALERT_EVALUATORS).toHaveLength(5)
      const types = ALERT_EVALUATORS.map((e) => e.type)
      expect(types).toContain('COD_UNPAID')
      expect(types).toContain('GUIDE_ERROR')
      expect(types).toContain('HIGH_RETURN')
      expect(types).toContain('LOW_INVENTORY')
      expect(types).toContain('SALES_DROP')
    })

    it('ALERT_THRESHOLDS tiene valores razonables', () => {
      expect(ALERT_THRESHOLDS.COD_UNPAID_HOURS).toBeGreaterThan(0)
      expect(ALERT_THRESHOLDS.HIGH_RETURN_RATE).toBeGreaterThan(0)
      expect(ALERT_THRESHOLDS.LOW_INVENTORY_QTY).toBeGreaterThan(0)
      expect(ALERT_THRESHOLDS.SALES_DROP_PERCENTAGE).toBeGreaterThan(0)
    })

    it('evaluateCodUnpaid devuelve array (puede ser vacío)', async () => {
      const conditions = await evaluateCodUnpaid()
      expect(conditions).toBeInstanceOf(Array)
      for (const c of conditions) {
        expect(c.type).toBe('COD_UNPAID')
        expect(c.entity).toBeTruthy()
        expect(c.message).toBeTruthy()
      }
    })

    it('evaluateGuideError devuelve array', async () => {
      const conditions = await evaluateGuideError()
      expect(conditions).toBeInstanceOf(Array)
      for (const c of conditions) {
        expect(c.type).toBe('GUIDE_ERROR')
      }
    })

    it('evaluateHighReturn devuelve array (0 o 1 elemento)', async () => {
      const conditions = await evaluateHighReturn()
      expect(conditions).toBeInstanceOf(Array)
      expect(conditions.length).toBeLessThanOrEqual(1)
      if (conditions.length > 0) {
        expect(conditions[0].type).toBe('HIGH_RETURN')
      }
    })

    it('evaluateLowInventory devuelve array', async () => {
      const conditions = await evaluateLowInventory()
      expect(conditions).toBeInstanceOf(Array)
      for (const c of conditions) {
        expect(c.type).toBe('LOW_INVENTORY')
        expect(c.entity).toBeTruthy()
      }
    })

    it('evaluateSalesDrop devuelve array (0 o 1 elemento)', async () => {
      const conditions = await evaluateSalesDrop()
      expect(conditions).toBeInstanceOf(Array)
      expect(conditions.length).toBeLessThanOrEqual(1)
    })

    it('evaluateAllAlerts ejecuta los 5 evaluadores', async () => {
      const conditions = await evaluateAllAlerts()
      expect(conditions).toBeInstanceOf(Array)
      // Cada condición debe tener un tipo válido
      const validTypes = ['COD_UNPAID', 'GUIDE_ERROR', 'HIGH_RETURN', 'LOW_INVENTORY', 'SALES_DROP']
      for (const c of conditions) {
        expect(validTypes).toContain(c.type)
        expect(c.severity).toBeTruthy()
        expect(c.message).toBeTruthy()
      }
    })
  })

  // ----------------------------------------------------------
  // Alert Service (DB)
  // ----------------------------------------------------------
  describe('Alerts / alert.service (DB)', () => {
    it('listAlerts devuelve alertas y total', async () => {
      const result = await listAlerts({ limit: 10 })
      expect(result.alerts).toBeInstanceOf(Array)
      expect(result.total).toBeGreaterThanOrEqual(0)
    })

    it('listAlerts filtra por tipo', async () => {
      const result = await listAlerts({ type: 'LOW_INVENTORY', limit: 50 })
      for (const a of result.alerts) {
        expect(a.type).toBe('LOW_INVENTORY')
      }
    })

    it('listAlerts filtra por resolved', async () => {
      const active = await listAlerts({ resolved: false, limit: 50 })
      for (const a of active.alerts) {
        expect(a.resolved).toBeFalsy()
      }
      const resolved = await listAlerts({ resolved: true, limit: 50 })
      for (const a of resolved.alerts) {
        expect(a.resolved).toBeTruthy()
      }
    })

    it('getAlertStats devuelve estadísticas completas', async () => {
      const stats = await getAlertStats()
      expect(stats.total).toBeGreaterThanOrEqual(0)
      expect(stats.active).toBeGreaterThanOrEqual(0)
      expect(stats.resolved).toBeGreaterThanOrEqual(0)
      expect(stats.active + stats.resolved).toBe(stats.total)
      expect(stats.byType).toBeInstanceOf(Object)
      expect(stats.bySeverity).toBeInstanceOf(Object)
      expect(stats.critical).toBeGreaterThanOrEqual(0)
    })

    it('createAlertIfNotExists es idempotente (no duplica)', async () => {
      // Crear una alerta de test con entidad única (timestamp para evitar colisión entre runs)
      const uniqueEntity = `test-idempotencia-${Date.now()}`
      const condition = {
        type: 'LOW_INVENTORY' as const,
        severity: 'WARNING' as const,
        entity: uniqueEntity,
        message: 'Test idempotencia - no duplicar',
      }

      const first = await createAlertIfNotExists(condition)
      expect(first).toBeTruthy()
      expect(first!.created).toBeTruthy()

      // Segunda vez con misma entidad → no debe crear duplicado
      const second = await createAlertIfNotExists(condition)
      expect(second).toBeTruthy()
      expect(second!.created).toBeFalsy()
      expect(second!.id).toBe(first!.id)
    })

    it('processAlertConditions procesa un batch', async () => {
      const conditions = await evaluateAllAlerts()
      const result = await processAlertConditions(conditions)
      expect(result.evaluated).toBe(conditions.length)
      expect(result.created).toBeGreaterThanOrEqual(0)
      expect(result.duplicates).toBeGreaterThanOrEqual(0)
      expect(result.created + result.duplicates).toBe(result.evaluated)
    })
  })

  // ----------------------------------------------------------
  // Admin — user.service (DB)
  // ----------------------------------------------------------
  describe('Admin / user.service (DB)', () => {
    it('listUsers devuelve usuarios y total', async () => {
      const result = await listUsers({ limit: 10 })
      expect(result.users).toBeInstanceOf(Array)
      expect(result.total).toBeGreaterThan(0) // hay 4 seed
    })

    it('listUsers filtra por rol', async () => {
      const result = await listUsers({ role: 'ADMIN', limit: 50 })
      for (const u of result.users) {
        expect(u.role).toBe('ADMIN')
      }
    })

    it('listUsers nunca expone passwordHash', async () => {
      const result = await listUsers({ limit: 50 })
      for (const u of result.users) {
        expect(u).not.toHaveProperty('passwordHash')
      }
    })

    it('getUserById devuelve usuario sin passwordHash', async () => {
      const list = await listUsers({ limit: 1 })
      if (list.users.length > 0) {
        const user = await getUserById(list.users[0].id)
        expect(user).toBeTruthy()
        expect(user).not.toHaveProperty('passwordHash')
      }
    })

    it('getUserById devuelve null para id inexistente', async () => {
      const user = await getUserById('nonexistent-id')
      expect(user).toBeNull()
    })

    it('getUserStats devuelve conteos por rol', async () => {
      const stats = await getUserStats()
      expect(stats.total).toBeGreaterThan(0)
      expect(stats.active).toBeGreaterThanOrEqual(0)
      expect(stats.inactive).toBeGreaterThanOrEqual(0)
      expect(stats.active + stats.inactive).toBe(stats.total)
      expect(stats.byRole).toBeInstanceOf(Object)
    })

    it('createUser + deleteUser funcionan correctamente', async () => {
      // Email único con timestamp para evitar colisión entre ejecuciones
      const uniqueEmail = `test-unit-${Date.now()}@test.com`

      // Crear
      const created = await createUser({
        email: uniqueEmail,
        name: 'Test User',
        password: 'testpass123',
        role: 'SERVICIO',
      })
      expect(created.email).toBe(uniqueEmail)
      expect(created.role).toBe('SERVICIO')
      expect(created.active).toBeTruthy()
      expect(created).not.toHaveProperty('passwordHash')

      // Verificar que no se puede crear duplicado
      try {
        await createUser({
          email: uniqueEmail,
          password: 'another',
          role: 'BODEGA',
        })
        throw new Error('Debería lanzar error de email duplicado')
      } catch (err) {
        expect(err).toBeInstanceOf(UserError)
        expect((err as UserError).code).toBe('EMAIL_EXISTS')
      }

      // Eliminar
      const { deleteUser } = await import('@/modules/admin/user.service')
      await deleteUser(created.id, 'different-actor-id')
    })

    it('UserError tiene code y message', () => {
      const err = new UserError('TEST_CODE', 'Test message')
      expect(err.code).toBe('TEST_CODE')
      expect(err.message).toBe('Test message')
      expect(err.name).toBe('UserError')
    })
  })

  // ----------------------------------------------------------
  // Admin — audit.service (DB)
  // ----------------------------------------------------------
  describe('Admin / audit.service (DB)', () => {
    it('listAuditLogs devuelve logs y total', async () => {
      const result = await listAuditLogs({ limit: 10 })
      expect(result.logs).toBeInstanceOf(Array)
      expect(result.total).toBeGreaterThanOrEqual(0)
    })

    it('listAuditLogs incluye datos del usuario', async () => {
      const result = await listAuditLogs({ limit: 5 })
      for (const log of result.logs) {
        // user puede ser null (acciones del sistema) pero la relación debe existir
        if (log.userId) {
          expect(log.user).toBeTruthy()
          expect(log.user?.email).toBeTruthy()
        }
      }
    })

    it('listAuditLogs filtra por action', async () => {
      const result = await listAuditLogs({ action: 'GUIDE_PRINTED', limit: 50 })
      for (const log of result.logs) {
        expect(log.action).toBe('GUIDE_PRINTED')
      }
    })

    it('listAuditLogs ordena por createdAt desc', async () => {
      const result = await listAuditLogs({ limit: 20 })
      for (let i = 1; i < result.logs.length; i++) {
        expect(new Date(result.logs[i].createdAt).getTime()).toBeLessThanOrEqual(
          new Date(result.logs[i - 1].createdAt).getTime(),
        )
      }
    })

    it('getAuditStats devuelve estadísticas completas', async () => {
      const stats = await getAuditStats()
      expect(stats.total).toBeGreaterThanOrEqual(0)
      expect(stats.today).toBeGreaterThanOrEqual(0)
      expect(stats.last24h).toBeGreaterThanOrEqual(0)
      expect(stats.last7d).toBeGreaterThanOrEqual(0)
      expect(stats.byAction).toBeInstanceOf(Array)
      expect(stats.byEntity).toBeInstanceOf(Array)
    })
  })
}
