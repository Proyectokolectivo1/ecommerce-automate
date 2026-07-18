// ============================================================
// /api/admin/users/[id]/2fa/verify — Verify 2FA token & enable
// ============================================================
// POST — verifica el código TOTP y activa 2FA si es válido.
// Body: { secret: string, token: string }
// ADMIN only.

import { NextResponse } from 'next/server'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { z } from 'zod'
import { verifyTwoFactorToken, enableTwoFactor } from '@/lib/two-factor'

const verifySchema = z.object({
  secret: z.string().min(1),
  token: z.string().min(6).max(7),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let user
  try {
    user = requireRole(await getCurrentUser(), 'ADMIN')
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 403
    return NextResponse.json({ error: (err as Error).message }, { status: statusCode })
  }

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = verifySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Token debe ser 6 dígitos', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { secret, token } = parsed.data

  if (!verifyTwoFactorToken(token, secret)) {
    return NextResponse.json({ error: 'Código inválido. Verifica tu authenticator.' }, { status: 400 })
  }

  try {
    await enableTwoFactor(id, secret)
    logger.info('2fa.verify success', { userId: id, actorId: user.id })
    return NextResponse.json({ ok: true, message: '2FA activado correctamente' })
  } catch (err) {
    logger.error('api.2fa.verify error', {
      id,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Error al activar 2FA' }, { status: 500 })
  }
}
