// ============================================================
// printing.service.ts — Print job management + PDF generation
// ============================================================
// Gestiona la cola de impresión de guías:
//   - enqueuePrintJob: crea un PrintJob en estado QUEUED.
//   - processPrintQueue: procesa los PrintJobs pendientes (worker).
//   - generateGuidePdf: genera un PDF visual de la guía (placeholder).
//   - markPrinted / markFailed: actualizan el estado del PrintJob.
//
// El worker se invoca periódicamente vía setInterval desde
// lib/print-worker.ts (arrancado al inicio de la app).

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { audit } from '@/lib/audit'
import { storage } from '@/lib/storage'
import { emitGuideStatus } from '@/lib/realtime'
import type { Prisma, PrintJob } from '@prisma/client'

// ------------------------------------------------------------
// Errors
// ------------------------------------------------------------

export class PrintJobError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'PrintJobError'
    this.code = code
  }
}

// ------------------------------------------------------------
// Enqueue
// ------------------------------------------------------------

export interface EnqueuePrintJobInput {
  orderId: string
  guideNumber: string
  pdfUrl?: string | null
  actor: string
  printer?: string
}

/**
 * Encola un trabajo de impresión para una guía.
 * Idempotente: si ya existe un PrintJob no-FAILED para esta guía,
 * retorna el existente.
 */
export async function enqueuePrintJob(
  input: EnqueuePrintJobInput,
): Promise<PrintJob> {
  // Idempotencia: si ya hay un job activo para esta guía, no duplicar.
  const existing = await db.printJob.findFirst({
    where: {
      guideNumber: input.guideNumber,
      status: { in: ['QUEUED', 'SENT', 'PRINTED'] },
    },
  })
  if (existing) {
    logger.info('print.enqueue already-queued', {
      guideNumber: input.guideNumber,
      printJobId: existing.id,
      status: existing.status,
    })
    return existing
  }

  const job = await db.printJob.create({
    data: {
      orderId: input.orderId,
      guideNumber: input.guideNumber,
      status: 'QUEUED',
      printer: input.printer ?? 'default',
    },
  })

  logger.info('print.queued', {
    printJobId: job.id,
    guideNumber: input.guideNumber,
    orderId: input.orderId,
  })

  // Dispara el procesamiento async (fire-and-forget).
  void processPrintQueue().catch((err) =>
    logger.error('print.process-trigger-failed', {
      error: err instanceof Error ? err.message : String(err),
    }),
  )

  return job
}

// ------------------------------------------------------------
// Process queue (worker)
// ------------------------------------------------------------

/** Marca de tiempo del último procesamiento para evitar overlaps. */
let processing = false

/**
 * Procesa todos los PrintJobs en estado QUEUED.
 * Para cada uno:
 *   1. Marca SENT.
 *   2. Genera (o descarga) el PDF de la guía.
 *   3. Simula el envío a la impresora (en modo demo).
 *   4. Marca PRINTED.
 *   5. Actualiza el Shipment.status a PRINTED.
 *   6. Emite evento realtime.
 */
export async function processPrintQueue(): Promise<{
  processed: number
  failed: number
}> {
  if (processing) {
    return { processed: 0, failed: 0 }
  }
  processing = true

  let processed = 0
  let failed = 0

  try {
    const pending = await db.printJob.findMany({
      where: { status: 'QUEUED' },
      orderBy: { queuedAt: 'asc' },
      take: 20,
    })

    for (const job of pending) {
      try {
        await processSingleJob(job)
        processed++
      } catch (err) {
        failed++
        logger.error('print.job-failed', {
          printJobId: job.id,
          error: err instanceof Error ? err.message : String(err),
        })
        await markPrintJobFailed(job.id, err instanceof Error ? err.message : String(err))
      }
    }
  } finally {
    processing = false
  }

  if (processed > 0 || failed > 0) {
    logger.info('print.batch-done', { processed, failed })
  }

  return { processed, failed }
}

