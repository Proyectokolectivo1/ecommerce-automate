// ============================================================
// page.tsx — Home redirect
// ============================================================
// Server component. Si hay sesión → /dashboard, si no → /login.

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'

export default async function Home() {
  const user = await getCurrentUser()
  if (user) {
    redirect('/dashboard')
  }
  redirect('/login')
}
