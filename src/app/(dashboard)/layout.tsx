// ============================================================
// (dashboard)/layout.tsx — Authenticated layout (server)
// ============================================================
// Server component. Lee la sesión con getCurrentUser(); si no hay,
// redirige a /login. Renderiza el AppShell con la info del usuario.

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { AppShell } from '@/components/layout/app-shell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <AppShell
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      }}
    >
      {children}
    </AppShell>
  )
}
