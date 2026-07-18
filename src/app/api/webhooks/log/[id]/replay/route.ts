// ============================================================
// /api/webhooks/log/[id]/replay — Re-procesa un webhook
// ============================================================
// POST — re-dispara el procesamiento de un webhook previamente
//        registrado. Solo ADMIN. Devuelve el resultado del
//        re-procesamiento o el error si falló.
//
// El "replay" reenvía el payload al endpoint interno apropiado
// (shopify/payments/mastershop) usando fetch relativo, con los
// headers y body originales. Marca el log con el nuevo resultado.

import { NextResponse } from 'next/server'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { audit } from '@/lib/audit'
import {
  getWebhookLogById,
  markProcessed,
  markFailed,
} from '@/modules/webhooks/webhook-log.service'

/**
 * Mapea el `source` del WebhookLog al endpoint interno correspondiente.
 * Usa paths relativos para que Caddy los enrute correctamente.
 */
function resolveEndpoint(source: string): string | null {
  switch (source) {
    case 'shopify':
      return '/api/webhooks/shopify'
    case 'payments':
      return '/api/webhooks/payments'
    case 'mastershop':
      return '/api/webhooks/mastershop'
    default:
      return null
  }
}

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  let actor
  try {
    actor = await requireRole(await getCurrentUser(), 'ADMIN')
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 403
    return NextResponse.json({ error: (err as Error).message }, { status: statusCode })
  }

  const { id } = await ctx.params
  if (!id) {
    return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  }

  try {
    const log = await getWebhookLogById(id)
    if (!log) {
      return NextResponse.json({ error: `Webhook log no encontrado: ${id}` }, { status: 404 })
    }

    const endpoint = resolveEndpoint(log.source)
    if (!endpoint) {
      return NextResponse.json(
        { error: `Source no soportado para replay: ${log.source}` },
        { status: 400 },
      )
    }

    // Reconstruye los headers originales.
    let headers: Record<string, string> = {}
    if (log.headers) {
      try {
        headers = JSON.parse(log.headers) as Record<string, string>
      } catch {
        // Si no se puede parsear, usamos headers mínimos.
        headers = {}
      }
    }
    // Fuerza Content-Type JSON si el payload parece JSON.
    if (!headers['content-type']) {
      headers['content-type'] = 'application/json'
    }

    logger.info('webhook.replay start', {
      logId: id,
      source: log.source,
      endpoint,
      payloadSize: log.payloadSize,
    })

    // Reenvía al endpoint interno. Usamos una URL absoluta contra el
    // propio server (mismo host) para que el handler interno procese
    // el payload igual que si viniera del proveedor.
    const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      body: log.payload,
    })

    let result: Record<string, unknown> = { status: response.status }
    try {
      const json = await response.json()
      result = { status: response.status, body: json }
    } catch {
      const text = await response.text().catch(() => '')
      result = { status: response.status, body: text }
    }

    if (response.ok) {
      await markProcessed(id, { replayed: true, ...result })
      void audit.log({
        userId: actor.id,
        action: 'WEBHOOK_REPLAY',
        entity: 'WebhookLog',
        entityId: id,
        metadata: { source: log.source, status: response.status },
      })
      logger.info('webhook.replay success', { logId: id, httpStatus: response.status })
      return NextResponse.json({ ok: true, logId: id, result })
    }

    await markFailed(id, `HTTP ${response.status} en replay`)
    void audit.log({
      userId: actor.id,
      action: 'WEBHOOK_REPLAY_FAILED',
      entity: 'WebhookLog',
      entityId: id,
      metadata: { source: log.source, httpStatus: response.status },
    })
    logger.warn('webhook.replay non-2xx', { logId: id, httpStatus: response.status })
    return NextResponse.json(
      { ok: false, logId: id, error: `Replay devolvió HTTP ${response.status}`, result },
      { status: 502 },
    )
  } catch (err) {
    logger.error('api.webhooks.log.replay error', {
      id,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Error al re-procesar webhook' }, { status: 500 })
  }
}
