// ============================================================
// /api/admin/users/[id]/2fa/setup — Setup 2FA for a user
// ============================================================
// POST — genera un secreto TOTP + QR code para configurar 2FA.
// No lo activa todavía (el usuario debe verificar con un código).
// ADMIN only.

import { NextResponse } from 'next/server'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { db } from '@/lib/db'
import { generateTwoFactorSecret, generateOtpAuthUrl, generateQrCodeDataUrl } from '@/lib/two-factor'

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
    const targetUser = await db.user.findUnique({
      where: { id },
      select: { id: true, email: true, twoFactorEnabled: true },
    })
    if (!targetUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    if (targetUser.twoFactorEnabled) {
      return NextResponse.json({ error: '2FA ya está activado para este usuario' }, { status: 409 })
    }

    // Generar secreto + QR.
    const secret = generateTwoFactorSecret()
    const otpAuthUrl = generateOtpAuthUrl(targetUser.email, secret)
    const qrCodeDataUrl = await generateQrCodeDataUrl(otpAuthUrl)

    logger.info('2fa.setup generated', { userId: id, actorId: user.id })

    return NextResponse.json({
      secret,
      otpAuthUrl,
      qrCode: qrCodeDataUrl,
      message: 'Escanea el QR con Google Authenticator y verifica con el código de 6 dígitos.',
    })
  } catch (err) {
    logger.error('api.2fa.setup error', {
      id,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Error al configurar 2FA' }, { status: 500 })
  }
}
