// ============================================================
// login/page.tsx — Login page (simple, sin 2FA en el flujo)
// ============================================================

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { signIn, getSession } from 'next-auth/react'
import { toast } from 'sonner'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  const [email, setEmail] = useState('admin@demo.com')
  const [password, setPassword] = useState('admin123')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (res?.ok) {
        toast.success('Sesión iniciada', { description: 'Redirigiendo al panel…' })
        await new Promise((r) => setTimeout(r, 500))
        const session = await getSession()
        if (session?.user) {
          window.location.href = '/dashboard'
        } else {
          window.location.reload()
        }
        return
      }

      toast.error('Credenciales inválidas', { description: 'Verifica tu email y contraseña.' })
      setLoading(false)
    } catch (err) {
      toast.error('Error inesperado', { description: err instanceof Error ? err.message : 'Intenta nuevamente.' })
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-2 mb-6">
          <img src="/logo.svg" alt="Ecommerce Inteligente" className="h-14 w-14" />
          <h1 className="text-2xl font-bold tracking-tight">Ecommerce Inteligente</h1>
          <p className="text-sm text-muted-foreground">Automatización ecommerce, logística y BI</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Iniciar sesión</CardTitle>
            <CardDescription>Ingresa tus credenciales para acceder al panel</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit} noValidate>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" autoComplete="email" placeholder="tu@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={loading} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input id="password" name="password" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={loading} />
              </div>
              <div className="rounded-md border border-dashed bg-muted/40 p-3 text-xs">
                <p className="font-semibold text-foreground mb-1">Credenciales demo</p>
                <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-muted-foreground">
                  <span className="text-foreground/70">Email:</span>
                  <code className="font-mono">admin@demo.com</code>
                  <span className="text-foreground/70">Contraseña:</span>
                  <code className="font-mono">admin123</code>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={loading || !email || !password}>
                {loading ? (<><Loader2 className="size-4 animate-spin" /> Ingresando…</>) : 'Ingresar'}
              </Button>
              <Link href="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors">
                <ArrowLeft className="size-3.5" /> Volver al inicio
              </Link>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}
