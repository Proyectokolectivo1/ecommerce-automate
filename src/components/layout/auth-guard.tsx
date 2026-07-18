// ============================================================
// auth-guard.tsx — Client-side auth guard (definitive)
// ============================================================
// Guard que protege rutas /dashboard/* usando useSession().
//
// Estrategia:
//   1. loading → spinner (no redirige)
//   2. authenticated → renderiza children
//   3. unauthenticated → redirige a /login con window.location
//
// NO usa getServerSession ni redirect() de next/navigation.

'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2 } from 'lucide-react'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()

  useEffect(() => {
    if (status === 'unauthenticated') {
      // Navegación completa (no router.push) para evitar bucles.
      window.location.href = '/login'
    }
  }, [status])

  // Loading → spinner
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin" />
          <p className="text-sm">Cargando…</p>
        </div>
      </div>
    )
  }

  // Unauthenticated → spinner (el useEffect disparará la redirección)
  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin" />
          <p className="text-sm">Redirigiendo al login…</p>
        </div>
      </div>
    )
  }

  // Authenticated pero sesión no lista aún → spinner
  if (!session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin" />
          <p className="text-sm">Cargando panel…</p>
        </div>
      </div>
    )
  }

  // Authenticated con sesión → renderizar
  return <>{children}</>
}
