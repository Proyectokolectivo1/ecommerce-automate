'use client'

// ============================================================
// /dashboard/guias — Shipments (Guías) management page
// ============================================================
// Client component. Lista envíos con filtros + paginación, KPIs,
// y un drawer lateral (Sheet) con el detalle completo incluyendo
// la línea de tiempo de tracking events.
//
// Endpoints consumidos (read-only, ya existentes):
//   GET /api/guides?status=&carrier=&search=&limit=&offset=
//   GET /api/guides?stats=true
//   GET /api/guides/[id]
//   GET /api/guides/[id]/pdf   (download)
//   POST /api/print?process=true   (forzar cola de impresión — ADMIN/BODEGA)

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  FileText,
  Printer,
  Clock,
  Truck,
  Search,
  Filter,
  Eye,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  Inbox,
  Package,
  MapPin,
  User,
  Mail,
  Phone,
  Receipt,
  Download,
  Route,
  Building2,
  Hash,
  CircleDot,
  CalendarClock,
  ExternalLink,
} from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
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
import { KPICard } from '@/components/shared/kpi-card'
import { canAccess } from '@/lib/auth-utils'
import { cn, formatCOP, formatDate } from '@/lib/format'

// ------------------------------------------------------------
// Tipos (espejo del payload del API)
// ------------------------------------------------------------

interface Customer {
  id: string
  name: string
  email: string | null
  phone: string | null
}

interface OrderItem {
  id: string
  title: string
  quantity: number
  sku: string | null
}

interface Order {
  id: string
  orderNumber: string
  status: string
  total: number
  city: string | null
  address?: string | null
  customer: Customer
  items: OrderItem[]
}

interface TrackingEvent {
  id: string
  status: string
  message: string | null
  city: string | null
  occurredAt: string
  createdAt: string
}

interface ShipmentWithRelations {
  id: string
  orderId: string
  carrier: string | null
  guideNumber: string | null
  mastershopId: string | null
  status: string
  pdfUrl: string | null
  createdAt: string
  updatedAt: string
  order: Order
  trackingEvents: TrackingEvent[]
}

interface ShipmentsResponse {
  shipments: ShipmentWithRelations[]
  total: number
}

interface GuidesStats {
  total: number
  byStatus: Record<string, number>
  printed: number
  pendingPrint: number
}

// ------------------------------------------------------------
// Constantes de presentación
// ------------------------------------------------------------

const PAGE_SIZE = 15

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Todos los estados' },
  { value: 'CREATED', label: 'Creado' },
  { value: 'PRINTED', label: 'Impreso' },
  { value: 'IN_TRANSIT', label: 'En tránsito' },
  { value: 'DELIVERED', label: 'Entregado' },
  { value: 'RETURNED', label: 'Devuelto' },
] as const

const CARRIER_OPTIONS = [
  { value: 'ALL', label: 'Todas las transportadoras' },
  { value: 'SERVIENTREGA', label: 'Servientrega' },
  { value: 'ENVIA', label: 'Envía' },
  { value: 'INTERRAPIDISIMO', label: 'Interrapidísimo' },
  { value: 'COORDINADORA', label: 'Coordinadora' },
  { value: 'TCC', label: 'TCC' },
] as const

const CARRIER_LABEL: Record<string, string> = {
  SERVIENTREGA: 'Servientrega',
  ENVIA: 'Envía',
  INTERRAPIDISIMO: 'Interrapidísimo',
  COORDINADORA: 'Coordinadora',
  TCC: 'TCC',
}

const SHIPMENT_STATUS_LABEL: Record<string, string> = {
  CREATED: 'Creado',
  PRINTED: 'Impreso',
  IN_TRANSIT: 'En tránsito',
  DELIVERED: 'Entregado',
  RETURNED: 'Devuelto',
}

// Variante + clases de color por estado (sin indigo/azul).
const SHIPMENT_STATUS_BADGE: Record<
  string,
  { className: string; dot: string }
