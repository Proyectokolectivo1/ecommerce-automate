// ============================================================
// user.service.ts — Admin user management service
// ============================================================
// Lógica de administración de usuarios (CRUD + stats).
// Todas las funciones usan `db` (Prisma) y son server-side puras.
//
// Reglas:
//   - Nunca devuelve `passwordHash` en las respuestas (SafeUser).
//   - `createUser` hashea la contraseña con `hashPassword`.
//   - `updateUser` permite actualizar campos opcionales; si envía
//     `password`, la hashea. Si envía `active=false`, desactiva.
//   - `deleteUser` no borra físicamente — marca `active=false` para
//     preservar la integridad referencial (AuditLog, Notification).
//   - `actorId` se usa para auditar quién realizó la acción.
//
// Errores:
//   - UserError → error de negocio (email duplicado, no encontrado,
//     auto-modificación, etc.) con `code` y `statusCode`.

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { hashPassword } from '@/lib/auth-utils'
import { Prisma } from '@prisma/client'
import type { Role } from '@/lib/validation'

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

/** Usuario sin passwordHash — para respuestas de API. */
export interface SafeUser {
  id: string
  email: string
  name: string | null
  role: Role
  active: boolean
  lastLoginAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface UserFilters {
  search?: string
  role?: string
  active?: boolean
  limit?: number
  offset?: number
}

export interface CreateUserInput {
  email: string
  name?: string | null
  password: string
  role: Role
  active?: boolean
}

export interface UpdateUserInput {
  email?: string
  name?: string | null
  password?: string
  role?: Role
  active?: boolean
}

export interface UserStats {
  total: number
  active: number
  inactive: number
  byRole: Record<string, number>
  recentLogins24h: number
}

// ------------------------------------------------------------
// Errors
// ------------------------------------------------------------

export class UserError extends Error {
  code: string
  statusCode: number
  constructor(message: string, code: string, statusCode = 400) {
    super(message)
    this.name = 'UserError'
    this.code = code
    this.statusCode = statusCode
  }
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function toSafeUser(u: {
  id: string
  email: string
  name: string | null
  role: string
  active: boolean
  lastLoginAt: Date | null
  createdAt: Date
  updatedAt: Date
}): SafeUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role as Role,
    active: u.active,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  }
}

// ------------------------------------------------------------
// List & get
// ------------------------------------------------------------

export async function listUsers(
  filters: UserFilters = {},
): Promise<{ users: SafeUser[]; total: number }> {
  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 200)
  const offset = Math.max(filters.offset ?? 0, 0)

  const where: Prisma.UserWhereInput = {}
  if (filters.role && filters.role !== 'ALL') {
    where.role = filters.role
  }
  if (filters.active !== undefined) {
    where.active = filters.active
  }
  if (filters.search && filters.search.trim().length > 0) {
    const q = filters.search.trim()
    where.OR = [{ email: { contains: q } }, { name: { contains: q } }]
  }

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    db.user.count({ where }),
  ])

  return { users: users.map(toSafeUser), total }
}

export async function getUserById(id: string): Promise<SafeUser | null> {
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  return user ? toSafeUser(user) : null
}

// ------------------------------------------------------------
// Create
// ------------------------------------------------------------

