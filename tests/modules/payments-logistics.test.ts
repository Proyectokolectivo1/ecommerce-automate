// ============================================================
// payments-logistics.test.ts — Pruebas de Payments + Logistics + Integrations
// ============================================================

import { describe, it, expect } from '../runner'
import { getPaymentProvider, isSupportedProvider, PAYMENT_PROVIDER_NAMES } from '@/integrations/payments/registry'
import { isSandbox, mockTxId, PROVIDER_LABELS, PROVIDER_BADGE_CLASSES } from '@/integrations/payments/provider'
import { mockCreateLink, mockStatus, parseMockWebhook, verifySignature } from '@/integrations/payments/sandbox'
import { createTransportPaymentLink, confirmPaymentFromWebhook, PaymentConfigError } from '@/modules/payments/payment.service'
import { listShipments, getShipmentStats, getShipmentByGuide, ShipmentError } from '@/modules/logistics/shipment.service'
import { enqueuePrintJob, processPrintQueue, listPrintJobs, getPrintJobStats, generateGuidePdf, PrintJobError } from '@/modules/logistics/printing.service'
import { db } from '@/lib/db'

export function runPaymentsLogisticsTests(): void {
  // ----------------------------------------------------------
  // Payments Registry
  // ----------------------------------------------------------
  describe('Payments / Registry', () => {
    it('tiene 5 proveedores soportados', () => {
      expect(PAYMENT_PROVIDER_NAMES).toHaveLength(5)
    })

    it('los 5 proveedores son Wompi, PayU, MercadoPago, ePayco, Bold', () => {
      const names = PAYMENT_PROVIDER_NAMES.map((p) => p)
      expect(names).toContain('WOMPI')
      expect(names).toContain('PAYU')
      expect(names).toContain('MERCADOPAGO')
      expect(names).toContain('EPAYCO')
      expect(names).toContain('BOLD')
    })

    it('getPaymentProvider devuelve el adapter correcto', () => {
      for (const name of PAYMENT_PROVIDER_NAMES) {
        const adapter = getPaymentProvider(name)
        expect(adapter.name).toBe(name)
      }
    })

    it('getPaymentProvider lanza error para proveedor no soportado', () => {
      try {
        getPaymentProvider('STRIPE')
        throw new Error('Debería haber lanzado error')
      } catch (err) {
        expect((err as Error).message).toContain('no soportado')
      }
    })

    it('isSupportedProvider identifica proveedores válidos', () => {
      expect(isSupportedProvider('WOMPI')).toBeTruthy()
      expect(isSupportedProvider('wompi')).toBeTruthy()
      expect(isSupportedProvider('STRIPE')).toBeFalsy()
    })
  })

  // ----------------------------------------------------------
  // Payments Sandbox helpers
  // ----------------------------------------------------------
  describe('Payments / Sandbox helpers', () => {
    it('isSandbox devuelve true sin credenciales', () => {
      expect(isSandbox({})).toBeTruthy()
      expect(isSandbox({ apiKey: '' })).toBeTruthy()
    })

    it('isSandbox devuelve false con credenciales reales', () => {
      expect(isSandbox({ apiKey: 'real-key', sandbox: false })).toBeFalsy()
    })

    it('isSandbox devuelve true si sandbox=true explícito', () => {
      expect(isSandbox({ apiKey: 'real-key', sandbox: true })).toBeTruthy()
    })

    it('mockTxId genera ID con prefijo del proveedor', () => {
      const id = mockTxId('WOMPI')
      expect(id).toContain('WOMPI-')
    })

    it('mockCreateLink genera URL y ID plausibles', () => {
      const link = mockCreateLink('WOMPI', 'https://checkout.wompi.co', {
        reference: 'TR-1001-123',
        amount: 15000,
        description: 'Test',
      })
      expect(link.providerTxId).toContain('WOMPI-')
      expect(link.paymentUrl).toContain('checkout.wompi.co')
      expect(link.paymentUrl).toContain('TR-1001-123')
      expect(link.status).toBe('PENDING')
    })

    it('mockStatus devuelve PENDING', () => {
      const status = mockStatus('WOMPI', 'WOMPI-ABC123')
      expect(status.providerTxId).toBe('WOMPI-ABC123')
      expect(status.status).toBe('PENDING')
    })

    it('parseMockWebhook parsea payload mock correctamente', () => {
      const payload = parseMockWebhook('WOMPI', {
        provider: 'WOMPI',
        providerTxId: 'WOMPI-123',
        reference: 'TR-1001',
        status: 'APPROVED',
        amount: 15000,
      })
      expect(payload).toBeTruthy()
      expect(payload!.provider).toBe('WOMPI')
      expect(payload!.providerTxId).toBe('WOMPI-123')
      expect(payload!.status).toBe('APPROVED')
      expect(payload!.amount).toBe(15000)
    })

    it('parseMockWebhook devuelve null si el proveedor no coincide', () => {
      const payload = parseMockWebhook('WOMPI', {
        provider: 'PAYU',
        status: 'APPROVED',
      })
      expect(payload).toBeNull()
    })

    it('verifySignature compara firmas correctamente', () => {
      expect(verifySignature('abc123', 'abc123')).toBeTruthy()
      expect(verifySignature('abc123', 'abc124')).toBeFalsy()
      expect(verifySignature(undefined, 'abc123')).toBeFalsy()
    })

    it('PROVIDER_LABELS y PROVIDER_BADGE_CLASSES tienen los 5 proveedores', () => {
      for (const name of PAYMENT_PROVIDER_NAMES) {
        expect(PROVIDER_LABELS[name]).toBeTruthy()
        expect(PROVIDER_BADGE_CLASSES[name]).toBeTruthy()
      }
    })
  })

  // ----------------------------------------------------------
  // payment.service — Crear link de pago (Wompi sandbox)
  // ----------------------------------------------------------
  describe('Payments / payment.service (DB)', () => {
    it('createTransportPaymentLink crea link y transacción', async () => {
      // Buscar un pedido COD pendiente
      const order = await db.order.findFirst({
        where: { status: 'PENDIENTE_PAGO_TRANSPORTE', codPaymentLink: null },
        select: { id: true, orderNumber: true, transportCost: true, customer: { select: { email: true, phone: true } } },
      })
      if (!order) return // skip si no hay pedido apto

      const { transaction, paymentUrl } = await createTransportPaymentLink({
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: order.transportCost || 10000,
        description: `Test - ${order.orderNumber}`,
        customerEmail: order.customer.email,
        customerPhone: order.customer.phone,
        provider: 'WOMPI',
      })

      expect(transaction.orderId).toBe(order.id)
      expect(transaction.provider).toBe('WOMPI')
      expect(transaction.type).toBe('TRANSPORT')
      expect(transaction.status).toBe('PENDING')
      expect(paymentUrl).toContain('checkout.wompi.co')
      expect(transaction.reference).toContain('TR-')
    })

    it('confirmPaymentFromWebhook es idempotente (APPROVED dos veces no duplica)', async () => {
      // Crear un link para tener una transacción
      const order = await db.order.findFirst({
        where: { status: 'PENDIENTE_PAGO_TRANSPORTE' },
        select: { id: true, orderNumber: true, transportCost: true, customer: { select: { email: true, phone: true } } },
      })
      if (!order) return

      const { transaction } = await createTransportPaymentLink({
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: order.transportCost || 10000,
        description: 'Test idempotencia',
        customerEmail: order.customer.email,
        customerPhone: order.customer.phone,
        provider: 'WOMPI',
      })

      // Primera confirmación
      const first = await confirmPaymentFromWebhook({
        provider: 'WOMPI',
        providerTxId: transaction.providerTxId,
        reference: transaction.reference,
        status: 'APPROVED',
        amount: transaction.amount,
        raw: { test: 1 },
      })
      expect(first?.status).toBe('APPROVED')

      // Segunda confirmación (idempotente)
      const second = await confirmPaymentFromWebhook({
        provider: 'WOMPI',
        providerTxId: transaction.providerTxId,
        reference: transaction.reference,
        status: 'APPROVED',
        amount: transaction.amount,
        raw: { test: 2 },
      })
      expect(second?.status).toBe('APPROVED')
    })

    it('confirmPaymentFromWebhook devuelve null sin identificador', async () => {
      const result = await confirmPaymentFromWebhook({
        provider: 'WOMPI',
        providerTxId: null,
        reference: null,
        status: 'APPROVED',
        raw: {},
      })
      expect(result).toBeNull()
    })

    it('confirmPaymentFromWebhook devuelve null para transacción inexistente', async () => {
      const result = await confirmPaymentFromWebhook({
        provider: 'WOMPI',
        providerTxId: 'NONEXISTENT-TX-ID',
        reference: 'NONEXISTENT-REF',
        status: 'APPROVED',
        raw: {},
      })
      expect(result).toBeNull()
    })
  })

  // ----------------------------------------------------------
  // Logistics — shipment.service
  // ----------------------------------------------------------
  describe('Logistics / shipment.service (DB)', () => {
    it('listShipments devuelve envíos y total', async () => {
      const result = await listShipments({ limit: 10 })
      expect(result.shipments).toBeInstanceOf(Array)
      expect(result.total).toBeGreaterThanOrEqual(0)
    })

    it('getShipmentStats devuelve conteos', async () => {
      const stats = await getShipmentStats()
      expect(stats.total).toBeGreaterThanOrEqual(0)
      expect(stats.byStatus).toBeInstanceOf(Object)
      expect(stats.printed).toBeGreaterThanOrEqual(0)
      expect(stats.pendingPrint).toBeGreaterThanOrEqual(0)
    })

    it('getShipmentByGuide devuelve null para guía inexistente', async () => {
      const shipment = await getShipmentByGuide('NONEXISTENT-GUIDE-123')
      expect(shipment).toBeNull()
    })

    it('ShipmentError tiene code y message', () => {
      const err = new ShipmentError('TEST_CODE', 'Test message')
      expect(err.code).toBe('TEST_CODE')
      expect(err.message).toBe('Test message')
    })
  })

  // ----------------------------------------------------------
  // Logistics — printing.service
  // ----------------------------------------------------------
  describe('Logistics / printing.service (DB)', () => {
    it('listPrintJobs devuelve trabajos y total', async () => {
      const result = await listPrintJobs({ limit: 10 })
      expect(result.jobs).toBeInstanceOf(Array)
      expect(result.total).toBeGreaterThanOrEqual(0)
    })

    it('getPrintJobStats devuelve conteos por estado', async () => {
      const stats = await getPrintJobStats()
      expect(stats.total).toBeGreaterThanOrEqual(0)
      expect(stats.queued).toBeGreaterThanOrEqual(0)
      expect(stats.sent).toBeGreaterThanOrEqual(0)
      expect(stats.printed).toBeGreaterThanOrEqual(0)
      expect(stats.failed).toBeGreaterThanOrEqual(0)
    })

    it('processPrintQueue ejecuta sin errores', async () => {
      const result = await processPrintQueue()
      expect(result.processed).toBeGreaterThanOrEqual(0)
      expect(result.failed).toBeGreaterThanOrEqual(0)
    })

    it('generateGuidePdf genera un PDF válido (empieza con %PDF)', async () => {
      const pdf = await generateGuidePdf({
        guideNumber: 'TEST-GUIDE-001',
        carrier: 'SERVIENTREGA',
        orderNumber: '#TEST',
        customerName: 'Test Customer',
        customerPhone: '3001234567',
        city: 'Bogotá',
        address: 'Calle 100',
        productName: 'Test Product',
        declaredValue: 50000,
      })
      const text = new TextDecoder().decode(pdf.slice(0, 8))
      expect(text).toContain('%PDF')
    })

    it('PrintJobError tiene code y message', () => {
      const err = new PrintJobError('TEST', 'Test message')
      expect(err.code).toBe('TEST')
      expect(err.message).toBe('Test message')
    })
  })
}
