// ============================================================
// user-menu.tsx — Avatar dropdown with user info + logout
// ============================================================

'use client'

import { signOut } from 'next-auth/react'
import { LogOut, Settings, User } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { initials } from '@/lib/format'

interface UserMenuProps {
  user: { name?: string | null; email: string; role: string }
}

export function UserMenu({ user }: UserMenuProps) {
  const init = initials(user.name) || '?'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto px-2 py-1.5 gap-2 hover:bg-accent"
          aria-label="Menú de usuario"
        >
          <Avatar className="size-7">
            <AvatarFallback className="text-xs">{init}</AvatarFallback>
          </Avatar>
          <span className="hidden sm:flex flex-col items-start leading-tight">
            <span className="text-sm font-medium">{user.name ?? 'Usuario'}</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {user.role}
            </span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-1">
          <span className="font-medium">{user.name ?? 'Usuario'}</span>
          <span className="text-xs text-muted-foreground font-normal">{user.email}</span>
          <Badge variant="secondary" className="mt-1 w-fit">
            {user.role}
          </Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <User className="size-4" />
          Mi perfil
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <Settings className="size-4" />
          Configuración
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => signOut({ callbackUrl: '/login' })}
        >
          <LogOut className="size-4" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
