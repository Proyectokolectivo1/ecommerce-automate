'use client'

// ============================================================
// /dashboard/auditoria — Audit logs page
// ============================================================
// Client component. KPIs, 2 gráficos de barras (acciones y
// entidades), filtros (search/action/entity/date) y tabla con
// detalle expandible.
//
// Endpoints consumidos:
//   GET /api/audit?stats=true
//   GET /api/audit?search=&action=&entity=&startDate=&endDate=&limit=&offset=

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn, formatDate } from '@/lib/format'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { KPICard } from '@/components/shared/kpi-card'
import {
  ScrollText,
  Calendar,
  CalendarDays,
  Clock,
  History,
  User,
  ChevronDown,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Inbox,
  Filter,
  Activity,
  X,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from 'recharts'

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

interface AuditLog {
  id: string
  userId: string | null
  userName: string | null
  userEmail: string | null
  action: string
  entity: string
  entityId: string | null
  ip: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

interface AuditListResponse {
  logs: AuditLog[]
  total: number
}

interface AuditStats {
  total: number
  recent24h: number
  recent7d: number
  byAction: Array<{ action: string; count: number }>
  byEntity: Array<{ entity: string; count: number }>
  topUsers: Array<{ userId: string; userName: string; count: number }>
}

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------

const PAGE_SIZE = 20

const ACTION_OPTIONS = [
  { value: 'ALL', label: 'Todas las acciones' },
  { value: 'CREATE', label: 'Crear' },
  { value: 'UPDATE', label: 'Actualizar' },
  { value: 'DELETE', label: 'Eliminar' },
  { value: 'LOGIN', label: 'Inicio de sesión' },
  { value: 'LOGOUT', label: 'Cierre de sesión' },
  { value: 'TRANSITION', label: 'Transición de estado' },
  { value: 'EXPORT', label: 'Exportación' },
  { value: 'PRINT', label: 'Impresión' },
] as const

const ENTITY_OPTIONS = [
  { value: 'ALL', label: 'Todas las entidades' },
  { value: 'ORDER', label: 'Pedidos' },
  { value: 'CUSTOMER', label: 'Clientes' },
  { value: 'PRODUCT', label: 'Productos' },
  { value: 'USER', label: 'Usuarios' },
  { value: 'SHIPMENT', label: 'Envíos' },
  { value: 'PRINT_JOB', label: 'Trabajos de impresión' },
  { value: 'INTEGRATION', label: 'Integraciones' },
  { value: 'ALERT', label: 'Alertas' },
] as const

const ACTION_BADGE: Record<string, string> = {
  CREATE: 'border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  UPDATE: 'border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  DELETE: 'border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  LOGIN: 'border-teal-300 bg-teal-100 text-teal-700 dark:border-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  LOGOUT: 'border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-200',
  TRANSITION: 'border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  EXPORT: 'border-teal-300 bg-teal-100 text-teal-700 dark:border-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  PRINT: 'border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
}

function actionBadgeClass(a: string): string {
  return ACTION_BADGE[a] ?? 'border-border bg-muted text-muted-foreground'
}

interface Filters {
  search: string
  action: string
  entity: string
  startDate: string
  endDate: string
}

const DEFAULT_FILTERS: Filters = {
  search: '',
  action: 'ALL',
  entity: 'ALL',
  startDate: '',
  endDate: '',
}

// ------------------------------------------------------------
// Page
// ------------------------------------------------------------

export default function AuditoriaPage() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(filters.search.trim())
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [filters.search])

  // The /api/audit endpoint returns { logs, total, stats } when stats=true
  // is set (combined response). We use a single query and extract both.
  const combinedQuery = useQuery<AuditListResponse & { stats?: AuditStats }>({
    queryKey: [
      'audit',
      debouncedSearch,
      filters.action,
      filters.entity,
      filters.startDate,
      filters.endDate,
      page,
    ],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('stats', 'true')
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (filters.action !== 'ALL') params.set('action', filters.action)
      if (filters.entity !== 'ALL') params.set('entity', filters.entity)
      if (filters.startDate) params.set('startDate', filters.startDate)
      if (filters.endDate) params.set('endDate', filters.endDate)
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(page * PAGE_SIZE))
      const res = await fetch(`/api/audit?${params.toString()}`)
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err?.error ?? `Error ${res.status}`)
      }
      return res.json() as Promise<AuditListResponse & { stats?: AuditStats }>
    },
    placeholderData: (prev) => prev,
  })

  const stats = combinedQuery.data?.stats

  const logs = combinedQuery.data?.logs ?? []
  const total = combinedQuery.data?.total ?? 0
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1
  const to = Math.min((page + 1) * PAGE_SIZE, total)
  const hasNext = to < total
  const hasPrev = page > 0

  const hasActiveFilters =
    filters.action !== 'ALL' ||
    filters.entity !== 'ALL' ||
    filters.search.trim() !== '' ||
    filters.startDate !== '' ||
    filters.endDate !== ''

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
            <ScrollText className="size-6 text-muted-foreground" aria-hidden />
            Auditoría
          </h1>
          <p className="text-sm text-muted-foreground">
            Registro completo de eventos y acciones del sistema.
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {formatNumber(stats?.total ?? 0)} eventos
        </Badge>
      </header>

      {/* KPIs */}
      <section
        aria-label="KPIs de auditoría"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <KPICard
          title="Total eventos"
          value={formatNumber(stats?.total ?? 0)}
          subtitle="Histórico"
          icon={<ScrollText className="size-5" />}
          loading={combinedQuery.isLoading}
        />
        <KPICard
          title="Últimas 24h"
          value={formatNumber(stats?.recent24h ?? 0)}
          subtitle="Eventos recientes"
          icon={<Activity className="size-5" />}
          loading={combinedQuery.isLoading}
        />
        <KPICard
          title="Últimos 7 días"
          value={formatNumber(stats?.recent7d ?? 0)}
          subtitle="Esta semana"
          icon={<History className="size-5" />}
          loading={combinedQuery.isLoading}
        />
        <KPICard
          title="Top usuarios"
          value={String(stats?.topUsers?.length ?? 0)}
          subtitle="Con más actividad"
          icon={<CalendarDays className="size-5" />}
          loading={combinedQuery.isLoading}
        />
      </section>

      {/* Charts */}
      <section
        aria-label="Gráficos de auditoría"
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Acciones frecuentes</CardTitle>
            <CardDescription>Top 8 acciones registradas</CardDescription>
          </CardHeader>
          <CardContent>
            <AuditBarChart
              data={(stats?.byAction ?? []).map((a) => ({ name: a.action, count: a.count }))}
              color="var(--chart-3)"
              loading={combinedQuery.isLoading}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Entidades auditadas</CardTitle>
            <CardDescription>Top 8 entidades modificadas</CardDescription>
          </CardHeader>
          <CardContent>
            <AuditBarChart
              data={(stats?.byEntity ?? []).map((e) => ({ name: e.entity, count: e.count }))}
              color="var(--chart-1)"
              loading={combinedQuery.isLoading}
            />
          </CardContent>
        </Card>
      </section>

      {/* Filters */}
      <Card className="gap-0 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              type="search"
              placeholder="Buscar por usuario, IP o detalle…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="pl-9"
              aria-label="Buscar auditoría"
            />
          </div>
          <Select
            value={filters.action}
            onValueChange={(v) => {
              setFilters((f) => ({ ...f, action: v }))
              setPage(0)
            }}
          >
            <SelectTrigger className="w-full sm:w-44" aria-label="Acción">
              <div className="flex items-center gap-2">
                <Filter className="size-4 text-muted-foreground" />
                <SelectValue placeholder="Acción" />
              </div>
            </SelectTrigger>
            <SelectContent>
              {ACTION_OPTIONS.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.entity}
            onValueChange={(v) => {
              setFilters((f) => ({ ...f, entity: v }))
              setPage(0)
            }}
          >
            <SelectTrigger className="w-full sm:w-44" aria-label="Entidad">
              <SelectValue placeholder="Entidad" />
            </SelectTrigger>
            <SelectContent>
              {ENTITY_OPTIONS.map((e) => (
                <SelectItem key={e.value} value={e.value}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={filters.startDate}
            onChange={(e) => {
              setFilters((f) => ({ ...f, startDate: e.target.value }))
              setPage(0)
            }}
            aria-label="Fecha desde"
            className="w-full sm:w-40"
          />
          <Input
            type="date"
            value={filters.endDate}
            onChange={(e) => {
              setFilters((f) => ({ ...f, endDate: e.target.value }))
              setPage(0)
            }}
            aria-label="Fecha hasta"
            className="w-full sm:w-40"
          />
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5">
              <X className="size-4" />
              Limpiar
            </Button>
          )}
        </div>
      </Card>

      {/* Table */}
      <Card className="gap-0 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <div className="max-h-[640px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Fecha</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead className="hidden md:table-cell">Entidad</TableHead>
                  <TableHead className="hidden lg:table-cell">Usuario</TableHead>
                  <TableHead className="pr-4">Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {combinedQuery.isLoading && logs.length === 0
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={`sk-${i}`}>
                        <TableCell className="pl-4"><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
                        <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell className="pr-4"><Skeleton className="h-4 w-32" /></TableCell>
                      </TableRow>
                    ))
                  : logs.map((l) => (
                      <AuditRow key={l.id} log={l} />
                    ))}
              </TableBody>
            </Table>

            {!combinedQuery.isLoading && !combinedQuery.isError && logs.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                  <Inbox className="size-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">Sin eventos para mostrar</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {hasActiveFilters
                      ? 'Prueba con otros filtros.'
                      : 'No se han registrado eventos aún.'}
                  </p>
                </div>
              </div>
            )}

            {combinedQuery.isError && (
              <div className="flex flex-col items-center gap-2 p-12 text-center text-sm">
                <Inbox className="size-8 text-muted-foreground" />
                <p className="font-medium">No se pudieron cargar los eventos.</p>
                <Button variant="outline" size="sm" onClick={() => combinedQuery.refetch()}>
                  Reintentar
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Pagination */}
        <div className="flex flex-col items-center justify-between gap-3 border-t bg-card p-3 sm:flex-row">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {combinedQuery.isFetching && (
              <Loader2 className="size-3 animate-spin" aria-hidden />
            )}
            <span>
              {total === 0
                ? 'Sin resultados'
                : `Mostrando ${from}–${to} de ${formatNumber(total)}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={!hasPrev || combinedQuery.isFetching}
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
              disabled={!hasNext || combinedQuery.isFetching}
              className="gap-1"
            >
              Siguiente
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ------------------------------------------------------------
// Bar chart
// ------------------------------------------------------------

interface ChartDatum {
  name: string
  count: number
}

function AuditBarChart({
  data,
  color,
  loading,
}: {
  data: ChartDatum[]
  color: string
  loading: boolean
}) {
  const chartData = data.slice(0, 8)

  if (loading) {
    return <Skeleton className="h-[260px] w-full" />
  }

  if (chartData.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
        Sin datos para mostrar.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="name"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          tickFormatter={(v: string) => (v.length > 12 ? `${v.slice(0, 11)}…` : v)}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          allowDecimals={false}
          width={36}
        />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
          content={({ active, payload, label }) => {
            if (!active || !payload || payload.length === 0) return null
            return (
              <div className="rounded-md border border-border bg-popover p-3 text-xs shadow-md">
                <p className="mb-1 font-medium text-popover-foreground">{label}</p>
                <p className="text-muted-foreground">
                  Eventos:{' '}
                  <span className="font-semibold text-foreground">
                    {formatNumber((payload[0].value as number) ?? 0)}
                  </span>
                </p>
              </div>
            )
          }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={36}>
          {chartData.map((_, i) => (
            <Cell key={i} fill={color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ------------------------------------------------------------
// Row (collapsible detail)
// ------------------------------------------------------------

function AuditRow({ log }: { log: AuditLog }) {
  const [open, setOpen] = useState(false)

  let detail: string = ''
  if (log.metadata) {
    try {
      detail =
        typeof log.metadata === 'string'
          ? (log.metadata as string)
          : JSON.stringify(log.metadata, null, 2)
    } catch {
      detail = String(log.metadata)
    }
  }

  return (
    <>
      <TableRow
        className="cursor-pointer"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((o) => !o)
          }
        }}
      >
        <TableCell className="pl-4">
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatDate(log.createdAt)}
          </span>
        </TableCell>
        <TableCell>
          <Badge variant="outline" className={cn('border', actionBadgeClass(log.action))}>
            {log.action}
          </Badge>
        </TableCell>
        <TableCell className="hidden md:table-cell">
          <span className="text-sm font-medium">{log.entity}</span>
          {log.entityId && (
            <span className="ml-2 text-[11px] font-mono text-muted-foreground">
              #{log.entityId.slice(-6)}
            </span>
          )}
        </TableCell>
        <TableCell className="hidden lg:table-cell">
          {log.userName ? (
            <div className="flex items-center gap-1.5 text-sm">
              <User className="size-3 text-muted-foreground" />
              <span>{log.userName}</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">system</span>
          )}
        </TableCell>
        <TableCell className="pr-4">
          <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
            {detail ? (
              <>
                <span className="hidden sm:inline truncate max-w-[180px]">
                  {detail.split('\n')[0]}
                </span>
                <ChevronDown
                  className={cn(
                    'size-4 shrink-0 transition-transform',
                    open && 'rotate-180',
                  )}
                />
              </>
            ) : (
              <span className="text-muted-foreground/60">—</span>
            )}
          </div>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="bg-muted/30 hover:bg-transparent">
          <TableCell colSpan={5} className="p-4">
            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <DetailField label="Usuario" value={log.userName ?? 'system'} />
                <DetailField label="Email" value={log.userEmail ?? '—'} />
                <DetailField label="IP" value={log.ip ?? '—'} />
                <DetailField label="Entidad" value={log.entity} />
                <DetailField label="ID Entidad" value={log.entityId ?? '—'} />
                <DetailField label="Acción" value={log.action} />
              </div>
              {detail && (
                <div className="space-y-1">
                  <p className="font-semibold text-foreground">Metadata</p>
                  <pre className="overflow-x-auto rounded-md border border-border bg-card p-3 text-[11px] font-mono leading-relaxed">
                    {detail}
                  </pre>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-xs font-medium text-foreground truncate">{value}</p>
    </div>
  )
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function formatNumber(n: number): string {
  return n.toLocaleString('es-CO')
}