export async function createUser(input: CreateUserInput): Promise<SafeUser> {
  const email = input.email.trim().toLowerCase()
  if (!email) {
    throw new UserError('Email es requerido', 'EMAIL_REQUIRED')
  }
  if (input.password.length < 6) {
    throw new UserError('La contraseña debe tener al menos 6 caracteres', 'PASSWORD_TOO_SHORT')
  }

  // Validar unicidad del email.
  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    throw new UserError(`Ya existe un usuario con email ${email}`, 'EMAIL_DUPLICATE', 409)
  }

  const passwordHash = hashPassword(input.password)
  const user = await db.user.create({
    data: {
      email,
      name: input.name ?? null,
      passwordHash,
      role: input.role,
      active: input.active ?? true,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  logger.info('user.created', { userId: user.id, email: user.email, role: user.role })
  return toSafeUser(user)
}

// ------------------------------------------------------------
// Update
// ------------------------------------------------------------

export async function updateUser(
  id: string,
  input: UpdateUserInput,
  actorId?: string,
): Promise<SafeUser> {
  const existing = await db.user.findUnique({ where: { id } })
  if (!existing) {
    throw new UserError(`Usuario no encontrado: ${id}`, 'USER_NOT_FOUND', 404)
  }

  // Previene auto-desactivación / auto-degradación de rol del ADMIN.
  if (actorId && actorId === id) {
    if (input.active === false) {
      throw new UserError('No puedes desactivar tu propia cuenta', 'SELF_DEACTIVATE_FORBIDDEN', 403)
    }
    if (input.role && input.role !== existing.role) {
      throw new UserError('No puedes cambiar tu propio rol', 'SELF_ROLE_CHANGE_FORBIDDEN', 403)
    }
  }

  const data: Prisma.UserUpdateInput = {}
  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase()
    if (!email) {
      throw new UserError('Email no puede estar vacío', 'EMAIL_REQUIRED')
    }
    // Verifica unicidad solo si cambió.
    if (email !== existing.email) {
      const conflict = await db.user.findUnique({ where: { email } })
      if (conflict) {
        throw new UserError(`Ya existe un usuario con email ${email}`, 'EMAIL_DUPLICATE', 409)
      }
    }
    data.email = email
  }
  if (input.name !== undefined) {
    data.name = input.name
  }
  if (input.role !== undefined) {
    data.role = input.role
  }
  if (input.active !== undefined) {
    data.active = input.active
  }
  if (input.password !== undefined) {
    if (input.password.length < 6) {
      throw new UserError(
        'La contraseña debe tener al menos 6 caracteres',
        'PASSWORD_TOO_SHORT',
      )
    }
    data.passwordHash = hashPassword(input.password)
  }

  const updated = await db.user.update({
    where: { id },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  logger.info('user.updated', { userId: id, actorId: actorId ?? 'system' })
  return toSafeUser(updated)
}

// ------------------------------------------------------------
// Delete (soft — set active=false)
// ------------------------------------------------------------

export async function deleteUser(id: string, actorId?: string): Promise<{ ok: true; deactivated: boolean }> {
  const existing = await db.user.findUnique({ where: { id } })
  if (!existing) {
    throw new UserError(`Usuario no encontrado: ${id}`, 'USER_NOT_FOUND', 404)
  }

  // Previene auto-borrado.
  if (actorId && actorId === id) {
    throw new UserError('No puedes eliminar tu propia cuenta', 'SELF_DELETE_FORBIDDEN', 403)
  }

  // Verifica que no sea el último ADMIN activo.
  if (existing.role === 'ADMIN' && existing.active) {
    const activeAdmins = await db.user.count({
      where: { role: 'ADMIN', active: true },
    })
    if (activeAdmins <= 1) {
      throw new UserError(
        'No se puede eliminar el último administrador activo',
        'LAST_ADMIN_FORBIDDEN',
        409,
      )
    }
  }

  await db.user.update({
    where: { id },
    data: { active: false },
  })

  logger.info('user.deleted (soft)', { userId: id, actorId: actorId ?? 'system' })
  return { ok: true, deactivated: true }
}

// ------------------------------------------------------------
// Stats
// ------------------------------------------------------------

export async function getUserStats(): Promise<UserStats> {
  const [total, active, inactive, roleGroups, recentLogins24h] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { active: true } }),
    db.user.count({ where: { active: false } }),
    db.user.groupBy({ by: ['role'], _count: true }),
    db.user.count({
      where: {
        lastLoginAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    }),
  ])

  const byRole: Record<string, number> = {}
  for (const g of roleGroups) {
    byRole[g.role] = g._count
  }

  return {
    total,
    active,
    inactive,
    byRole,
    recentLogins24h,
  }
}
