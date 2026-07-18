'use client'

// ============================================================
// /dashboard/usuarios — User administration page
// ============================================================
// Client component. Solo ADMIN puede acceder. KPIs, tabla de
// usuarios con badges por rol y estado, dialogs para crear y
// editar, AlertDialog para eliminar (propia fila deshabilitada).
//
// Endpoints consumidos:
//   GET    /api/admin/users?stats=true
//   GET    /api/admin/users
//   POST   /api/admin/users
//   PUT    /api/admin/users/[id]
//   DELETE /api/admin/users/[id]

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  UserCog,
  Users,
  UserCheck,
  UserX,
  Clock,
  Search,
  Filter,
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  Inbox,
  ShieldAlert,
} from 'lucide-react'

import { KPICard } from '@/components/shared/kpi-card'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { canAccess, type Role } from '@/lib/auth-utils'
import { cn, formatDate, initials } from '@/lib/format'

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

interface User {
  id: string
  email: string
  name: string | null
  role: string
  active: boolean
  lastLoginAt: string | null
  createdAt: string
}

interface UserListResponse {
  users: User[]
  total: number
}

interface UserStats {
  total: number
  active: number
  inactive: number
  byRole: Record<string, number>
  recentLogins24h: number
}

interface UserFormValues {
  name: string
  email: string
  role: Role
  active: boolean
  password?: string
}

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------

const ROLE_OPTIONS: Role[] = ['ADMIN', 'GERENCIA', 'BODEGA', 'SERVICIO']

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  GERENCIA: 'Gerencia',
  BODEGA: 'Bodega',
  SERVICIO: 'Servicio',
}

const ROLE_BADGE: Record<string, string> = {
  ADMIN:
    'border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  GERENCIA:
    'border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  BODEGA:
    'border-teal-300 bg-teal-100 text-teal-700 dark:border-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  SERVICIO:
    'border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-200',
}

function roleBadgeClass(r: string): string {
  return ROLE_BADGE[r] ?? 'border-border bg-muted text-muted-foreground'
}

const EMPTY_FORM: UserFormValues = {
  name: '',
  email: '',
  role: 'SERVICIO',
  active: true,
  password: '',
}

// ------------------------------------------------------------
// Page
// ------------------------------------------------------------

