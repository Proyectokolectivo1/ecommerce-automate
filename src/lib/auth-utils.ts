// ============================================================
// auth-utils.ts — Password hashing (sha256) + Role helpers
// ============================================================
// Nota: bcrypt no está instalado en el sandbox. Para el demo se usa
// sha256 con un salt fijo. En producción se debe reemplazar por bcrypt
// o argon2 sin cambiar la firma de las funciones.

import { createHash, timingSafeEqual } from 'node:crypto'

// ------------------------------------------------------------
// Roles
// ------------------------------------------------------------

export const ROLES = {
  ADMIN: 'ADMIN',
  GERENCIA: 'GERENCIA',
  BODEGA: 'BODEGA',
  SERVICIO: 'SERVICIO',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

export const ROLE_VALUES: string[] = Object.values(ROLES)

/**
 * Verifica si un rol tiene acceso a un recurso protegido.
 * ADMIN tiene acceso a todo (super-usuario).
 */
export function canAccess(userRole: string, ...allowedRoles: string[]): boolean {
  if (!userRole) return false
  if (userRole === ROLES.ADMIN) return true
  return allowedRoles.includes(userRole)
}

// ------------------------------------------------------------
// Password hashing
// ------------------------------------------------------------

const SALT = 'ecommerce-platform-2024-salt'

/**
 * Hashea una contraseña en texto plano usando sha256 + salt.
 * Devuelve una cadena hexadecimal de 64 caracteres.
 */
export function hashPassword(plain: string): string {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('hashPassword: la contraseña no puede estar vacía')
  }
  return createHash('sha256')
    .update(`${SALT}:${plain}`)
    .digest('hex')
}

/**
 * Verifica una contraseña en texto plano contra un hash almacenado.
 * Usa timingSafeEqual para mitigar timing attacks.
 */
export function verifyPassword(plain: string, hash: string): boolean {
  if (!plain || !hash) return false
  try {
    const computed = hashPassword(plain)
    const a = Buffer.from(computed, 'hex')
    const b = Buffer.from(hash, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
