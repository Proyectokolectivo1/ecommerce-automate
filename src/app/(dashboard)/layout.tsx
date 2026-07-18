// ============================================================
// (dashboard)/layout.tsx — Dashboard layout (client-only AppShell)
// ============================================================

import { DashboardShell } from '@/components/layout/dashboard-shell'
// Side-effect imports: arrancan workers periódicos del lado del server.
// (cada módulo es idempotente y solo arranca un timer por proceso).
import '@/lib/print-worker'
import '@/modules/alerts/alert-worker'

export const dynamic = 'force-dynamic'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>
}
