// ============================================================
// two-factor.ts — Two-Factor Authentication (TOTP)
// ============================================================
// Genera y verifica códigos TOTP compatibles con Google Authenticator.
// Usa otplib v13 (API nueva: TOTP, generateSecret, verify).

import { generateSecret, generateURI, verify, type TOTP } from 'otplib'
import QRCode from 'qrcode'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

const APP_NAME = 'Ecommerce Inteligente'
const STEP = 30 // segundos
const DIGITS = 6
const WINDOW = 1 // tolera 1 paso antes/después (±30s)

/**
 * Genera un secreto TOTP aleatorio (base32).
 */
export function generateTwoFactorSecret(): string {
  return generateSecret()
}

/**
 * Genera la URL otpauth:// para configurar en Google Authenticator.
 */
export function generateOtpAuthUrl(email: string, secret: string): string {
  return generateURI({
    secret,
    label: email,
    issuer: APP_NAME,
    algorithm: 'SHA1',
    digits: DIGITS,
    period: STEP,
  })
}

/**
 * Genera un QR code en base64 desde una URL otpauth://.
 */
export async function generateQrCodeDataUrl(otpAuthUrl: string): Promise<string> {
  try {
    return await QRCode.toDataURL(otpAuthUrl, {
      width: 200,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    })
  } catch (err) {
    logger.error('2fa.generateQrCode error', {
      error: err instanceof Error ? err.message : String(err),
    })
    throw new Error('Error al generar QR code')
  }
}

/**
 * Verifica un código TOTP de 6 dígitos.
 */
export function verifyTwoFactorToken(token: string, secret: string): boolean {
  try {
    const cleanToken = token.replace(/\s/g, '')
    return verify({
      token: cleanToken,
      secret,
      digits: DIGITS,
      period: STEP,
      window: WINDOW,
    } as Parameters<typeof verify>[0])
  } catch {
    return false
  }
}

// ------------------------------------------------------------
// DB helpers
// ------------------------------------------------------------

export async function enableTwoFactor(userId: string, secret: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: {
      twoFactorSecret: secret,
      twoFactorEnabled: true,
    },
  })
  logger.info('2fa.enabled', { userId })
}

export async function disableTwoFactor(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: {
      twoFactorSecret: null,
      twoFactorEnabled: false,
    },
  })
  logger.info('2fa.disabled', { userId })
}

export async function isTwoFactorEnabled(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true, twoFactorSecret: true },
  })
  return Boolean(user?.twoFactorEnabled && user?.twoFactorSecret)
}

export async function getTwoFactorSecret(userId: string): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { twoFactorSecret: true },
  })
  return user?.twoFactorSecret ?? null
}
