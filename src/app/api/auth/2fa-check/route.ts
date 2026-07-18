// ============================================================
// /api/auth/2fa-check — Check if user needs 2FA
// ============================================================
// POST — verifica si un usuario (por email) tiene 2FA habilitado.
// NO requiere auth (se usa antes del login).
// Body: { email: string }
// Response: { twoFactorRequired: boolean }

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'

const schema = z.object({
  email: z.string().email(),
})

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  }

  try {
    const user = await db.user.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
      select: { twoFactorEnabled: true, active: true },
    })

    // Por seguridad, no revelar si el usuario existe.
    // Si no existe o no está activo, decir que no requiere 2FA
    // (el login fallará con "credenciales inválidas").
    if (!user || !user.active) {
      return NextResponse.json({ twoFactorRequired: false })
    }

    return NextResponse.json({ twoFactorRequired: user.twoFactorEnabled })
  } catch {
    return NextResponse.json({ twoFactorRequired: false })
  }
}
