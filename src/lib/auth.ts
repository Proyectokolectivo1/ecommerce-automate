// ============================================================
// auth.ts — NextAuth config (v4) with 4 roles
// ============================================================
// Configuración de NextAuth con CredentialsProvider. Roles:
//   ADMIN | GERENCIA | BODEGA | SERVICIO
//
// El callback de sesión inyecta `user.role` y `user.id` para que estén
// disponibles en el cliente (useSession) y en el servidor (getCurrentUser).
//
// Secret: process.env.NEXTAUTH_SECRET || "dev-secret-ecommerce-platform-2024"

import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { getServerSession } from 'next-auth'
import { db } from '@/lib/db'
import { verifyPassword, type Role } from '@/lib/auth-utils'
import { logger } from '@/lib/logger'

export interface SessionUser {
  id: string
  email: string
  name?: string | null
  role: Role
}

declare module 'next-auth' {
  interface Session {
    user: SessionUser
  }
  interface User {
    id: string
    role: Role
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: Role
  }
}

const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'dev-secret-ecommerce-platform-2024'

export const authOptions: NextAuthOptions = {
  secret: JWT_SECRET,
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 8, // 8 horas
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'Credenciales',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }
        try {
          const user = await db.user.findUnique({
            where: { email: credentials.email.toLowerCase() },
          })
          if (!user || !user.active) {
            logger.warn('auth.login user-not-found/inactive', {
              email: credentials.email,
            })
            return null
          }
          const ok = verifyPassword(credentials.password, user.passwordHash)
          if (!ok) {
            logger.warn('auth.login bad-password', { email: credentials.email })
            return null
          }
          // Actualiza lastLoginAt (fire-and-forget, sin bloquear el login)
          void db.user
            .update({
              where: { id: user.id },
              data: { lastLoginAt: new Date() },
            })
            .catch(() => undefined)
          logger.info('auth.login success', { userId: user.id, role: user.role })
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role as Role,
          }
        } catch (err) {
          logger.error('auth.login error', {
            error: err instanceof Error ? err.message : String(err),
          })
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id
        session.user.role = token.role
        // Asegura email y name desde el token si faltan
        if (!session.user.email && token.email) {
          session.user.email = token.email
        }
        if (!session.user.name && token.name) {
          session.user.name = token.name
        }
      }
      return session
    },
  },
}

/**
 * Lee la sesión actual server-side.
 * Devuelve null si no hay sesión.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return null
    return session.user
  } catch (err) {
    logger.error('getCurrentUser error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Verifica que el usuario tenga uno de los roles permitidos.
 * ADMIN siempre tiene acceso (super-usuario).
 * @throws Error si no hay sesión o el rol no está permitido.
 */
export function requireRole(
  session: SessionUser | null,
  ...roles: Role[]
): SessionUser {
  if (!session) {
    throw new AuthError('No autenticado', 401)
  }
  if (session.role === 'ADMIN') return session
  if (roles.length === 0 || roles.includes(session.role)) {
    return session
  }
  throw new AuthError(
    `Acceso denegado. Roles permitidos: ${roles.join(', ')}`,
    403,
  )
}

export class AuthError extends Error {
  statusCode: number
  constructor(message: string, statusCode = 403) {
    super(message)
    this.name = 'AuthError'
    this.statusCode = statusCode
  }
}
