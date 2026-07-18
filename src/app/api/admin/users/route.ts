// ============================================================
// /api/admin/users — Gestión de usuarios (ADMIN)
// ============================================================
// GET  — lista usuarios con filtros. Si `?stats=true`, devuelve KPIs.
// POST — crea un usuario (ADMIN only). Valida con Zod.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, getCurrentUserOrFallback, requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { audit } from '@/lib/audit'
import {
  listUsers,
  createUser,
  getUserStats,
  UserError,
} from '@/modules/admin/user.service'
import { ROLES } from '@/lib/validation'

const VALID_ROLES = new Set([...ROLES, 'ALL'])

const createUserSchema = z.object({
  email: z.string().email('Email inválido'),
  name: z.string().optional().nullable(),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  role: z.enum(ROLES),
  active: z.boolean().optional(),
})

export async function GET(request: Request) {
  const user = await getCurrentUserOrFallback()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const url = new URL(request.url)
  const params = url.searchParams
  const search = params.get('search') ?? undefined
  const role = params.get('role') ?? undefined
  const activeParam = params.get('active')
  const limitParam = params.get('limit')
  const offsetParam = params.get('offset')
  const wantStats = params.get('stats') === 'true'

  if (role && !VALID_ROLES.has(role)) {
    return NextResponse.json({ error: `Rol inválido: ${role}` }, { status: 400 })
  }

  let active: boolean | undefined
  if (activeParam !== null && activeParam !== undefined && activeParam !== 'ALL') {
    if (activeParam === 'true') active = true
    else if (activeParam === 'false') active = false
  }

  const limit = limitParam ? Number(limitParam) : 20
  const offset = offsetParam ? Number(offsetParam) : 0
  if (!Number.isFinite(limit) || limit < 1) {
    return NextResponse.json({ error: 'limit inválido' }, { status: 400 })
  }
  if (!Number.isFinite(offset) || offset < 0) {
    return NextResponse.json({ error: 'offset inválido' }, { status: 400 })
  }

  try {
    if (wantStats) {
      const [stats, list] = await Promise.all([
        getUserStats(),
        listUsers({ search, role: role || undefined, active, limit, offset }),
      ])
      return NextResponse.json({ ...list, stats })
    }
    const result = await listUsers({ search, role: role || undefined, active, limit, offset })
    return NextResponse.json(result)
  } catch (err) {
    logger.error('api.admin.users.list error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: 'Error al listar usuarios' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  let actor
  try {
    actor = await requireRole(await getCurrentUser(), 'ADMIN')
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 403
    return NextResponse.json({ error: (err as Error).message }, { status: statusCode })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = createUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  try {
    const user = await createUser(parsed.data)
    void audit.log({
      userId: actor.id,
      action: 'USER_CREATE',
      entity: 'User',
      entityId: user.id,
      metadata: { email: user.email, role: user.role },
    })
    return NextResponse.json(user, { status: 201 })
  } catch (err) {
    if (err instanceof UserError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode })
    }
    logger.error('api.admin.users.create error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Error al crear usuario' }, { status: 500 })
  }
}
