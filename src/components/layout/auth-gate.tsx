// ============================================================
// auth-gate.tsx — Client-side auth guard (tolerant)
// ============================================================
// Wrapper client que usa useSession() para verificar la sesión.
// Espera hasta 3 segundos antes de redirigir a /login, dando
// tiempo a que la cookie de sesión se propague después del login.
// Esto evita bucles ERR_TOO_MANY_REDIRECTS.

'use client'

import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

const REDIRECT_DELAY_MS = 3000

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const redirectedRef = useRef(false)

  useEffect(() => {
    // Solo redirigir si está unauthenticated Y no hemos redirigido ya.
    if (status === 'unauthenticated' && !redirectedRef.current) {
      redirectedRef.current = true
      // Delay para dar tiempo a que la cookie se establezca
      const timer = setTimeout(() => {
        router.replace('/login')
      }, REDIRECT_DELAY_MS)
      return () => clearTimeout(timer)
    }
  }, [status, router])

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin" />
          <p className="text-sm">
            {status === 'loading' ? 'Verificando sesión…' : 'Redirigiendo al login…'}
          </p>
        </div>
      </div>
    )
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin" />
          <p className="text-sm">Cargando…</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