> = {
  CREATED: {
    className:
      'border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-200',
    dot: 'bg-zinc-400',
  },
  PRINTED: {
    className:
      'border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
    dot: 'bg-violet-500',
  },
  IN_TRANSIT: {
    className:
      'border-teal-300 bg-teal-100 text-teal-700 dark:border-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
    dot: 'bg-teal-500',
  },
  DELIVERED: {
    className:
      'border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  RETURNED: {
    className:
      'border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    dot: 'bg-rose-500',
  },
}

function statusBadgeClass(status: string): string {
  return (
    SHIPMENT_STATUS_BADGE[status]?.className ??
    'border-border bg-muted text-muted-foreground'
  )
}

function statusDotClass(status: string): string {
  return SHIPMENT_STATUS_BADGE[status]?.dot ?? 'bg-muted-foreground'
}

interface Filters {
  status: string
  carrier: string
  search: string
}

const DEFAULT_FILTERS: Filters = {
  status: 'ALL',
  carrier: 'ALL',
  search: '',
}

// ------------------------------------------------------------
// Página principal
// ------------------------------------------------------------

export default function GuiasPage() {
  const { data: session } = useSession()
  const role = session?.user?.role ?? ''
  // ADMIN y BODEGA pueden forzar la cola de impresión.
  const canProcessQueue = canAccess(role, 'BODEGA')
  // ADMIN, BODEGA y SERVICIO pueden descargar el PDF de la guía.
  const canDownloadPdf = canAccess(role, 'BODEGA', 'SERVICIO')

  const qc = useQueryClient()
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Debounce 300ms del input de búsqueda.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(filters.search.trim())
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [filters.search])

  const statsQuery = useQuery<GuidesStats>({
    queryKey: ['guides-stats'],
    queryFn: async () => {
      const res = await fetch('/api/guides?stats=true')
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err?.error ?? `Error ${res.status}`)
      }
      return res.json() as Promise<GuidesStats>
    },
  })

  const listQueryKey = useMemo(
    () =>
      [
        'guides',
        filters.status,
        filters.carrier,
        debouncedSearch,
        page,
      ] as const,
    [filters.status, filters.carrier, debouncedSearch, page],
  )

  const listQuery = useQuery<ShipmentsResponse>({
    queryKey: listQueryKey,
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters.status && filters.status !== 'ALL')
        params.set('status', filters.status)
      if (filters.carrier && filters.carrier !== 'ALL')
        params.set('carrier', filters.carrier)
      if (debouncedSearch) params.set('search', debouncedSearch)
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(page * PAGE_SIZE))
      const res = await fetch(`/api/guides?${params.toString()}`)
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err?.error ?? `Error ${res.status}`)
      }
      return res.json() as Promise<ShipmentsResponse>
    },
    placeholderData: (prev) => prev,
  })

  const processQueueMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/print?process=true', { method: 'POST' })
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        processed?: number
        printed?: number
        failed?: number
      }
      if (!res.ok || !json.ok) {
        throw new Error(json?.error ?? `Error ${res.status}`)
      }
      return json
    },
    onSuccess: (data) => {
      const parts: string[] = []
      if (typeof data.processed === 'number')
        parts.push(`${data.processed} procesados`)
      if (typeof data.printed === 'number')
        parts.push(`${data.printed} impresos`)
      if (typeof data.failed === 'number' && data.failed > 0)
        parts.push(`${data.failed} fallidos`)
      toast.success(
        'Cola de impresión procesada' +
          (parts.length ? ` · ${parts.join(', ')}` : ''),
      )
      void qc.invalidateQueries({ queryKey: ['guides-stats'] })
      void qc.invalidateQueries({ queryKey: ['guides'] })
    },
    onError: (err: unknown) => {
      toast.error('No se pudo procesar la cola', {
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })

  const shipments = listQuery.data?.shipments ?? []
  const total = listQuery.data?.total ?? 0
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1
  const to = Math.min((page + 1) * PAGE_SIZE, total)
  const hasNext = to < total
  const hasPrev = page > 0

  const hasActiveFilters =
    filters.status !== 'ALL' ||
    filters.carrier !== 'ALL' ||
    filters.search.trim() !== ''

  function clearFilters() {
    setFilters(DEFAULT_FILTERS)
    setDebouncedSearch('')
    setPage(0)
  }

  function handleProcessQueue() {
    processQueueMutation.mutate()
  }

  function refreshAll() {
    void qc.invalidateQueries({ queryKey: ['guides-stats'] })
    void qc.invalidateQueries({ queryKey: ['guides'] })
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Route className="size-6 text-muted-foreground" aria-hidden />
            Guías
          </h1>
          <p className="text-sm text-muted-foreground">
            Gestiona los envíos, números de guía y seguimiento de
            transportadoras.
          </p>
        </div>
        {canProcessQueue && (
          <Button
            onClick={handleProcessQueue}
            disabled={processQueueMutation.isPending}
            className="gap-2"
            variant="default"
          >
            {processQueueMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Printer className="size-4" />
            )}
            Procesar cola de impresión
          </Button>
        )}
      </header>

      {/* KPI row */}
      <KpiSection
        stats={statsQuery.data}
        loading={statsQuery.isLoading}
      />

      {/* Filters bar */}
      <Card className="gap-0 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              type="search"
              placeholder="Buscar por guía, pedido o cliente…"
              value={filters.search}
              onChange={(e) =>
                setFilters((f) => ({ ...f, search: e.target.value }))
              }
              className="pl-9"
              aria-label="Buscar guías"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={filters.status}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, status: v }))
                setPage(0)
              }}
            >
              <SelectTrigger className="w-full sm:w-52" aria-label="Estado de la guía">
                <div className="flex items-center gap-2">
                  <Filter className="size-4 text-muted-foreground" />
                  <SelectValue placeholder="Estado" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.carrier}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, carrier: v }))
                setPage(0)
              }}
            >
              <SelectTrigger className="w-full sm:w-52" aria-label="Transportadora">
                <SelectValue placeholder="Transportadora" />
              </SelectTrigger>
              <SelectContent>
                {CARRIER_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
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
                  <TableHead className="pl-4">Guía</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="hidden md:table-cell">Ciudad</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Transportadora
                  </TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden sm:table-cell text-center">
                    Tracking
                  </TableHead>
                  <TableHead className="hidden md:table-cell">Fecha</TableHead>
                  <TableHead className="pr-4 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQuery.isLoading && shipments.length === 0
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={`sk-${i}`}>
                        <TableCell className="pl-4">
                          <Skeleton className="h-4 w-28" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-32" />
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <Skeleton className="h-5 w-24 rounded-full" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-24 rounded-full" />
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-center">
                          <Skeleton className="mx-auto h-5 w-8 rounded-full" />
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell className="pr-4 text-right">
                          <Skeleton className="ml-auto h-8 w-24" />
                        </TableCell>
                      </TableRow>
                    ))
                  : shipments.map((s) => (
                      <ShipmentRow
                        key={s.id}
                        shipment={s}
                        canDownloadPdf={canDownloadPdf}
                        onView={() => setSelectedId(s.id)}
                      />
                    ))}
              </TableBody>
            </Table>

            {!listQuery.isLoading && !listQuery.isError && shipments.length === 0 && (
              <EmptyState hasFilters={hasActiveFilters} onClear={clearFilters} />
            )}

            {listQuery.isError && (
              <div className="flex flex-col items-center gap-2 p-12 text-center text-sm">
                <Inbox className="size-8 text-muted-foreground" />
                <p className="font-medium">No se pudieron cargar las guías.</p>
                <p className="text-xs text-muted-foreground">
                  Revisa tu conexión o intenta de nuevo más tarde.
                </p>
                <Button variant="outline" size="sm" onClick={() => listQuery.refetch()}>
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

      {/* Detail drawer */}
      <GuideDetailSheet
        shipmentId={selectedId}
        canDownloadPdf={canDownloadPdf}
        onClose={() => setSelectedId(null)}
        onRefresh={refreshAll}
      />
    </div>
  )
}

