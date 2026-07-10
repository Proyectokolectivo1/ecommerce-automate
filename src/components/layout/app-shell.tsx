// ============================================================
// app-shell.tsx — Main application shell
// ============================================================
// Layout principal de la app autenticada:
//   - Sidebar fija en desktop (260px) + Sheet colapsable en móvil.
//   - Topbar sticky (h-14) con hamburger, theme toggle, notif, user menu.
//   - Main content area con container max-w-7xl.
//   - Footer sticky-bottom (mt-auto) dentro de un flex-col min-h-screen.

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Package,
  FileText,
  Printer,
  Undo2,
  DollarSign,
  Sparkles,
  Bell,
  Plug,
  UserCog,
  ScrollText,
  Menu,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { ThemeToggle } from './theme-toggle'
import { UserMenu } from './user-menu'
import { NotificationsBell } from './notifications-bell'

export interface AppShellUser {
  id: string
  name?: string | null
  email: string
  role: string
}

interface AppShellProps {
  user: AppShellUser
  children: React.ReactNode
}

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

interface NavSection {
  title: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Operación',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/dashboard/pedidos', label: 'Pedidos', icon: ShoppingCart },
      { href: '/dashboard/clientes', label: 'Clientes', icon: Users },
      { href: '/dashboard/productos', label: 'Productos', icon: Package },
    ],
  },
  {
    title: 'Logística',
    items: [
      { href: '/dashboard/guias', label: 'Guías', icon: FileText },
      { href: '/dashboard/impresion', label: 'Impresión', icon: Printer },
      { href: '/dashboard/devoluciones', label: 'Devoluciones', icon: Undo2 },
    ],
  },
  {
    title: 'Análisis',
    items: [
      { href: '/dashboard/finanzas', label: 'Finanzas', icon: DollarSign },
      { href: '/dashboard/inteligencia-ia', label: 'Inteligencia IA', icon: Sparkles },
      { href: '/dashboard/alertas', label: 'Alertas', icon: Bell },
    ],
  },
  {
    title: 'Configuración',
    items: [
      { href: '/dashboard/integraciones', label: 'Integraciones', icon: Plug },
      { href: '/dashboard/usuarios', label: 'Usuarios', icon: UserCog },
      { href: '/dashboard/auditoria', label: 'Auditoría', icon: ScrollText },
    ],
  },
]

function isActive(pathname: string, href: string): boolean {
  // /dashboard es exact match (evita que quede activo en cualquier sub-ruta).
  if (href === '/dashboard') return pathname === '/dashboard'
  return pathname === href || pathname.startsWith(href + '/')
}

function BrandHeader() {
  return (
    <Link
      href="/dashboard"
      className="flex items-center gap-2 px-4 h-14 border-b shrink-0 hover:bg-accent/40 transition-colors"
    >
      <img
        src="/logo.svg"
        alt="Ecommerce Inteligente"
        className="h-7 w-7"
      />
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold">Ecommerce Inteligente</span>
        <span className="text-[10px] text-muted-foreground">Panel de control</span>
      </div>
    </Link>
  )
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  return (
    <nav className="flex flex-col gap-5 px-3 py-4" aria-label="Navegación principal">
      {NAV_SECTIONS.map((section) => (
        <div key={section.title} className="flex flex-col gap-1">
          <span className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {section.title}
          </span>
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = isActive(pathname, item.href)
              const Icon = item.icon
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      'hover:bg-accent hover:text-accent-foreground',
                      active
                        ? 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
                        : 'text-muted-foreground',
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export function AppShell({ user, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Topbar */}
      <header className="sticky top-0 z-40 h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex h-full items-center gap-2 px-4">
          {/* Mobile hamburger */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Abrir menú"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-5" />
          </Button>

          {/* Mobile brand */}
          <Link
            href="/dashboard"
            className="flex items-center gap-2 md:hidden"
          >
            <img src="/logo.svg" alt="" className="h-6 w-6" />
            <span className="text-sm font-semibold">Ecommerce</span>
          </Link>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right cluster */}
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <NotificationsBell />
            <UserMenu user={user} />
          </div>
        </div>
      </header>

      {/* Body: sidebar + main */}
      <div className="flex flex-1">
        {/* Desktop sidebar (sticky) */}
        <aside className="hidden md:flex md:w-64 md:flex-col md:shrink-0 md:sticky md:top-14 md:h-[calc(100vh-3.5rem)] border-r bg-sidebar">
          <BrandHeader />
          <ScrollArea className="flex-1">
            <NavList />
          </ScrollArea>
        </aside>

        {/* Mobile sidebar (Sheet) */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-72 p-0 flex flex-col">
            <SheetTitle className="sr-only">Navegación</SheetTitle>
            <BrandHeader />
            <ScrollArea className="flex-1">
              <NavList onNavigate={() => setMobileOpen(false)} />
            </ScrollArea>
          </SheetContent>
        </Sheet>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <div className="container mx-auto max-w-7xl p-4 md:p-6">
            {children}
          </div>
        </main>
      </div>

      {/* Footer (sticky-bottom via flex-col + flex-1 on body) */}
      <footer className="mt-auto border-t bg-background">
        <div className="container mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-2 px-4 md:px-6 py-4 text-sm text-muted-foreground">
          <span>© 2024 Ecommerce Inteligente</span>
          <span className="text-xs sm:text-sm">
            Powered by Shopify + Mastershop + n8n
          </span>
        </div>
      </footer>
    </div>
  )
}
