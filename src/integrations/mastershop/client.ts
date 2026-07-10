// ============================================================
// client.ts — Mastershop logistics client (despachos + guías)
// ============================================================
// Mastershop: sistema de gestión de envíos/transportadoras (CO).
// Crea un despacho → recibe número de guía + URL del PDF.
// Webhook callback: Mastershop notifica tracking/estado de guía.
//
// Modo mock: genera número de guía plausible y PDF simulado.
// Modo real: POST a la API de Mastershop con credenciales.

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

export interface MastershopConfig {
  apiUrl: string
  apiKey: string
  merchantId?: string
  defaultCarrier?: string // SERVIENTREGA | ENVIA | INTERRAPIDISIMO
}

export interface CreateDispatchRequest {
  orderId: string
  orderNumber: string
  customerName: string
  customerPhone?: string | null
  city: string
  address: string
  productName: string
  weightGrams: number
  declaredValue: number
  carrier?: string
}

export interface CreateDispatchResponse {
  mastershopId: string
  guideNumber: string
  carrier: string
  pdfUrl: string
  status: 'CREATED'
}

export interface GuideStatusCallback {
  guideNumber: string
  status: 'IN_TRANSIT' | 'DELIVERED' | 'RETURNED' | 'PRINTED'
  message?: string
  city?: string
  occurredAt?: string
}

/** Lee la config de Mastershop desde IntegrationSetting. */
export async function getMastershopConfig(): Promise<MastershopConfig | null> {
  const setting = await db.integrationSetting.findUnique({
    where: { provider: 'MASTERSHOP' },
  })
  if (!setting || !setting.active) return null
  try {
    const cfg = JSON.parse(setting.config) as MastershopConfig
    if (!cfg.apiUrl || !cfg.apiKey) return null
    return cfg
  } catch {
    logger.warn('mastershop.config parse-error')
    return null
  }
}

/** True si Mastershop está configurado. */
export async function isMastershopConfigured(): Promise<boolean> {
  return (await getMastershopConfig()) !== null
}

const CARRIERS = ['SERVIENTREGA', 'ENVIA', 'INTERRAPIDISIMO', 'COORDINADORA', 'TCC']

/**
 * Crea un despacho en Mastershop.
 * Modo mock: genera guía plausible sin llamada de red.
 */
export async function createDispatch(
  req: CreateDispatchRequest,
  cfg: MastershopConfig,
): Promise<CreateDispatchResponse> {
  // Modo mock: si la apiUrl es el placeholder o apiKey es "mock"
  if (cfg.apiKey === 'mock' || cfg.apiUrl.includes('mock')) {
    return mockCreateDispatch(req, cfg)
  }

  const res = await fetch(`${cfg.apiUrl}/dispatches`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
      'x-merchant-id': cfg.merchantId ?? '',
    },
    body: JSON.stringify({
      order_ref: req.orderNumber,
      customer_name: req.customerName,
      customer_phone: req.customerPhone,
      city: req.city,
      address: req.address,
      product: req.productName,
      weight: req.weightGrams,
      declared_value: req.declaredValue,
      carrier: req.carrier ?? cfg.defaultCarrier ?? 'SERVIENTREGA',
    }),
  })
  if (!res.ok) {
    throw new Error(`Mastershop createDispatch HTTP ${res.status}`)
  }
  const json = (await res.json()) as {
    id: string
    guide_number: string
    carrier: string
    pdf_url: string
  }
  return {
    mastershopId: json.id,
    guideNumber: json.guide_number,
    carrier: json.carrier,
    pdfUrl: json.pdf_url,
    status: 'CREATED',
  }
}

function mockCreateDispatch(
  req: CreateDispatchRequest,
  cfg: MastershopConfig,
): CreateDispatchResponse {
  const carrier = req.carrier ?? cfg.defaultCarrier ?? CARRIERS[0]
  const guideSeq = Math.floor(100000000 + Math.random() * 899999999)
  const guideNumber = `${carrier.slice(0, 3).toUpperCase()}${guideSeq}`
  return {
    mastershopId: `MS-${Date.now()}`,
    guideNumber,
    carrier,
    pdfUrl: `/api/guides/${guideNumber}/pdf`,
    status: 'CREATED',
  }
}