// ------------------------------------------------------------
// KPI row
// ------------------------------------------------------------

function KpiSection({
  stats,
  loading,
}: {
  stats: GuidesStats | undefined
  loading: boolean
}) {
  return (
    <section
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      aria-label="Indicadores de guías"
    >
      <KPICard
        title="Total guías"
        value={loading ? '—' : String(stats?.total ?? 0)}
        icon={<FileText className="size-5" />}
        loading={loading}
      />
      <KPICard
        title="Impresas"
        value={loading ? '—' : String(stats?.printed ?? 0)}
        subtitle="Listas para despacho"
        icon={<Printer className="size-5" />}
        loading={loading}
      />
      <KPICard
        title="Pendientes impresión"
        value={loading ? '—' : String(stats?.pendingPrint ?? 0)}
        subtitle="En cola"
        icon={<Clock className="size-5" />}
        loading={loading}
      />
      <KPICard
        title="En tránsito"
        value={
          loading ? '—' : String(stats?.byStatus.IN_TRANSIT ?? 0)
        }
        subtitle="En camino al destino"
        icon={<Truck className="size-5" />}
        loading={loading}
      />
    </section>
  )
}

// ------------------------------------------------------------
// Fila de la tabla
// ------------------------------------------------------------

function ShipmentRow({
  shipment,
  canDownloadPdf,
  onView,
}: {
  shipment: ShipmentWithRelations
  canDownloadPdf: boolean
  onView: () => void
}) {
  const guideNumber = shipment.guideNumber ?? '—'
  const trackingCount = shipment.trackingEvents?.length ?? 0
  const pdfHref = `/api/guides/${shipment.guideNumber ?? shipment.id}/pdf`

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
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Hash className="size-4" />
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-sm font-medium">
              {guideNumber}
            </span>
            {canDownloadPdf && shipment.guideNumber && (
              <a
                href={pdfHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex w-fit items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-3" />
                PDF
              </a>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <a
          href={`/dashboard/pedidos`}
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-sm font-medium text-foreground hover:underline"
        >
          {shipment.order?.orderNumber ?? '—'}
        </a>
      </TableCell>
      <TableCell>
        <div className="text-sm font-medium">
          {shipment.order?.customer?.name ?? '—'}
        </div>
        {shipment.order?.customer?.email && (
          <div className="text-xs text-muted-foreground truncate max-w-[180px]">
            {shipment.order.customer.email}
          </div>
        )}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <span className="text-sm text-muted-foreground">
          {shipment.order?.city ?? '—'}
        </span>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <CarrierBadge carrier={shipment.carrier} />
      </TableCell>
      <TableCell>
        <ShipmentStatusBadge status={shipment.status} />
      </TableCell>
      <TableCell className="hidden sm:table-cell text-center">
        <Badge variant="outline" className="tabular-nums">
          {trackingCount}
        </Badge>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <span className="text-xs text-muted-foreground">
          {formatDate(shipment.createdAt)}
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
// Badges personalizados
// ------------------------------------------------------------

function ShipmentStatusBadge({
  status,
  size = 'default',
}: {
  status: string
  size?: 'sm' | 'default'
}) {
  const label =
    SHIPMENT_STATUS_LABEL[status] ?? status ?? 'Desconocido'
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5 border',
        statusBadgeClass(status),
        size === 'sm' && 'px-1.5 py-0 text-[10px]',
      )}
    >
      <span
        className={cn('size-1.5 rounded-full', statusDotClass(status))}
        aria-hidden
      />
      {label}
    </Badge>
  )
}

function CarrierBadge({ carrier }: { carrier: string | null }) {
  if (!carrier) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        —
      </Badge>
    )
  }
  const label = CARRIER_LABEL[carrier] ?? carrier
  return (
    <Badge
      variant="outline"
      className="border-border bg-muted/60 text-foreground"
    >
      <Building2 className="size-3 text-muted-foreground" />
      {label}
    </Badge>
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
        <p className="text-sm font-medium">No hay guías registradas</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {hasFilters
            ? 'Prueba con otros filtros o limpia la búsqueda.'
            : 'Cuando se despachen pedidos, sus guías aparecerán aquí.'}
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

// ------------------------------------------------------------
// Detail drawer (Sheet)
// ------------------------------------------------------------

function GuideDetailSheet({
  shipmentId,
  canDownloadPdf,
  onClose,
  onRefresh,
}: {
  shipmentId: string | null
  canDownloadPdf: boolean
  onClose: () => void
  onRefresh: () => void
}) {
  const qc = useQueryClient()
  const { data, isLoading, isError, refetch } = useQuery<ShipmentWithRelations>({
    queryKey: ['guide', shipmentId],
    queryFn: async () => {
      const res = await fetch(`/api/guides/${shipmentId ?? ''}`)
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err?.error ?? `Error ${res.status}`)
      }
      return res.json() as Promise<ShipmentWithRelations>
    },
    enabled: !!shipmentId,
  })

  function handleClose(open: boolean) {
    if (!open) {
      onClose()
      // Invalida para que la próxima apertura traiga data fresca.
      void qc.invalidateQueries({ queryKey: ['guide', shipmentId] })
      onRefresh()
    }
  }

  const shipment = data
  const pdfHref = shipment
    ? `/api/guides/${shipment.guideNumber ?? shipment.id}/pdf`
    : '#'

  return (
    <Sheet open={!!shipmentId} onOpenChange={handleClose}>
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 sm:max-w-lg md:max-w-xl"
      >
        <SheetHeader className="gap-2 border-b p-5 pr-12">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Route className="size-4 text-muted-foreground" />
            Detalle de la guía
          </SheetTitle>
          <SheetDescription className="sr-only">
            Información completa del envío, orden, items y tracking.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-5 p-5">
            {isLoading && <DetailSkeleton />}
            {isError && (
              <div className="flex flex-col items-center gap-2 p-8 text-center text-sm">
                <Inbox className="size-8 text-muted-foreground" />
                <p className="font-medium">No se pudo cargar la guía.</p>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  Reintentar
                </Button>
              </div>
            )}
            {shipment && !isLoading && !isError && (
              <>
                {/* Header del envío */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-lg font-semibold tracking-tight break-all">
                      {shipment.guideNumber ?? 'Sin guía'}
                    </span>
                    <ShipmentStatusBadge status={shipment.status} />
                    <CarrierBadge carrier={shipment.carrier} />
                  </div>
                  {canDownloadPdf && shipment.guideNumber && (
                    <Button asChild variant="default" size="sm" className="gap-1.5">
                      <a href={pdfHref} target="_blank" rel="noopener noreferrer">
                        <Download className="size-4" />
                        Descargar PDF
                      </a>
                    </Button>
                  )}
                </div>

                <Separator />

                {/* Información del pedido */}
                <section className="space-y-2">
                  <SectionTitle icon={Package}>Pedido</SectionTitle>
                  <div className="grid grid-cols-2 gap-2 rounded-lg border bg-card p-3 text-sm">
                    <InfoRow
                      label="Número"
                      icon={Hash}
                      value={
                        <a
                          href="/dashboard/pedidos"
                          className="font-mono font-medium text-foreground hover:underline"
                        >
                          {shipment.order?.orderNumber ?? '—'}
                        </a>
                      }
                    />
                    <InfoRow
                      label="Total"
                      icon={Receipt}
                      value={
                        <span className="font-semibold tabular-nums">
                          {formatCOP(shipment.order?.total ?? 0)}
                        </span>
                      }
                    />
                    <InfoRow
                      label="Ciudad"
                      icon={MapPin}
                      value={shipment.order?.city ?? '—'}
                    />
                    {shipment.order?.address && (
                      <InfoRow
                        label="Dirección"
                        icon={MapPin}
                        value={
                          <span className="max-w-[180px] truncate" title={shipment.order.address}>
                            {shipment.order.address}
                          </span>
                        }
                      />
                    )}
                  </div>
                </section>

                {/* Cliente */}
                <section className="space-y-2">
                  <SectionTitle icon={User}>Cliente</SectionTitle>
                  <div className="space-y-1 rounded-lg border bg-card p-3 text-sm">
                    <InfoRow
                      label="Nombre"
                      icon={User}
                      value={shipment.order?.customer?.name ?? '—'}
                    />
                    <InfoRow
                      label="Email"
                      icon={Mail}
                      value={
                        shipment.order?.customer?.email ? (
                          <a
                            href={`mailto:${shipment.order.customer.email}`}
                            className="text-foreground hover:underline"
                          >
                            {shipment.order.customer.email}
                          </a>
                        ) : (
                          '—'
                        )
                      }
                    />
                    <InfoRow
                      label="Teléfono"
                      icon={Phone}
                      value={
                        shipment.order?.customer?.phone ? (
                          <a
                            href={`tel:${shipment.order.customer.phone}`}
                            className="text-foreground hover:underline"
                          >
                            {shipment.order.customer.phone}
                          </a>
                        ) : (
                          '—'
                        )
                      }
                    />
                  </div>
                </section>

                {/* Items */}
                <section className="space-y-2">
                  <SectionTitle icon={Package}>Productos</SectionTitle>
                  <div className="overflow-hidden rounded-lg border">
                    <ul className="divide-y">
                      {shipment.order?.items?.length ? (
                        shipment.order.items.map((it) => (
                          <li
                            key={it.id}
                            className="flex items-center justify-between gap-3 bg-card p-3 text-sm"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">
                                {it.title}
                              </p>
                              {it.sku && (
                                <p className="text-xs text-muted-foreground font-mono">
                                  SKU: {it.sku}
                                </p>
                              )}
                            </div>
                            <Badge variant="secondary" className="tabular-nums">
                              x{it.quantity}
                            </Badge>
                          </li>
                        ))
                      ) : (
                        <li className="p-3 text-sm text-muted-foreground">
                          Sin productos.
                        </li>
                      )}
                    </ul>
                  </div>
                </section>

                {/* Tracking timeline */}
                <section className="space-y-2">
                  <SectionTitle icon={CircleDot}>
                    Seguimiento
                    {shipment.trackingEvents?.length > 0 && (
                      <Badge variant="outline" className="ml-1 tabular-nums">
                        {shipment.trackingEvents.length}
                      </Badge>
                    )}
                  </SectionTitle>
                  <TrackingTimeline events={shipment.trackingEvents ?? []} />
                </section>

                {/* Metadata */}
                <Separator />
                <section className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <CalendarClock className="size-3.5" />
                    Creada: {formatDate(shipment.createdAt)}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CalendarClock className="size-3.5" />
                    Actualizada: {formatDate(shipment.updatedAt)}
                  </div>
                </section>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
      <Skeleton className="h-9 w-40" />
      <Separator />
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
      <Skeleton className="h-24" />
      <Skeleton className="h-32" />
    </div>
  )
}

// ------------------------------------------------------------
// Tracking timeline (vertical, most-recent first)
// ------------------------------------------------------------

function TrackingTimeline({ events }: { events: TrackingEvent[] }) {
  if (!events || events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
        Aún no hay eventos de seguimiento registrados.
      </div>
    )
  }

  // Most recent first.
  const ordered = [...events].sort(
    (a, b) =>
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  )

  return (
    <ol className="space-y-0">
      {ordered.map((ev, i) => {
        const isLast = i === ordered.length - 1
        return (
          <li key={ev.id} className="relative pb-5 pl-6 last:pb-0">
            {/* Dot */}
            <span
              className={cn(
                'absolute top-1.5 left-0 size-3 rounded-full ring-2 ring-background',
                statusDotClass(ev.status),
              )}
              aria-hidden
            />
            {/* Vertical connector (only if not the last item) */}
            {!isLast && (
              <span
                className="absolute top-5 left-[5px] h-full w-px bg-border"
                aria-hidden
              />
            )}
            {/* Content */}
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <ShipmentStatusBadge status={ev.status} size="sm" />
                {ev.city && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3" />
                    {ev.city}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarClock className="size-3" />
                  {formatDate(ev.occurredAt)}
                </span>
              </div>
              {ev.message && (
                <p className="text-sm text-foreground">{ev.message}</p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ------------------------------------------------------------
// Sub-componentes auxiliares del drawer
// ------------------------------------------------------------

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
      <Icon className="size-4 text-muted-foreground" />
      {children}
    </h3>
  )
}

function InfoRow({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon && <Icon className="size-3.5" />}
        {label}
      </span>
      <span className="text-right text-xs font-medium text-foreground">
        {value ?? '—'}
      </span>
    </div>
  )
}
