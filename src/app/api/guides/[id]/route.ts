// ============================================================
// /api/guides/[id] — Get shipment detail by id or guide number
// ============================================================
// GET — detalle de un envío con tracking events y orden.

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { getShipmentById, getShipmentByGuide } from '@/modules/logistics/shipment.service'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUserOrFallback()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
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

    if (!shipment) {
      return NextResponse.json({ error: 'Envío no encontrado' }, { status: 404 })
    }
    return NextResponse.json(shipment)
  } catch (err) {
    logger.error('api.guides.detail error', {
      id,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Error al obtener la guía' }, { status: 500 })
  }
}
