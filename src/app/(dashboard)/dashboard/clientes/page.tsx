'use client'

// ============================================================
// /dashboard/clientes — Customers (CRM) management page
// ============================================================
// Client component. Lista clientes con KPIs, filtros (búsqueda,
// clasificación, sort), tabla con detalle, paginación y un
// Sheet lateral con el historial de pedidos del cliente.
//
// Endpoints consumidos:
//   GET /api/customers?stats=true
//   GET /api/customers?search=&classification=&limit=&offset=&sort=&order=
//   GET /api/customers/[id]

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Users,
  Crown,
  Repeat,
  Receipt,
  UserPlus,
  Search,
  Filter,
  Eye,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  Inbox,
  Mail,
  Phone,
  MapPin,
  ShoppingCart,
  DollarSign,
  Calendar,
  Package,
} from 'lucide-react'

import { KPICard } from '@/components/shared/kpi-card'
import { StatusBadge } from '@/components/shared/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn, formatCOP, formatDate, formatNumber } from '@/lib/format'

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

interface Customer {
  id: string
  name: string
  email: string | null
  phone: string | null
  city: string | null
  address?: string | null
  classification: string
  totalSpent: number
  ordersCount: number
  lastOrderAt: string | null
  createdAt: string
  _count?: { orders: number }
}

interface CustomerListResponse {
  customers: Customer[]
  total: number
}

interface CustomerStats {
  total: number
  byClassification: {
    VIP: number
    FRECUENTE: number
    NUEVO: number
    INACTIVO: number
  }
  withEmail: number
  withPhone: number
  byCity: Array<{ city: string; count: number }>
  avgSpent: number
  totalSpent: number
  totalOrders: number
  inactiveCount: number
}

interface CustomerDetailOrder {
  id: string
  orderNumber: string
  status: string
  paymentMethod: string
  total: number
  placedAt: string
  city: string | null
  _count?: { shipments: number; returns: number }
}

interface CustomerDetail extends Customer {
  shopifyId?: string | null
  orders?: CustomerDetailOrder[]
  _count?: { orders: number }
}

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------

const PAGE_SIZE = 15

const CLASSIFICATION_OPTIONS = [
  { value: 'ALL', label: 'Todas las clasificaciones' },
  { value: 'VIP', label: 'VIP' },
  { value: 'FRECUENTE', label: 'Frecuentes' },
  { value: 'NUEVO', label: 'Nuevos' },
  { value: 'INACTIVO', label: 'Inactivos' },
] as const

const SORT_OPTIONS = [
  { value: 'totalSpent', label: 'Total gastado' },
  { value: 'ordersCount', label: 'Número de pedidos' },
  { value: 'name', label: 'Nombre' },
  { value: 'lastOrderAt', label: 'Último pedido' },
  { value: 'createdAt', label: 'Fecha de alta' },
] as const

const CLASSIFICATION_BADGE: Record<string, { className: string; dot: string }> = {
  VIP: {
    className:
      'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  FRECUENTE: {
    className:
      'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  NUEVO: {
    className:
      'border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-200',
    dot: 'bg-zinc-400',
  },
  INACTIVO: {
    className:
      'border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    dot: 'bg-rose-500',
  },
}

function classificationBadgeClass(c: string): string {
  return (
    CLASSIFICATION_BADGE[c]?.className ??
    'border-border bg-muted text-muted-foreground'
  )
}

interface Filters {
  search: string
  classification: string
  sort: string
  order: string
}

const DEFAULT_FILTERS: Filters = {
  search: '',
  classification: 'ALL',
  sort: 'totalSpent',
  order: 'desc',
}

// ------------------------------------------------------------
// Page
// ------------------------------------------------------------

