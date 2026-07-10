// ============================================================
// /api/guides/[id]/pdf — Download guide PDF
// ============================================================
// GET — devuelve el PDF de la guía (generado o desde storage).
// Auth requerida (BODEGA, ADMIN, SERVICIO pueden descargar).

import { NextResponse } from 'next/server'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { storage } from '@/lib/storage'
import { getShipmentById, getShipmentByGuide } from '@/modules/logistics/shipment.service'
import { generateGuidePdf } from '@/modules/logistics/printing.service'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let user
  try {
    user = requireRole(await getCurrentUser(), 'ADMIN', 'BODEGA', 'SERVICIO')
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 403
    return NextResponse.json({ error: (err as Error).message }, { status: statusCode })
  }

  const { id } = await params

  try {
    // Los cuid de Prisma empiezan con "cm" y tienen 24 chars.
    // Los números de guía suelen empezar con 3 letras mayúsculas (carrier) + dígitos.
    const looksLikeCuid = /^cm[a-z0-9]{22}$/i.test(id)
    const looksLikeGuide = /^[A-Z]{3}\d+/i.test(id)
    const shipment = looksLikeGuide && !looksLikeCuid
      ? await getShipmentByGuide(id)
      : await getShipmentById(id)

    if (!shipment || !shipment.guideNumber) {
      return NextResponse.json({ error: 'Guía no encontrada' }, { status: 404 })
    }

    const guideNumber = shipment.guideNumber
    const pdfKey = `guides/${guideNumber}.pdf`

    // Lee del storage; si no existe, lo genera on-demand.
    let pdfBuffer = await storage.read(pdfKey)
    if (!pdfBuffer) {
      logger.info('api.guides.pdf generating-on-demand', { guideNumber })
      const pdfBytes = await generateGuidePdf({
        guideNumber,
        carrier: shipment.carrier ?? 'N/A',
        orderNumber: shipment.order.orderNumber,
        customerName: shipment.order.customer.name,
        customerPhone: shipment.order.customer.phone ?? '',
        city: shipment.order.city ?? '',
        address: shipment.order.address ?? '',
        productName: shipment.order.items.map((i) => `${i.title} x${i.quantity}`).join(', '),
        declaredValue: shipment.order.total,
      })
      pdfBuffer = Buffer.from(pdfBytes)
      await storage.save(pdfKey, pdfBuffer, 'application/pdf')
    }

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="guia-${guideNumber}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (err) {
    logger.error('api.guides.pdf error', {
      id,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Error al generar el PDF' }, { status: 500 })
  }
}