export default function UsuariosPage() {
  const { data: session, status } = useSession()
  const role = session?.user?.role ?? ''
  const currentUserId = session?.user?.id ?? ''
  const isAdmin = canAccess(role, '') // ADMIN only — empty allowedRoles means only ADMIN

  // Loading session state
  if (status === 'loading') {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  // Access control
  if (!isAdmin) {
    return <AccessDenied />
  }

  return <UsuariosContent currentUserId={currentUserId} />
}

// ------------------------------------------------------------
// Access denied
// ------------------------------------------------------------

function AccessDenied() {
  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6">
      <Card className="border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30">
        <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-900/50">
            <ShieldAlert className="size-7 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-rose-700 dark:text-rose-300">
              Acceso denegado
            </h2>
            <p className="text-sm text-rose-600/80 dark:text-rose-400/80">
              No tienes permisos para acceder a la gestión de usuarios.
              Esta sección está reservada para administradores.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ------------------------------------------------------------
// Main content (only ADMIN)
// ------------------------------------------------------------

function UsuariosContent({ currentUserId }: { currentUserId: string }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [form, setForm] = useState<UserFormValues>(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  // The /api/admin/users endpoint returns { users, total, stats } when
  // stats=true is set (combined response). We use a single query.
  const combinedQuery = useQuery<{ users: User[]; total: number; stats: UserStats }>({
    queryKey: ['users', debouncedSearch, roleFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('stats', 'true')
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (roleFilter !== 'ALL') params.set('role', roleFilter)
      const res = await fetch(`/api/admin/users?${params.toString()}`)
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err?.error ?? `Error ${res.status}`)
      }
      return res.json() as Promise<{ users: User[]; total: number; stats: UserStats }>
    },
  })

  const users = combinedQuery.data?.users ?? []
  const stats = combinedQuery.data?.stats

  // Compute the most recent login time from the users list (the API
  // stats endpoint doesn't return this directly).
  const latestLoginAt = useMemo(() => {
    const times = users
      .map((u) => (u.lastLoginAt ? new Date(u.lastLoginAt).getTime() : 0))
      .filter((t) => t > 0)
    return times.length > 0 ? new Date(Math.max(...times)).toISOString() : null
  }, [users])
  const latestLoginLabel = latestLoginAt ? formatDate(latestLoginAt) : '—'

  const createMutation = useMutation({
    mutationFn: async (values: UserFormValues) => {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const json = (await res.json().catch(() => ({}))) as { user?: User; error?: string }
      if (!res.ok) throw new Error(json?.error ?? `Error ${res.status}`)
      return json
    },
    onSuccess: () => {
      toast.success('Usuario creado')
      void qc.invalidateQueries({ queryKey: ['users'] })
      setDialogOpen(false)
    },
    onError: (err: unknown) => {
      toast.error('No se pudo crear el usuario', {
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: UserFormValues }) => {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const json = (await res.json().catch(() => ({}))) as { user?: User; error?: string }
      if (!res.ok) throw new Error(json?.error ?? `Error ${res.status}`)
      return json
    },
    onSuccess: () => {
      toast.success('Usuario actualizado')
      void qc.invalidateQueries({ queryKey: ['users'] })
      setDialogOpen(false)
    },
    onError: (err: unknown) => {
      toast.error('No se pudo actualizar el usuario', {
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) throw new Error(json?.error ?? `Error ${res.status}`)
      return json
    },
    onSuccess: () => {
      toast.success('Usuario eliminado')
      void qc.invalidateQueries({ queryKey: ['users'] })
      setDeleteTarget(null)
    },
    onError: (err: unknown) => {
      toast.error('No se pudo eliminar el usuario', {
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEdit(u: User) {
    setEditing(u)
    setForm({
      name: u.name ?? '',
      email: u.email,
      role: u.role as Role,
      active: u.active,
      password: '',
    })
    setDialogOpen(true)
  }

  function submitForm() {
    if (!form.email || !form.name) {
      toast.error('Nombre y email son obligatorios')
      return
    }
    if (editing) {
      updateMutation.mutate({ id: editing.id, values: form })
    } else {
      if (!form.password || form.password.length < 6) {
        toast.error('La contraseña debe tener al menos 6 caracteres')
        return
      }
      createMutation.mutate(form)
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <UserCog className="size-6 text-muted-foreground" aria-hidden />
            Usuarios
          </h1>
          <p className="text-sm text-muted-foreground">
            Gestiona cuentas, roles y permisos del equipo.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="size-4" />
          Nuevo usuario
        </Button>
      </header>

      {/* KPIs */}
      <section
        aria-label="KPIs de usuarios"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <KPICard
          title="Total"
          value={String(stats?.total ?? 0)}
          subtitle="Usuarios registrados"
          icon={<Users className="size-5" />}
          loading={combinedQuery.isLoading}
        />
        <KPICard
          title="Activos"
          value={String(stats?.active ?? 0)}
          subtitle="Con acceso"
          icon={<UserCheck className="size-5" />}
          loading={combinedQuery.isLoading}
        />
        <KPICard
          title="Inactivos"
          value={String(stats?.inactive ?? 0)}
          subtitle="Suspendidos"
          icon={<UserX className="size-5" />}
          loading={combinedQuery.isLoading}
        />
        <KPICard
          title="Último login"
          value={latestLoginLabel}
          subtitle="Más reciente"
          icon={<Clock className="size-5" />}
          loading={combinedQuery.isLoading}
        />
      </section>

      {/* Filters */}
      <Card className="gap-0 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              type="search"
              placeholder="Buscar por nombre o email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Buscar usuarios"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full sm:w-52" aria-label="Rol">
              <div className="flex items-center gap-2">
                <Filter className="size-4 text-muted-foreground" />
                <SelectValue placeholder="Rol" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los roles</SelectItem>
              {ROLE_OPTIONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(search || roleFilter !== 'ALL') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('')
                setRoleFilter('ALL')
              }}
              className="gap-1.5"
            >
              <X className="size-4" />
              Limpiar
            </Button>
          )}
        </div>
      </Card>

      {/* Table */}
      <Card className="gap-0 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Usuario</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="hidden md:table-cell">Último login</TableHead>
                <TableHead className="pr-4 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {combinedQuery.isLoading && users.length === 0
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={`sk-${i}`}>
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-3">
                          <Skeleton className="size-9 rounded-full" />
                          <div className="space-y-1">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-40" />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell className="pr-4 text-right"><Skeleton className="ml-auto h-8 w-24" /></TableCell>
                    </TableRow>
                  ))
                : users.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      isSelf={u.id === currentUserId}
                      onEdit={() => openEdit(u)}
                      onDelete={() => setDeleteTarget(u)}
                    />
                  ))}
            </TableBody>
          </Table>

          {!combinedQuery.isLoading && !combinedQuery.isError && users.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <Inbox className="size-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Sin usuarios</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Crea el primer usuario con el botón "Nuevo usuario".
                </p>
              </div>
            </div>
          )}

          {combinedQuery.isError && (
            <div className="flex flex-col items-center gap-2 p-12 text-center text-sm">
              <Inbox className="size-8 text-muted-foreground" />
              <p className="font-medium">No se pudieron cargar los usuarios.</p>
              <Button variant="outline" size="sm" onClick={() => combinedQuery.refetch()}>
                Reintentar
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar usuario' : 'Nuevo usuario'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Actualiza los datos del usuario. Deja la contraseña vacía para no cambiarla.'
                : 'Completa los datos para crear una nueva cuenta de usuario.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="user-name">Nombre completo</Label>
              <Input
                id="user-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ej: Ana García"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="ana@empresa.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-role">Rol</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm((f) => ({ ...f, role: v as Role }))}
              >
                <SelectTrigger id="user-role" className="w-full">
                  <SelectValue placeholder="Selecciona un rol" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-password">
                Contraseña {editing && <span className="text-xs text-muted-foreground">(opcional)</span>}
              </Label>
              <Input
                id="user-password"
                type="password"
                value={form.password ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder={editing ? 'Dejar vacío para mantener' : 'Mínimo 6 caracteres'}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="user-active">Usuario activo</Label>
                <p className="text-xs text-muted-foreground">
                  Los usuarios inactivos no pueden iniciar sesión.
                </p>
              </div>
              <Switch
                id="user-active"
                checked={form.active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={submitForm} disabled={isSaving} className="gap-2">
              {isSaving && <Loader2 className="size-4 animate-spin" />}
              {editing ? 'Guardar cambios' : 'Crear usuario'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El usuario{' '}
              <span className="font-medium text-foreground">
                {deleteTarget?.name ?? deleteTarget?.email}
              </span>{' '}
              será eliminado permanentemente del sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              className="gap-2 bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-600"
            >
              {deleteMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ------------------------------------------------------------
// Row
// ------------------------------------------------------------

function UserRow({
  user,
  isSelf,
  onEdit,
  onDelete,
}: {
  user: User
  isSelf: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <TableRow>
      <TableCell className="pl-4">
        <div className="flex items-center gap-3">
          <Avatar className="size-9">
            <AvatarFallback className="text-xs">
              {initials(user.name) || '?'}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">
                {user.name ?? '—'}
              </span>
              {isSelf && (
                <Badge
                  variant="outline"
                  className="border-teal-300 bg-teal-100 text-teal-700 dark:border-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
                >
                  Tú
                </Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">{user.email}</span>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={cn('border', roleBadgeClass(user.role))}>
          {ROLE_LABELS[user.role] ?? user.role}
        </Badge>
      </TableCell>
      <TableCell>
        {user.active ? (
          <Badge
            variant="outline"
            className="border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          >
            Activo
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
          >
            Inactivo
          </Badge>
        )}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <span className="text-xs text-muted-foreground">
          {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Nunca'}
        </span>
      </TableCell>
      <TableCell className="pr-4 text-right">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit} className="gap-1.5">
            <Pencil className="size-3.5" />
            <span className="hidden sm:inline">Editar</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={isSelf}
            className="gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-40"
            title={isSelf ? 'No puedes eliminar tu propia cuenta' : undefined}
          >
            <Trash2 className="size-3.5" />
            <span className="hidden sm:inline">Eliminar</span>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
