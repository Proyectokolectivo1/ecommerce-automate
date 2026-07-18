// ============================================================
// orders.test.ts — Pruebas del módulo Orders (FSM + order.service)
// ============================================================
// Verifica:
//   - FSM: transiciones válidas/inválidas, estados terminales.
//   - order.service: listOrders, getOrderById, getOrderStats, getRecentOrders.
//   - cod-flow: isCodOrder, requiresTransportPayment, calculateTransportCost.

import { describe, it, expect } from '../runner'
import {
  ORDER_STATES,
  ORDER_TRANSITIONS,
  canTransition,
  getAllowedTransitions,
  isTerminal,
  ORDER_STATE_LABELS,
  ORDER_STATE_COLORS,
} from '@/modules/orders/state-machine'
import {
  listOrders,
  getOrderById,
  getOrderStats,
  getRecentOrders,
  createOrderFromShopify,
  transitionStatus,
  OrderTransitionError,
  OrderNotFoundError,
} from '@/modules/orders/order.service'
import {
  isCodOrder,
  requiresTransportPayment,
  calculateTransportCost,
  isCodPendingTransportPayment,
} from '@/modules/orders/cod-flow'

export function runOrdersTests(): void {
  // ----------------------------------------------------------
  // FSM — Máquina de estados
  // ----------------------------------------------------------
  describe('Orders / FSM de estados', () => {
    it('tiene exactamente 8 estados', () => {
      expect(ORDER_STATES).toHaveLength(8)
    })

    it('los 8 estados son los esperados', () => {
      const expected = [
        'NUEVO',
        'PENDIENTE_PAGO_TRANSPORTE',
        'PAGO_TRANSPORTE_CONFIRMADO',
        'PREPARANDO',
        'ENVIADO',
        'ENTREGADO',
        'DEVUELTO',
        'CANCELADO',
      ]
      expect(ORDER_STATES).toEqual(expected)
    })

    it('NUEVO puede transicionar a PENDIENTE_PAGO_TRANSPORTE, PREPARANDO, CANCELADO', () => {
      expect(getAllowedTransitions('NUEVO')).toEqual([
        'PENDIENTE_PAGO_TRANSPORTE',
        'PREPARANDO',
        'CANCELADO',
      ])
    })

    it('PAGO_TRANSPORTE_CONFIRMADO puede ir directo a ENVIADO (fix Fase 3)', () => {
      expect(getAllowedTransitions('PAGO_TRANSPORTE_CONFIRMADO')).toContain('ENVIADO')
      expect(getAllowedTransitions('PAGO_TRANSPORTE_CONFIRMADO')).toContain('PREPARANDO')
    })

    it('ENVIADO puede transicionar a ENTREGADO y DEVUELTO', () => {
      expect(getAllowedTransitions('ENVIADO')).toEqual(['ENTREGADO', 'DEVUELTO'])
    })

    it('ENTREGADO, DEVUELTO, CANCELADO son terminales (sin transiciones)', () => {
      expect(isTerminal('ENTREGADO')).toBeTruthy()
      expect(isTerminal('DEVUELTO')).toBeTruthy()
      expect(isTerminal('CANCELADO')).toBeTruthy()
      expect(getAllowedTransitions('ENTREGADO')).toEqual([])
      expect(getAllowedTransitions('DEVUELTO')).toEqual([])
      expect(getAllowedTransitions('CANCELADO')).toEqual([])
    })

    it('NUEVO, PENDIENTE_PAGO_TRANSPORTE, PREPARANDO NO son terminales', () => {
      expect(isTerminal('NUEVO')).toBeFalsy()
      expect(isTerminal('PENDIENTE_PAGO_TRANSPORTE')).toBeFalsy()
      expect(isTerminal('PREPARANDO')).toBeFalsy()
    })

    it('canTransition valida transiciones correctas', () => {
      expect(canTransition('NUEVO', 'PREPARANDO')).toBeTruthy()
      expect(canTransition('PREPARANDO', 'ENVIADO')).toBeTruthy()
      expect(canTransition('ENVIADO', 'ENTREGADO')).toBeTruthy()
      expect(canTransition('PAGO_TRANSPORTE_CONFIRMADO', 'ENVIADO')).toBeTruthy()
    })

    it('canTransition rechaza transiciones inválidas', () => {
      expect(canTransition('NUEVO', 'ENTREGADO')).toBeFalsy()
      expect(canTransition('ENTREGADO', 'ENVIADO')).toBeFalsy()
      expect(canTransition('CANCELADO', 'NUEVO')).toBeFalsy()
      expect(canTransition('ENVIADO', 'NUEVO')).toBeFalsy()
    })

    it('todos los estados tienen etiqueta legible', () => {
      for (const s of ORDER_STATES) {
        expect(ORDER_STATE_LABELS[s]).toBeTruthy()
        expect(typeof ORDER_STATE_LABELS[s]).toBe('string')
      }
    })

    it('todos los estados tienen estilo de badge', () => {
      for (const s of ORDER_STATES) {
        expect(ORDER_STATE_COLORS[s]).toBeTruthy()
        expect(ORDER_STATE_COLORS[s].variant).toBeTruthy()
      }
    })

    it('no hay transiciones circulares (ningún estado vuelve a NUEVO)', () => {
      for (const state of ORDER_STATES) {
        if (state === 'NUEVO') continue
        expect(getAllowedTransitions(state)).not.toContain('NUEVO')
      }
    })
  })

  // ----------------------------------------------------------
  // COD Flow — Funciones puras
  // ----------------------------------------------------------
  describe('Orders / COD Flow (funciones puras)', () => {
    it('isCodOrder detecta COD correctamente', () => {
      expect(isCodOrder({ paymentMethod: 'COD' })).toBeTruthy()
      expect(isCodOrder({ paymentMethod: 'PREPAID' })).toBeFalsy()
    })

    it('isCodOrder es case-insensitive y tolera variantes', () => {
      expect(isCodOrder({ paymentMethod: 'cod' })).toBeTruthy()
      expect(isCodOrder({ paymentMethod: 'co-d' })).toBeTruthy()
      expect(isCodOrder({ paymentMethod: 'COD ' })).toBeTruthy()
    })

    it('requiresTransportPayment es true solo para COD pendiente en estado correcto', () => {
      expect(
        requiresTransportPayment({
          paymentMethod: 'COD',
          codPaid: false,
          status: 'PENDIENTE_PAGO_TRANSPORTE',
        }),
      ).toBeTruthy()
      expect(
        requiresTransportPayment({
          paymentMethod: 'COD',
          codPaid: true,
          status: 'PAGO_TRANSPORTE_CONFIRMADO',
        }),
      ).toBeFalsy()
      expect(
        requiresTransportPayment({
          paymentMethod: 'PREPAID',
          codPaid: false,
          status: 'PENDIENTE_PAGO_TRANSPORTE',
        }),
      ).toBeFalsy()
    })

    it('calculateTransportCost usa transportCost si ya está seteado', () => {
      const cost = calculateTransportCost({ transportCost: 15000, items: [] })
      expect(cost).toBe(15000)
    })

    it('calculateTransportCost calcula heurística base + peso', () => {
      const cost = calculateTransportCost({
        transportCost: 0,
        items: [{ quantity: 2, unitCost: 100, total: 200 }],
      })
      // base 5000 + (2 * 100g * 0.05) = 5000 + 10 = 5010
      expect(cost).toBeGreaterThan(5000)
      expect(cost).toBeLessThan(6000)
    })

    it('isCodPendingTransportPayment detecta COD sin pago independientemente del estado', () => {
      expect(
        isCodPendingTransportPayment({ paymentMethod: 'COD', codPaid: false, status: 'NUEVO' }),
      ).toBeTruthy()
      expect(
        isCodPendingTransportPayment({ paymentMethod: 'COD', codPaid: true, status: 'ENVIADO' }),
      ).toBeFalsy()
    })
  })

  // ----------------------------------------------------------
  // order.service — Consultas contra DB real (seed)
  // ----------------------------------------------------------
  describe('Orders / order.service (DB)', () => {
    it('listOrders devuelve pedidos y total', async () => {
      const result = await listOrders({ limit: 5, offset: 0 })
      expect(result.orders).toBeInstanceOf(Array)
      expect(result.total).toBeGreaterThan(0)
      expect(result.orders.length).toBeLessThanOrEqual(5)
    })

    it('listOrders filtra por estado', async () => {
      const result = await listOrders({ status: 'ENTREGADO', limit: 50 })
      for (const o of result.orders) {
        expect(o.status).toBe('ENTREGADO')
      }
    })

    it('listOrders filtra por método de pago', async () => {
      const result = await listOrders({ paymentMethod: 'COD', limit: 50 })
      for (const o of result.orders) {
        expect(o.paymentMethod).toBe('COD')
      }
    })

    it('listOrders soporta búsqueda', async () => {
      // Buscar por un número de pedido que exista
      const all = await listOrders({ limit: 1 })
      if (all.orders.length > 0) {
        const orderNumber = all.orders[0].orderNumber
        const searched = await listOrders({ search: orderNumber, limit: 50 })
        expect(searched.orders.length).toBeGreaterThan(0)
      }
    })

    it('getOrderById devuelve el pedido con relaciones', async () => {
      const list = await listOrders({ limit: 1 })
      if (list.orders.length > 0) {
        const id = list.orders[0].id
        const order = await getOrderById(id)
        expect(order).toBeTruthy()
        expect(order?.customer).toBeTruthy()
        expect(order?.items).toBeInstanceOf(Array)
        expect(order?.statusLogs).toBeInstanceOf(Array)
      }
    })

    it('getOrderById devuelve null para id inexistente', async () => {
      const order = await getOrderById('nonexistent-id-12345')
      expect(order).toBeNull()
    })

    it('getOrderStats devuelve conteos por estado', async () => {
      const stats = await getOrderStats()
      expect(stats.total).toBeGreaterThan(0)
      // Los conteos individuales deben sumar el total
      const sum =
        stats.NUEVO +
        stats.PENDIENTE_PAGO_TRANSPORTE +
        stats.PAGO_TRANSPORTE_CONFIRMADO +
        stats.PREPARANDO +
        stats.ENVIADO +
        stats.ENTREGADO +
        stats.DEVUELTO +
        stats.CANCELADO
      expect(sum).toBe(stats.total)
    })

    it('getOrderStats calcula codPendingCount', async () => {
      const stats = await getOrderStats()
      expect(stats.codPendingCount).toBeGreaterThanOrEqual(0)
    })

    it('getRecentOrders devuelve los últimos N pedidos', async () => {
      const recent = await getRecentOrders(5)
      expect(recent).toBeInstanceOf(Array)
      expect(recent.length).toBeLessThanOrEqual(5)
      // Verifica que están ordenados por placedAt desc
      for (let i = 1; i < recent.length; i++) {
        expect(new Date(recent[i].placedAt).getTime()).toBeLessThanOrEqual(
          new Date(recent[i - 1].placedAt).getTime(),
        )
      }
    })
  })

  // ----------------------------------------------------------
  // Errores personalizados
  // ----------------------------------------------------------
  describe('Orders / Errores personalizados', () => {
    it('OrderTransitionError tiene code y estados', () => {
      const err = new OrderTransitionError('NUEVO', 'ENTREGADO')
      expect(err.code).toBe('ORDER_INVALID_TRANSITION')
      expect(err.fromStatus).toBe('NUEVO')
      expect(err.toStatus).toBe('ENTREGADO')
      expect(err.message).toContain('NUEVO')
      expect(err.message).toContain('ENTREGADO')
    })

    it('OrderNotFoundError tiene code', () => {
      const err = new OrderNotFoundError('abc123')
      expect(err.code).toBe('ORDER_NOT_FOUND')
      expect(err.message).toContain('abc123')
    })
  })
}
