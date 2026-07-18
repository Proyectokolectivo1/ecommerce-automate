// ============================================================
// /api/integrations — Configuración de integraciones
// ============================================================
// GET  — lista todas las integraciones con su estado (sin exponer secretos).
// PUT  — upsert de la configuración de un proveedor (ADMIN only).
//
// Los secretos se guardan en IntegrationSetting.config (JSON).
// En la respuesta GET se enmascaran los valores sensibles.

import { NextResponse } from 'next/server'
import { getCurrentUserOrFallback, requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'

// Proveedores de integración soportados
const INTEGRATION_PROVIDERS = [
  'SHOPIFY',
  'MASTERSHOP',
  'WOMPI',
  'PAYU',
  'MERCADOPAGO',
  'EPAYCO',
  'BOLD',
  'WHATSAPP',
  'EMAIL',
] as const
type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number]

// Campos sensibles que se enmascaran en GET
const SENSITIVE_KEYS = ['apiKey', 'accessToken', 'privateKey', 'secret', 'integritySecret', 'apiSecret']

// ------------------------------------------------------------
// GET — listar integraciones (cualquier rol autenticado)
// ------------------------------------------------------------

export async function GET() {
  const user = await getCurrentUserOrFallback()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const settings = await db.integrationSetting.findMany({
    orderBy: { provider: 'asc' },
  })

  // Combina con la lista completa de proveedores (incluso los no configurados).
  const configuredMap = new Map(settings.map((s) => [s.provider, s]))
  const result = INTEGRATION_PROVIDERS.map((provider) => {
    const s = configuredMap.get(provider)
    return {
      provider,
      active: s?.active ?? false,
      configured: Boolean(s),
      config: s ? maskSecrets(s.config) : null,
      updatedAt: s?.updatedAt ?? null,
    }
  })

  return NextResponse.json({ integrations: result })
}

// ------------------------------------------------------------
// PUT — upsert config (ADMIN only)
// ------------------------------------------------------------

export async function PUT(request: Request) {
  let user
  try {
    user = await requireRole(await getCurrentUser(), 'ADMIN')
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 403
    return NextResponse.json({ error: (err as Error).message }, { status: statusCode })
  }

  let body: { provider?: string; config?: Record<string, unknown>; active?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { provider, config, active } = body
  if (!provider || !INTEGRATION_PROVIDERS.includes(provider as IntegrationProvider)) {
    return NextResponse.json({ error: 'Proveedor inválido' }, { status: 400 })
  }
  if (!config || typeof config !== 'object') {
    return NextResponse.json({ error: 'config es requerido' }, { status: 400 })
  }

  try {
    const configStr = JSON.stringify(config)
    const setting = await db.integrationSetting.upsert({
      where: { provider: provider as string },
      create: {
        provider: provider as string,
        config: configStr,
        active: active ?? true,
      },
      update: {
        config: configStr,
        active: active ?? true,
      },
    })

    logger.info('integration.config-saved', { provider: setting.provider, userId: user.id })
    void audit.log({
      userId: user.id,
      action: 'INTEGRATION_CONFIG_UPDATE',
      entity: 'IntegrationSetting',
      entityId: setting.id,
      metadata: { provider: setting.provider, active: setting.active },
    })

    return NextResponse.json({
      ok: true,
      provider: setting.provider,
      active: setting.active,
      config: maskSecrets(setting.config),
    })
  } catch (err) {
    logger.error('integration.config-save-error', {
      provider,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Error al guardar configuración' }, { status: 500 })
  }
}

/** Enmascara valores sensibles: muestra solo los últimos 4 chars. */
function maskSecrets(configStr: string): Record<string, unknown> {
  try {
    const cfg = JSON.parse(configStr) as Record<string, unknown>
    const masked: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(cfg)) {
      if (SENSITIVE_KEYS.includes(key) && typeof value === 'string' && value.length > 0) {
        masked[key] = value.length > 8 ? `••••${value.slice(-4)}` : '••••'
        masked[`${key}_configured`] = true
      } else {
        masked[key] = value
      }
    }
    return masked
  } catch {
    return { _parseError: true }
  }
}
