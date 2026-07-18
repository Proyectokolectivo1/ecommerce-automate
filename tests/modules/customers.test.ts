// ============================================================
// customers.test.ts — Pruebas del módulo Customers
// ============================================================
// Verifica:
//   - classification: algoritmo puro (VIP/Frecuente/Nuevo/Inactivo).
//   - customer.service: list, stats, reclassify.

import { describe, it, expect } from '../runner'
import {
  classifyCustomer,
  calculateDaysSinceLastOrder,
  buildCustomerStats,
  needsReclassification,
  CLASSIFICATION_THRESHOLDS,
  CLASSIFICATION_LABELS,
  CLASSIFICATION_BADGE_CLASSES,
} from '@/modules/customers/classification'
import {
  listCustomers,
  getCustomerById,
  getCustomerStats,
  reclassifyCustomer,
  reclassifyAllCustomers,
  getDaysSinceLastOrder,
} from '@/modules/customers/customer.service'

export function runCustomersTests(): void {
  // ----------------------------------------------------------
  // Classification — Algoritmo puro (sin DB)
  // ----------------------------------------------------------
  describe('Customers / Clasificación (algoritmo puro)', () => {
    it('VIP: alto gasto + alta frecuencia', () => {
      const result = classifyCustomer({
        totalSpent: 3_000_000,
        ordersCount: 8,
        daysSinceLastOrder: 5,
      })
      expect(result).toBe('VIP')
    })

    it('FRECUENTE: 3+ pedidos pero sin llegar a VIP', () => {
      const result = classifyCustomer({
        totalSpent: 500_000,
        ordersCount: 4,
        daysSinceLastOrder: 10,
      })
      expect(result).toBe('FRECUENTE')
    })

    it('NUEVO: 1-2 pedidos reciente', () => {
      const result = classifyCustomer({
        totalSpent: 100_000,
        ordersCount: 1,
        daysSinceLastOrder: 15,
      })
      expect(result).toBe('NUEVO')
    })

    it('INACTIVO: sin actividad >90 días', () => {
      const result = classifyCustomer({
        totalSpent: 5_000_000,
        ordersCount: 10,
        daysSinceLastOrder: 100,
      })
      expect(result).toBe('INACTIVO')
    })

    it('INACTIVO tiene prioridad sobre VIP (cliente que fue VIP pero inactivo)', () => {
      const result = classifyCustomer({
        totalSpent: 10_000_000,
        ordersCount: 20,
        daysSinceLastOrder: 120,
      })
      expect(result).toBe('INACTIVO')
    })

    it('INACTIVO cuando nunca ha comprado (daysSinceLastOrder null)', () => {
      const result = classifyCustomer({
        totalSpent: 0,
        ordersCount: 0,
        daysSinceLastOrder: null,
      })
      expect(result).toBe('INACTIVO')
    })

    it('umbral VIP es exactamente 2M + 5 pedidos', () => {
      // Exactamente en el umbral → VIP
      expect(
        classifyCustomer({
          totalSpent: CLASSIFICATION_THRESHOLDS.VIP_MIN_SPENT,
          ordersCount: CLASSIFICATION_THRESHOLDS.VIP_MIN_ORDERS,
          daysSinceLastOrder: 1,
        }),
      ).toBe('VIP')

      // Un peso menos → FRECUENTE (si tiene 5+ pedidos)
      expect(
        classifyCustomer({
          totalSpent: CLASSIFICATION_THRESHOLDS.VIP_MIN_SPENT - 1,
          ordersCount: CLASSIFICATION_THRESHOLDS.VIP_MIN_ORDERS,
          daysSinceLastOrder: 1,
        }),
      ).toBe('FRECUENTE')
    })

    it('umbral INACTIVO es exactamente 90 días', () => {
      // 90 días → todavía no inactivo (es > 90, no >=)
      expect(
        classifyCustomer({
          totalSpent: 100_000,
          ordersCount: 1,
          daysSinceLastOrder: 90,
        }),
      ).toBe('NUEVO')

      // 91 días → inactivo
      expect(
        classifyCustomer({
          totalSpent: 100_000,
          ordersCount: 1,
          daysSinceLastOrder: 91,
        }),
      ).toBe('INACTIVO')
    })
  })

  // ----------------------------------------------------------
  // Helpers de clasificación
  // ----------------------------------------------------------
  describe('Customers / Helpers de clasificación', () => {
    it('calculateDaysSinceLastOrder devuelve null si no hay fecha', () => {
      expect(calculateDaysSinceLastOrder(null)).toBeNull()
    })

    it('calculateDaysSinceLastOrder calcula días correctamente', () => {
      const tenDaysAgo = new Date()
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)
      const days = calculateDaysSinceLastOrder(tenDaysAgo)
      expect(days).toBeGreaterThanOrEqual(9)
      expect(days).toBeLessThanOrEqual(11)
    })

    it('buildCustomerStats construye el objeto desde un customer', () => {
      const stats = buildCustomerStats({
        totalSpent: 1_000_000,
        ordersCount: 3,
        lastOrderAt: new Date(),
      })
      expect(stats.totalSpent).toBe(1_000_000)
      expect(stats.ordersCount).toBe(3)
      expect(stats.daysSinceLastOrder).toBeGreaterThanOrEqual(0)
      expect(stats.daysSinceLastOrder).toBeLessThanOrEqual(1)
    })

    it('needsReclassification detecta cuando hay cambio', () => {
      // Si la clasificación actual es NUEVO pero los stats dicen VIP
      expect(
        needsReclassification('NUEVO', {
          totalSpent: 5_000_000,
          ordersCount: 10,
          daysSinceLastOrder: 1,
        }),
      ).toBeTruthy()
    })

    it('needsReclassification detecta cuando NO hay cambio', () => {
      expect(
        needsReclassification('VIP', {
          totalSpent: 5_000_000,
          ordersCount: 10,
          daysSinceLastOrder: 1,
        }),
      ).toBeFalsy()
    })

    it('todas las clasificaciones tienen etiqueta y badge', () => {
      const classes = ['VIP', 'FRECUENTE', 'NUEVO', 'INACTIVO'] as const
      for (const cls of classes) {
        expect(CLASSIFICATION_LABELS[cls]).toBeTruthy()
        expect(CLASSIFICATION_BADGE_CLASSES[cls]).toBeTruthy()
      }
    })
  })

  // ----------------------------------------------------------
  // customer.service — Consultas contra DB real
  // ----------------------------------------------------------
  describe('Customers / customer.service (DB)', () => {
    it('listCustomers devuelve clientes y total', async () => {
      const result = await listCustomers({ limit: 5 })
      expect(result.customers).toBeInstanceOf(Array)
      expect(result.total).toBeGreaterThan(0)
    })

    it('listCustomers filtra por clasificación', async () => {
      const result = await listCustomers({ classification: 'VIP', limit: 50 })
      for (const c of result.customers) {
        expect(c.classification).toBe('VIP')
      }
    })

    it('listCustomers soporta búsqueda por email', async () => {
      const all = await listCustomers({ limit: 1 })
      if (all.customers.length > 0 && all.customers[0].email) {
        const email = all.customers[0].email!
        const searched = await listCustomers({ search: email, limit: 50 })
        expect(searched.customers.length).toBeGreaterThan(0)
      }
    })

    it('listCustomers ordena por totalSpent desc', async () => {
      const result = await listCustomers({ sortBy: 'totalSpent', sortOrder: 'desc', limit: 20 })
      for (let i = 1; i < result.customers.length; i++) {
        expect(result.customers[i].totalSpent).toBeLessThanOrEqual(
          result.customers[i - 1].totalSpent,
        )
      }
    })

    it('getCustomerById devuelve el cliente con historial de pedidos', async () => {
      const list = await listCustomers({ limit: 1 })
      if (list.customers.length > 0) {
        const id = list.customers[0].id
        const customer = await getCustomerById(id)
        expect(customer).toBeTruthy()
        expect(customer?.orders).toBeInstanceOf(Array)
      }
    })

    it('getCustomerById devuelve null para id inexistente', async () => {
      const customer = await getCustomerById('nonexistent-id')
      expect(customer).toBeNull()
    })

    it('getCustomerStats devuelve conteos por clasificación', async () => {
      const stats = await getCustomerStats()
      expect(stats.total).toBeGreaterThan(0)
      const sum =
        stats.byClassification.VIP +
        stats.byClassification.FRECUENTE +
        stats.byClassification.NUEVO +
        stats.byClassification.INACTIVO
      expect(sum).toBe(stats.total)
    })

    it('getCustomerStats calcula ticket promedio', async () => {
      const stats = await getCustomerStats()
      expect(stats.avgTicket).toBeGreaterThanOrEqual(0)
    })
  })

  // ----------------------------------------------------------
  // Reclassification — Batch
  // ----------------------------------------------------------
  describe('Customers / Reclassification (DB)', () => {
    it('reclassifyAllCustomers procesa todos los clientes', async () => {
      const result = await reclassifyAllCustomers()
      expect(result.checked).toBeGreaterThan(0)
      expect(result.reclassified).toBeGreaterThanOrEqual(0)
    })

    it('reclassifyAllCustomers es idempotente (segunda ejecución = 0 reclasificados)', async () => {
      // Primera ejecución (puede reclasificar algunos)
      await reclassifyAllCustomers()
      // Segunda ejecución: no debe reclasificar ninguno (ya están actualizados)
      const result = await reclassifyAllCustomers()
      expect(result.reclassified).toBe(0)
    })

    it('getDaysSinceLastOrder devuelve null si no hay fecha', () => {
      expect(getDaysSinceLastOrder({ lastOrderAt: null })).toBeNull()
    })

    it('getDaysSinceLastOrder devuelve número si hay fecha', () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const days = getDaysSinceLastOrder({ lastOrderAt: yesterday })
      expect(days).toBeGreaterThanOrEqual(0)
      expect(days).toBeLessThanOrEqual(2)
    })
  })
}
