// ============================================================
// page.tsx — Home (sin redirect server-side)
// ============================================================
// Muestra botones para ir al login o dashboard.
// NO redirige server-side (evita ERR_TOO_MANY_REDIRECTS detrás de proxy).

import Link from 'next/link'
import { LogIn, LayoutDashboard } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="flex flex-col items-center gap-6">
        <img src="/logo.svg" alt="" className="h-16 w-16" />
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Ecommerce Inteligente</h1>
          <p className="text-sm text-muted-foreground">Automatización ecommerce, logística y BI</p>
        </div>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <LogIn className="size-4" />
          Iniciar sesión
        </Link>
      </div>
    </div>
  )
}
