// ============================================================
// dashboard-shell.tsx — Client-only wrapper for AppShell
// ============================================================
// Evita hydration mismatch de Radix UI IDs renderando un loading
// state durante SSR y montando AppShell solo después del mount.

'use client'

import { useState, useEffect } from 'react'
import { AppShell } from './app-shell'
import { Loader2 } from 'lucide-react'

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0)
    return () => clearTimeout(timer)
  }, [])

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin" />
          <p className="text-sm">Cargando panel…</p>
        </div>
      </div>
    )
  }

  return (
    <AppShell
      user={{
        id: '',
        name: '',
        email: '',
        role: 'SERVICIO',
      }}
    >
      {children}
    </AppShell>
  )
}