async function processSingleJob(job: PrintJob): Promise<void> {
  // 1. Marca SENT.
  await db.printJob.update({
    where: { id: job.id },
    data: {
      status: 'SENT',
      sentAt: new Date(),
      attempts: { increment: 1 },
    },
  })

  // 2. Carga el envío + orden para generar el PDF.
  const shipment = await db.shipment.findFirst({
    where: { guideNumber: job.guideNumber ?? undefined },
    include: {
      order: {
        include: {
          customer: true,
          items: true,
        },
      },
    },
  })

  if (!shipment || !job.guideNumber) {
    throw new PrintJobError(
      'SHIPMENT_NOT_FOUND',
      `No se encontró envío para la guía ${job.guideNumber ?? 'N/A'}`,
    )
  }

  // 3. Genera el PDF visual (si no existe ya).
  const pdfKey = `guides/${job.guideNumber}.pdf`
  const existing = await storage.read(pdfKey)
  if (!existing) {
    const pdfBytes = await generateGuidePdf({
      guideNumber: job.guideNumber,
      carrier: shipment.carrier ?? 'N/A',
      orderNumber: shipment.order.orderNumber,
      customerName: shipment.order.customer.name,
      customerPhone: shipment.order.customer.phone ?? '',
      city: shipment.order.city ?? '',
      address: shipment.order.address ?? '',
      productName: shipment.order.items.map((i) => `${i.title} x${i.quantity}`).join(', '),
      declaredValue: shipment.order.total,
    })
    await storage.save(pdfKey, Buffer.from(pdfBytes), 'application/pdf')
    logger.info('print.pdf-generated', { guideNumber: job.guideNumber, key: pdfKey })
  }

  // 4. Simula el envío a impresora (latencia pequeña).
  await sleep(200)

  // 5. Marca PRINTED.
  await db.printJob.update({
    where: { id: job.id },
    data: {
      status: 'PRINTED',
      printedAt: new Date(),
    },
  })

  // 6. Actualiza el Shipment.status a PRINTED.
  await db.shipment.update({
    where: { id: shipment.id },
    data: { status: 'PRINTED' },
  })

  // 7. Auditoría + realtime.
  void audit.log({
    action: 'GUIDE_PRINTED',
    entity: 'PrintJob',
    entityId: job.id,
    metadata: {
      guideNumber: job.guideNumber,
      orderId: shipment.order.id,
    },
  })
  emitGuideStatus(shipment.id, job.guideNumber, 'PRINTED')

  logger.info('print.job-done', {
    printJobId: job.id,
    guideNumber: job.guideNumber,
  })
}

// ------------------------------------------------------------
// Mark failed
// ------------------------------------------------------------

export async function markPrintJobFailed(
  jobid: string,
  error: string,
): Promise<void> {
  await db.printJob.update({
    where: { id: jobid },
    data: {
      status: 'FAILED',
      error: error.slice(0, 500),
    },
  })
}

// ------------------------------------------------------------
// Retry
// ------------------------------------------------------------

/**
 * Reintenta un PrintJob fallido: lo vuelve a poner en QUEUED
 * y dispara el procesamiento.
 */
export async function retryPrintJob(
  jobId: string,
  actor: string,
): Promise<PrintJob> {
  const job = await db.printJob.findUnique({ where: { id: jobId } })
  if (!job) {
    throw new PrintJobError('NOT_FOUND', `PrintJob ${jobId} no encontrado`)
  }
  if (job.status === 'PRINTED') {
    throw new PrintJobError('ALREADY_PRINTED', `La guía ${job.guideNumber} ya está impresa`)
  }

  const updated = await db.printJob.update({
    where: { id: jobId },
    data: {
      status: 'QUEUED',
      error: null,
    },
  })

  logger.info('print.retry', { jobId, guideNumber: job.guideNumber, actor })

  void audit.log({
    userId: actor !== 'system' ? actor : null,
    action: 'PRINT_JOB_RETRY',
    entity: 'PrintJob',
    entityId: jobId,
    metadata: { guideNumber: job.guideNumber },
  })

  void processPrintQueue()
  return updated
}

// ------------------------------------------------------------
// Query helpers
// ------------------------------------------------------------