export default function ClientesPage() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Debounce search input.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(filters.search.trim())
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [filters.search])

  // KPIs
  const statsQuery = useQuery<CustomerStats>({
    queryKey: ['customers-stats'],
    queryFn: async () => {
      const res = await fetch('/api/customers?stats=true')
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err?.error ?? `Error ${res.status}`)
      }
      return res.json() as Promise<CustomerStats>
    },
  })

  // List
  const listQueryKey = useMemo(
    () =>
      [
        'customers',
        debouncedSearch,
        filters.classification,
        filters.sort,
        filters.order,
        page,
      ] as const,
    [debouncedSearch, filters.classification, filters.sort, filters.order, page],
  )

  const listQuery = useQuery<CustomerListResponse>({
    queryKey: listQueryKey,
    queryFn: async () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (filters.classification !== 'ALL')
        params.set('classification', filters.classification)
      params.set('sortBy', filters.sort)
      params.set('sortDir', filters.order)
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(page * PAGE_SIZE))
      const res = await fetch(`/api/customers?${params.toString()}`)
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err?.error ?? `Error ${res.status}`)
      }
      return res.json() as Promise<CustomerListResponse>
    },
    placeholderData: (prev) => prev,
  })

  const customers = listQuery.data?.customers ?? []
  const total = listQuery.data?.total ?? 0
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1
  const to = Math.min((page + 1) * PAGE_SIZE, total)
  const hasNext = to < total
  const hasPrev = page > 0

  const hasActiveFilters =
    filters.classification !== 'ALL' || filters.search.trim() !== ''

  function clearFilters() {
    setFilters(DEFAULT_FILTERS)
    setDebouncedSearch('')
    setPage(0)
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Users className="size-6 text-muted-foreground" aria-hidden />
            Clientes
          </h1>
          <p className="text-sm text-muted-foreground">
            CRM · gestiona y clasifica tu base de clientes.
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {total} clientes
        </Badge>
      </header>

      {/* KPI row */}
      <section
        aria-label="KPIs de clientes"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <KPICard
          title="Total clientes"
          value={formatNumber(statsQuery.data?.total ?? 0)}
          subtitle="Registrados"
          icon={<Users className="size-5" />}
          loading={statsQuery.isLoading}
        />
        <KPICard
          title="VIP"
          value={formatNumber(statsQuery.data?.byClassification?.VIP ?? 0)}
          subtitle="Clientes destacados"
          icon={<Crown className="size-5" />}
          loading={statsQuery.isLoading}
        />
        <KPICard
          title="Frecuentes"
          value={formatNumber(statsQuery.data?.byClassification?.FRECUENTE ?? 0)}
          subtitle="Recurrencia alta"
          icon={<Repeat className="size-5" />}
          loading={statsQuery.isLoading}
        />
        <KPICard
          title="Ticket promedio"
          value={formatCOP(statsQuery.data?.avgSpent ?? 0)}
          subtitle="Por cliente"
          icon={<Receipt className="size-5" />}
          loading={statsQuery.isLoading}
        />
        <KPICard
          title="Nuevos este mes"
          value={formatNumber(statsQuery.data?.byClassification?.NUEVO ?? 0)}
          subtitle="Clasificación nuevo"
          icon={<UserPlus className="size-5" />}
          loading={statsQuery.isLoading}
        />
      </section>

      {/* Filters */}
      <Card className="gap-0 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              type="search"
              placeholder="Buscar por nombre, email, teléfono o ciudad…"
              value={filters.search}
              onChange={(e) =>
                setFilters((f) => ({ ...f, search: e.target.value }))
              }
              className="pl-9"
              aria-label="Buscar clientes"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={filters.classification}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, classification: v }))
                setPage(0)
              }}
            >
              <SelectTrigger className="w-full sm:w-56" aria-label="Clasificación">
                <div className="flex items-center gap-2">
                  <Filter className="size-4 text-muted-foreground" />
                  <SelectValue placeholder="Clasificación" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {CLASSIFICATION_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.sort}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, sort: v }))
                setPage(0)
              }}
            >
              <SelectTrigger className="w-full sm:w-44" aria-label="Ordenar por">
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.order}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, order: v }))
                setPage(0)
              }}
            >
              <SelectTrigger className="w-full sm:w-32" aria-label="Dirección">
                <SelectValue placeholder="Dirección" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Descendente</SelectItem>
                <SelectItem value="asc">Ascendente</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="gap-1.5"
              >
                <X className="size-4" />
                Limpiar
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="gap-0 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <div className="max-h-[640px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Cliente</TableHead>
                  <TableHead className="hidden md:table-cell">Teléfono</TableHead>
                  <TableHead className="hidden lg:table-cell">Ciudad</TableHead>
                  <TableHead>Clasificación</TableHead>
                  <TableHead className="text-right">Pedidos</TableHead>
                  <TableHead className="text-right">Total gastado</TableHead>
                  <TableHead className="hidden xl:table-cell">
                    Último pedido
                  </TableHead>
                  <TableHead className="pr-4 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQuery.isLoading && customers.length === 0
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={`sk-${i}`}>
                        <TableCell className="pl-4">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="mt-1 h-3 w-40" />
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-20 rounded-full" />
                        </TableCell>
                        <TableCell className="text-right">
                          <Skeleton className="ml-auto h-4 w-8" />
                        </TableCell>
                        <TableCell className="text-right">
                          <Skeleton className="ml-auto h-4 w-24" />
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell className="pr-4 text-right">
                          <Skeleton className="ml-auto h-8 w-20" />
                        </TableCell>
                      </TableRow>
                    ))
                  : customers.map((c) => (
                      <CustomerRow
                        key={c.id}
                        customer={c}
                        onView={() => setSelectedId(c.id)}
                      />
                    ))}
              </TableBody>
            </Table>

            {!listQuery.isLoading && !listQuery.isError && customers.length === 0 && (
              <EmptyState hasFilters={hasActiveFilters} onClear={clearFilters} />
            )}

            {listQuery.isError && (
              <div className="flex flex-col items-center gap-2 p-12 text-center text-sm">
                <Inbox className="size-8 text-muted-foreground" />
                <p className="font-medium">No se pudieron cargar los clientes.</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => listQuery.refetch()}
                >
                  Reintentar
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Pagination */}
        <div className="flex flex-col items-center justify-between gap-3 border-t bg-card p-3 sm:flex-row">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {listQuery.isFetching && (
              <Loader2 className="size-3 animate-spin" aria-hidden />
            )}
            <span>
              {total === 0
                ? 'Sin resultados'
                : `Mostrando ${from}–${to} de ${total}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={!hasPrev || listQuery.isFetching}
              className="gap-1"
            >
              <ChevronLeft className="size-4" />
              Anterior
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">
              Pág. {page + 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNext || listQuery.isFetching}
              className="gap-1"
            >
              Siguiente
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Detail Sheet */}
      <CustomerDetailSheet
        customerId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  )
}

// ------------------------------------------------------------
// Row
// ------------------------------------------------------------

function CustomerRow({
  customer,
  onView,
}: {
  customer: Customer
  onView: () => void
}) {
  return (
    <TableRow
      onClick={onView}
      className="cursor-pointer"
      tabIndex={0}
      role="button"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onView()
        }
      }}
    >
      <TableCell className="pl-4">
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{customer.name}</span>
          {customer.email && (
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
              {customer.email}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <span className="text-sm text-muted-foreground tabular-nums">
          {customer.phone ?? '—'}
        </span>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <span className="text-sm text-muted-foreground">
          {customer.city ?? '—'}
        </span>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={cn('border', classificationBadgeClass(customer.classification))}>
          {customer.classification}
        </Badge>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatNumber(customer.ordersCount)}
      </TableCell>
      <TableCell className="text-right">
        <span className="font-semibold tabular-nums">
          {formatCOP(customer.totalSpent)}
        </span>
      </TableCell>
      <TableCell className="hidden xl:table-cell">
        <span className="text-xs text-muted-foreground">
          {customer.lastOrderAt ? formatDate(customer.lastOrderAt) : '—'}
        </span>
      </TableCell>
      <TableCell className="pr-4 text-right">
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            onView()
          }}
          className="gap-1.5"
        >
          <Eye className="size-4" />
          <span className="hidden sm:inline">Ver detalle</span>
        </Button>
      </TableCell>
    </TableRow>
  )
}

// ------------------------------------------------------------
// Detail Sheet
// ------------------------------------------------------------

function CustomerDetailSheet({
  customerId,
  onClose,
}: {
  customerId: string | null
  onClose: () => void
}) {
  const { data, isLoading, isError } = useQuery<CustomerDetail>({
    queryKey: ['customer', customerId],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${customerId}`)
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err?.error ?? `Error ${res.status}`)
      }
      return res.json() as Promise<CustomerDetail>
    },
    enabled: !!customerId,
  })

  const orders = data?.orders ?? []
  const avgTicket =
    data && data.ordersCount > 0 ? data.totalSpent / data.ordersCount : 0

  return (
    <Sheet open={!!customerId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="border-b px-6 py-4 text-left">
          <SheetTitle className="text-lg">Detalle del cliente</SheetTitle>
          <SheetDescription className="sr-only">
            Información completa del cliente y su historial de pedidos
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <div className="space-y-6 p-6">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-12 rounded-full" />
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : isError ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                No se pudo cargar el detalle.
              </div>
            ) : data ? (
              <>
                {/* Header */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-xl font-semibold leading-tight">
                      {data.name}
                    </h2>
                    <Badge
                      variant="outline"
                      className={cn('border', classificationBadgeClass(data.classification))}
                    >
                      {data.classification}
                    </Badge>
                  </div>

                  {/* Contacto */}
                  <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Mail className="size-4 text-muted-foreground shrink-0" />
                      <span className="truncate">{data.email ?? '—'}</span>
                    </div>
                    <Separator />
                    <div className="flex items-center gap-2">
                      <Phone className="size-4 text-muted-foreground shrink-0" />
                      <span className="tabular-nums">{data.phone ?? '—'}</span>
                    </div>
                    <Separator />
                    <div className="flex items-center gap-2">
                      <MapPin className="size-4 text-muted-foreground shrink-0" />
                      <span>{data.city ?? '—'}</span>
                    </div>
                    {data.address && (
                      <>
                        <Separator />
                        <div className="flex items-center gap-2">
                          <Package className="size-4 text-muted-foreground shrink-0" />
                          <span className="truncate">{data.address}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Estadísticas
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <MiniStat
                      icon={<ShoppingCart className="size-4" />}
                      label="Pedidos"
                      value={formatNumber(data.ordersCount)}
                    />
                    <MiniStat
                      icon={<DollarSign className="size-4" />}
                      label="Total gastado"
                      value={formatCOP(data.totalSpent)}
                    />
                    <MiniStat
                      icon={<Receipt className="size-4" />}
                      label="Ticket promedio"
                      value={formatCOP(avgTicket)}
                    />
                    <MiniStat
                      icon={<Calendar className="size-4" />}
                      label="Último pedido"
                      value={data.lastOrderAt ? formatDate(data.lastOrderAt) : '—'}
                    />
                  </div>
                </div>

                {/* Historial de pedidos */}
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Historial de pedidos ({orders.length})
                  </h3>
                  {orders.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      Sin pedidos registrados.
                    </div>
                  ) : (
                    <div className="max-h-96 overflow-y-auto pr-1 [scrollbar-width:thin] space-y-1">
                      {orders.map((o) => (
                        <div
                          key={o.id}
                          className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-3"
                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-medium">
                                {o.orderNumber}
                              </span>
                              <StatusBadge status={o.status} size="sm" />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(o.placedAt)}
                            </p>
                          </div>
                          <span className="text-sm font-semibold tabular-nums">
                            {formatCOP(o.total)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1 truncate text-sm font-semibold text-foreground" title={value}>
        {value}
      </p>
    </div>
  )
}

// ------------------------------------------------------------
// Empty state
// ------------------------------------------------------------

function EmptyState({
  hasFilters,
  onClear,
}: {
  hasFilters: boolean
  onClear: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Inbox className="size-6 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium">No se encontraron clientes</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {hasFilters
            ? 'Prueba con otros filtros o limpia la búsqueda.'
            : 'Aún no se han registrado clientes en la plataforma.'}
        </p>
      </div>
      {hasFilters && (
        <Button variant="outline" size="sm" onClick={onClear} className="gap-1.5">
          <X className="size-4" />
          Limpiar filtros
        </Button>
      )}
    </div>
  )
}
