// ============================================================
// /api/integrations/[provider] — Operaciones por proveedor
// ============================================================
// PATCH  — activar/desactivar (ADMIN only)
// POST   — test de conexión (ADMIN only): verifica que las creds
//          funcionan llamando al adapter en modo sandbox/real.

import { NextResponse } from 'next/server'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'

const INTEGRATION_PROVIDERS = new Set([
  'SHOPIFY', 'MASTERSHOP', 'WOMPI', 'PAYU', 'MERCADOPAGO', 'EPAYCO', 'BOLD', 'WHATSAPP', 'EMAIL',
])

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { provider } = await params
  if (!INTEGRATION_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: 'Proveedor inválido' }, { status: 400 })
  }

  const setting = await db.integrationSetting.findUnique({ where: { provider } })
  if (!setting) {
    return NextResponse.json({ provider, configured: false, active: false })
  }

  return NextResponse.json({
    provider: setting.provider,
    configured: true,
    active: setting.active,
    updatedAt: setting.updatedAt,
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  let user
  try {
    user = requireRole(await getCurrentUser(), 'ADMIN')
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 403
    return NextResponse.json({ error: (err as Error).message }, { status: statusCode })
  }

  const { provider } = await params
  if (!INTEGRATION_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: 'Proveedor inválido' }, { status: 400 })
  }

  const body = (await request.json().catch(() => ({}))) as { active?: boolean }
  if (typeof body.active !== 'boolean') {
    return NextResponse.json({ error: 'active (boolean) es requerido' }, { status: 400 })
  }

  const setting = await db.integrationSetting.findUnique({ where: { provider } })
  if (!setting) {
    return NextResponse.json({ error: 'Configure el proveedor antes de activarlo' }, { status: 404 })
  }

  const updated = await db.integrationSetting.update({
    where: { provider },
    data: { active: body.active },
  })

  void audit.log({
    userId: user.id,
    action: 'INTEGRATION_TOGGLE',
    entity: 'IntegrationSetting',
    entityId: updated.id,
    metadata: { provider, active: body.active },
  })

  return NextResponse.json({ ok: true, provider: updated.provider, active: updated.active })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  let user
  try {
    user = requireRole(await getCurrentUser(), 'ADMIN')
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 403
    return NextResponse.json({ error: (err as Error).message }, { status: statusCode })
  }

  const { provider } = await params
  if (!INTEGRATION_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: 'Proveedor inválido' }, { status: 400 })
  }

  const setting = await db.integrationSetting.findUnique({ where: { provider } })
  if (!setting) {
    return NextResponse.json({ error: 'Proveedor no configurado' }, { status: 404 })
  }

  // Test de conexión según el tipo de proveedor.
  let result: { ok: boolean; message: string; detail?: unknown }
  try {
    switch (provider) {
      case 'SHOPIFY':
      case 'MASTERSHOP':
      case 'WHATSAPP':
      case 'EMAIL':
        // Para estos, "test" = verificar que el JSON parsea y tiene campos mínimos.
        result = testGenericConfig(provider, setting.config)
        break
      default:
        // Pasarelas de pago: test de creación de link en modo sandbox.
        result = await testPaymentProvider(provider)
    }
  } catch (err) {
    result = {
      ok: false,
      message: 'Error durante el test',
      detail: err instanceof Error ? err.message : String(err),
    }
  }

  logger.info('integration.test', { provider, ok: result.ok, userId: user.id })
  void audit.log({
    userId: user.id,
    action: 'INTEGRATION_TEST',
    entity: 'IntegrationSetting',
    entityId: setting.id,
    metadata: { provider, ok: result.ok },
  })

  return NextResponse.json(result)
}

function testGenericConfig(provider: string, configStr: string): { ok: boolean; message: string } {
  try {
    const cfg = JSON.parse(configStr) as Record<string, unknown>
    const required: Record<string, string[]> = {
      SHOPIFY: ['shop', 'accessToken'],
      MASTERSHOP: ['apiUrl', 'apiKey'],
      WHATSAPP: ['phoneNumberId', 'accessToken'],
      EMAIL: ['fromAddress'],
    }
    const fields = required[provider] ?? []
    const missing = fields.filter((f) => !cfg[f])
    if (missing.length > 0) {
      return { ok: false, message: `Campos faltantes: ${missing.join(', ')}` }
    }
    return { ok: true, message: `Configuración de ${provider} válida` }
  } catch {
    return { ok: false, message: 'Configuración inválida (JSON malformado)' }
  }
}

async function testPaymentProvider(provider: string): Promise<{ ok: boolean; message: string }> {
  // Import dinámico para evitar cargar todo el registry en cada request.
  const { getPaymentProvider } = await import('@/integrations/payments/registry')
  const { getProviderCredentials } = await import('@/modules/payments/payment.service')
  const creds = await getProviderCredentials(provider as 'WOMPI' | 'PAYU' | 'MERCADOPAGO' | 'EPAYCO' | 'BOLD')
  if (!creds) return { ok: false, message: 'Credenciales no configuradas' }

  const adapter = getPaymentProvider(provider)
  try {
    const link = await adapter.createPaymentLink(
      {
        reference: `TEST-${Date.now()}`,
        amount: 100,
        currency: 'COP',
        description: 'Test de conexión',
      },
      creds,
    )
    const isMock = !creds.apiKey && !creds.privateKey && !creds.publicKey
    return {
      ok: true,
      message: isMock
        ? `Conexión OK (modo sandbox/mock). Link generado: ${link.providerTxId}`
        : `Conexión OK (modo real). Link generado: ${link.providerTxId}`,
    }
  } catch (err) {
    return {
      ok: false,
      message: `Falló la creación de link: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