const PRINT_JOB_INCLUDE = {
  order: {
    include: {
      customer: true,
    },
  },
} satisfies Prisma.PrintJobInclude

export type PrintJobWithRelations = Prisma.PrintJobGetPayload<{
  include: typeof PRINT_JOB_INCLUDE
}>

export interface PrintJobFilters {
  status?: string
  search?: string
  limit?: number
  offset?: number
}

export async function listPrintJobs(filters: PrintJobFilters = {}): Promise<{
  jobs: PrintJobWithRelations[]
  total: number
}> {
  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 200)
  const offset = Math.max(filters.offset ?? 0, 0)

  const where: Prisma.PrintJobWhereInput = {}
  if (filters.status && filters.status !== 'ALL') {
    where.status = filters.status
  }
  if (filters.search && filters.search.trim()) {
    const q = filters.search.trim()
    where.OR = [
      { guideNumber: { contains: q } },
      { order: { orderNumber: { contains: q } } },
      { order: { customer: { name: { contains: q } } } },
    ]
  }

  const [jobs, total] = await Promise.all([
    db.printJob.findMany({
      where,
      include: PRINT_JOB_INCLUDE,
      orderBy: { queuedAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.printJob.count({ where }),
  ])

  return { jobs, total }
}

export async function getPrintJobStats(): Promise<{
  total: number
  queued: number
  sent: number
  printed: number
  failed: number
}> {
  const groups = await db.printJob.groupBy({
    by: ['status'],
    _count: true,
  })
  const stats = { total: 0, queued: 0, sent: 0, printed: 0, failed: 0 }
  for (const g of groups) {
    const s = g.status as keyof typeof stats
    if (s in stats && s !== 'total') {
      stats[s] = g._count
    }
    stats.total += g._count
  }
  return stats
}

// ------------------------------------------------------------
// PDF generation (visual placeholder)
// ------------------------------------------------------------

export interface GuidePdfData {
  guideNumber: string
  carrier: string
  orderNumber: string
  customerName: string
  customerPhone: string
  city: string
  address: string
  productName: string
  declaredValue: number
}

/**
 * Genera un PDF simple de la guía (formato visual placeholder).
 * En producción se reemplazaría por la librería de generación de
 * Mastershop o pdfkit/jsPDF con el layout oficial de la transportadora.
 *
 * Aquí generamos un PDF mínimo pero válido con la info clave.
 */
export async function generateGuidePdf(data: GuidePdfData): Promise<Uint8Array> {
  // PDF mínimo válido con texto. Es un PDF de una página con la info
  // de la guía. No requiere librerías externas.
  const content = buildPdfContent(data)
  const encoder = new TextEncoder()
  return encoder.encode(content)
}

/**
 * Construye un PDF 1.1 mínimo con la información de la guía.
 * El layout es simple: título + campos en líneas.
 */
function buildPdfContent(d: GuidePdfData): string {
  const lines = [
    'GUIA DE ENVIO',
    `Transportadora: ${d.carrier}`,
    `Numero de guia: ${d.guideNumber}`,
    `Pedido: ${d.orderNumber}`,
    '',
    'DATOS DEL DESTINATARIO',
    `Nombre: ${d.customerName}`,
    `Telefono: ${d.customerPhone}`,
    `Ciudad: ${d.city}`,
    `Direccion: ${d.address}`,
    '',
    'CONTENIDO',
    `Producto: ${d.productName}`,
    `Valor declarado: $${d.declaredValue.toLocaleString('es-CO')}`,
    '',
    '',
    '_________________________',
    'Firma del destinatario',
  ]

  const contentStream = lines
    .map((line) => {
      const escaped = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
      return `BT /F1 11 Tf 50 ${700 - lines.indexOf(line) * 18} Td (${escaped}) Tj ET`
    })
    .join('\n')

  // Estructura mínima de un PDF 1.1.
  const objects: string[] = []
  objects.push('<< /Type /Catalog /Pages 2 0 R >>')
  objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  objects.push(
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
      '/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
  )
  objects.push(`<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`)
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

  let pdf = '%PDF-1.1\n'
  const offsets: number[] = []
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return pdf
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
