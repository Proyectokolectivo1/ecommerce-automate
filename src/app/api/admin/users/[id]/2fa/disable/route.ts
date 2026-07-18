// ============================================================
// /api/admin/users/[id]/2fa/disable — Disable 2FA
// ============================================================
// POST — desactiva 2FA para un usuario.
// ADMIN only.

import { NextResponse } from 'next/server'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { disableTwoFactor } from '@/lib/two-factor'

export async function POST(
  _request: Request,
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

  try {
    await disableTwoFactor(id)
    logger.info('2fa.disable success', { userId: id, actorId: user.id })
    return NextResponse.json({ ok: true, message: '2FA desactivado' })
  } catch (err) {
    logger.error('api.2fa.disable error', {
      id,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Error al desactivar 2FA' }, { status: 500 })
  }
}
