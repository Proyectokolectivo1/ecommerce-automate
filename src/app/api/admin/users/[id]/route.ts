// ============================================================
// /api/admin/users/[id] — Gestión de un usuario
// ============================================================
// GET    — devuelve el usuario (cualquier rol autenticado).
// PUT    — actualiza campos (ADMIN only, Zod-validated).
// DELETE — desactiva el usuario (ADMIN only, soft delete).

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, getCurrentUserOrFallback, requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { audit } from '@/lib/audit'
import {
  getUserById,
  updateUser,
  deleteUser,
  UserError,
} from '@/modules/admin/user.service'
import { ROLES } from '@/lib/validation'

const updateUserSchema = z.object({
  email: z.string().email('Email inválido').optional(),
  name: z.string().optional().nullable(),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
})

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUserOrFallback()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { id } = await ctx.params
  if (!id) {
    return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  }

  try {
    const found = await getUserById(id)
    if (!found) {
      return NextResponse.json({ error: `Usuario no encontrado: ${id}` }, { status: 404 })
    }
    return NextResponse.json(found)
  } catch (err) {
    logger.error('api.admin.users.get error', {
      id,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Error al obtener usuario' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = updateUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  try {
    const updated = await updateUser(id, parsed.data, actor.id)
    void audit.log({
      userId: actor.id,
      action: 'USER_UPDATE',
      entity: 'User',
      entityId: id,
      metadata: {
        email: updated.email,
        role: updated.role,
        active: updated.active,
      },
    })
    return NextResponse.json(updated)
  } catch (err) {
    if (err instanceof UserError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode })
    }
    logger.error('api.admin.users.update error', {
      id,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Error al actualizar usuario' }, { status: 500 })
  }
}

export async function DELETE(
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
    const result = await deleteUser(id, actor.id)
    void audit.log({
      userId: actor.id,
      action: 'USER_DELETE',
      entity: 'User',
      entityId: id,
      metadata: { deactivated: result.deactivated },
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof UserError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode })
    }
    logger.error('api.admin.users.delete error', {
      id,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Error al eliminar usuario' }, { status: 500 })
  }
}
