'use client'

// ============================================================
// /dashboard/alertas — Alerts center page
// ============================================================
// Client component. KPIs, filtros (search/type/severity), switch
// de auto-refresh (10s), tarjetas con ícono de severidad y botón
// "Resolver".
//
// Endpoints consumidos:
//   GET  /api/alerts?stats=true
//   GET  /api/alerts?search=&type=&severity=&limit=&offset=
//   POST /api/alerts/[id]/resolve

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Bell,
  AlertOctagon,
  AlertTriangle,
  Info,
  CheckCircle2,
  Search,
  Filter,
  X,
  Loader2,
  Inbox,
  RefreshCw,
  Check,
  Clock,
  ShieldAlert,
} from 'lucide-react'

import { KPICard } from '@/components/shared/kpi-card'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn, formatDate } from '@/lib/format'

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

interface Alert {
  id: string
  type: string // COD_UNPAID | GUIDE_ERROR | HIGH_RETURN | LOW_INVENTORY | SALES_DROP
  severity: string // INFO | WARNING | CRITICAL
  entity: string | null
  message: string
  resolved: boolean
  resolvedAt: string | null
  createdAt: string
}

interface AlertListResponse {
  alerts: Alert[]
  total: number
  stats: AlertStats
  filters: unknown
}

interface AlertStats {
  total: number
  active: number
  resolved: number
  byType: Record<string, number>
  bySeverity: Record<string, number>
  critical: number
}

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------

const PAGE_SIZE = 20

const TYPE_OPTIONS = [
  { value: 'ALL', label: 'Todos los tipos' },
  { value: 'COD_UNPAID', label: 'COD sin pagar' },
  { value: 'GUIDE_ERROR', label: 'Error de guía' },
  { value: 'HIGH_RETURN', label: 'Devolución alta' },
  { value: 'LOW_INVENTORY', label: 'Inventario bajo' },
  { value: 'SALES_DROP', label: 'Caída de ventas' },
] as const

const SEVERITY_OPTIONS = [
  { value: 'ALL', label: 'Toda severidad' },
  { value: 'INFO', label: 'Info' },
  { value: 'WARNING', label: 'Advertencia' },
  { value: 'CRITICAL', label: 'Crítica' },
] as const

const TYPE_LABELS: Record<string, string> = {
  COD_UNPAID: 'COD sin pagar',
  GUIDE_ERROR: 'Error de guía',
  HIGH_RETURN: 'Devolución alta',
  LOW_INVENTORY: 'Inventario bajo',
  SALES_DROP: 'Caída de ventas',
}

const TYPE_BADGE: Record<string, string> = {
  COD_UNPAID:
    'border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  GUIDE_ERROR:
    'border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  HIGH_RETURN:
    'border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  LOW_INVENTORY:
    'border-teal-300 bg-teal-100 text-teal-700 dark:border-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  SALES_DROP:
    'border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-200',
}

function typeBadgeClass(t: string): string {
  return TYPE_BADGE[t] ?? 'border-border bg-muted text-muted-foreground'
}

const SEVERITY_CONFIG: Record<string, {
  icon: React.ReactNode
  border: string
  badge: string
}> = {
  CRITICAL: {
    icon: <AlertOctagon className="size-5 text-rose-500" />,
    border: 'border-l-rose-500',
    badge: 'border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  },
  WARNING: {
    icon: <AlertTriangle className="size-5 text-amber-500" />,
    border: 'border-l-amber-500',
    badge: 'border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  },
  INFO: {
    icon: <Info className="size-5 text-teal-500" />,
    border: 'border-l-teal-500',
    badge: 'border-teal-300 bg-teal-100 text-teal-700 dark:border-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  },
}

function severityConfig(s: string) {
  return SEVERITY_CONFIG[s] ?? SEVERITY_CONFIG.INFO
}

interface Filters {
  search: string
  type: string
  severity: string
}

const DEFAULT_FILTERS: Filters = {
  search: '',
  type: 'ALL',
  severity: 'ALL',
}

const AUTO_REFRESH_MS = 10_000

// ------------------------------------------------------------
// Page
// ------------------------------------------------------------

export default function AlertasPage() {
  const qc = useQueryClient()
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(false)

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(filters.search.trim())
    }, 300)
    return () => clearTimeout(t)
  }, [filters.search])

  // The /api/alerts endpoint returns { alerts, total, stats } in a
  // single combined response (no separate stats endpoint). The list
  // returns ALL alerts (active + resolved) ordered by resolved asc,
  // createdAt desc.
  const listQueryKey = useMemo(
    () =>
      ['alerts', debouncedSearch, filters.type, filters.severity, autoRefresh] as const,
    [debouncedSearch, filters.type, filters.severity, autoRefresh],
  )

  const listQuery = useQuery<AlertListResponse>({
    queryKey: listQueryKey,
    queryFn: async () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (filters.type !== 'ALL') params.set('type', filters.type)
      if (filters.severity !== 'ALL') params.set('severity', filters.severity)
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', '0')
      const res = await fetch(`/api/alerts?${params.toString()}`)
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err?.error ?? `Error ${res.status}`)
      }
      return res.json() as Promise<AlertListResponse>
    },
    placeholderData: (prev) => prev,
    refetchInterval: autoRefresh ? AUTO_REFRESH_MS : false,
  })

  // Stats come from the same list response; we don't need a separate query.
  const stats: AlertStats | undefined = listQuery.data?.stats

  // Resolve mutation
  const resolveMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const res = await fetch(`/api/alerts/${alertId}/resolve`, { method: 'POST' })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) {
        throw new Error(json?.error ?? `Error ${res.status}`)
      }
      return json
    },
    onSuccess: () => {
      toast.success('Alerta resuelta')
      void qc.invalidateQueries({ queryKey: ['alerts'] })
    },
    onError: (err: unknown) => {
      toast.error('No se pudo resolver la alerta', {
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })

  const alerts = listQuery.data?.alerts ?? []
  const total = listQuery.data?.total ?? 0

  const hasActiveFilters =
    filters.type !== 'ALL' ||
    filters.severity !== 'ALL' ||
    filters.search.trim() !== ''

  function clearFilters() {
    setFilters(DEFAULT_FILTERS)
    setDebouncedSearch('')
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Bell className="size-6 text-muted-foreground" aria-hidden />
            Alertas
          </h1>
          <p className="text-sm text-muted-foreground">
            Centro de alertas operativas · monitorea y resuelve eventos críticos.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <RefreshCw
            className={cn(
              'size-4 text-muted-foreground',
              autoRefresh && 'animate-spin [animation-duration:3s]',
            )}
          />
          <span className="text-xs text-muted-foreground">Auto-actualizar</span>
          <Switch
            checked={autoRefresh}
            onCheckedChange={setAutoRefresh}
            aria-label="Auto-actualizar cada 10 segundos"
          />
        </div>
      </header>

      {/* KPIs */}
      <section
        aria-label="KPIs de alertas"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <KPICard
          title="Total"
          value={String(stats?.total ?? 0)}
          subtitle="Histórico"
          icon={<Bell className="size-5" />}
          loading={listQuery.isLoading}
        />
        <KPICard
          title="Activas"
          value={String(stats?.active ?? 0)}
          subtitle="Sin resolver"
          icon={<AlertTriangle className="size-5" />}
          loading={listQuery.isLoading}
        />
        <KPICard
          title="Críticas"
          value={String(stats?.critical ?? 0)}
          subtitle="Severidad crítica"
          icon={<ShieldAlert className="size-5" />}
          loading={listQuery.isLoading}
        />
        <KPICard
          title="Resueltas"
          value={String(stats?.resolved ?? 0)}
          subtitle="Atendidas"
          icon={<CheckCircle2 className="size-5" />}
          loading={listQuery.isLoading}
        />
      </section>

      {/* Filters */}
      <Card className="gap-0 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              type="search"
              placeholder="Buscar en el mensaje de la alerta…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="pl-9"
              aria-label="Buscar alertas"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={filters.type}
              onValueChange={(v) => setFilters((f) => ({ ...f, type: v }))}
            >
              <SelectTrigger className="w-full sm:w-52" aria-label="Tipo">
                <div className="flex items-center gap-2">
                  <Filter className="size-4 text-muted-foreground" />
                  <SelectValue placeholder="Tipo" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.severity}
              onValueChange={(v) => setFilters((f) => ({ ...f, severity: v }))}
            >
              <SelectTrigger className="w-full sm:w-44" aria-label="Severidad">
                <SelectValue placeholder="Severidad" />
              </SelectTrigger>
              <SelectContent>
                {SEVERITY_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5">
                <X className="size-4" />
                Limpiar
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Alerts list */}
      <Card className="gap-0 p-0">
        <CardHeader className="border-b p-4">
          <CardTitle className="text-base">
            Alertas ({total})
          </CardTitle>
          <CardDescription>
            {autoRefresh ? 'Auto-actualizando cada 10s' : 'Refresca manualmente'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {listQuery.isLoading && alerts.length === 0 ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : listQuery.isError ? (
            <div className="flex flex-col items-center gap-2 p-12 text-center text-sm">
              <Inbox className="size-8 text-muted-foreground" />
              <p className="font-medium">No se pudieron cargar las alertas.</p>
              <Button variant="outline" size="sm" onClick={() => listQuery.refetch()}>
                Reintentar
              </Button>
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle2 className="size-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium">No hay alertas activas</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {hasActiveFilters
                    ? 'Prueba con otros filtros.'
                    : 'Todo en orden por ahora.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="max-h-[640px] overflow-y-auto divide-y divide-border [scrollbar-width:thin]">
              {alerts.map((a) => (
                <AlertCard
                  key={a.id}
                  alert={a}
                  onResolve={() => resolveMutation.mutate(a.id)}
                  resolving={
                    resolveMutation.isPending &&
                    resolveMutation.variables === a.id
                  }
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ------------------------------------------------------------
// Alert card
// ------------------------------------------------------------

function AlertCard({
  alert,
  onResolve,
  resolving,
}: {
  alert: Alert
  onResolve: () => void
  resolving: boolean
}) {
  const sev = severityConfig(alert.severity)

  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-l-4 p-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-start sm:justify-between',
        sev.border,
        alert.resolved && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div className="mt-0.5 shrink-0">{sev.icon}</div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn('border', typeBadgeClass(alert.type))}>
              {TYPE_LABELS[alert.type] ?? alert.type}
            </Badge>
            <Badge variant="outline" className={cn('border', sev.badge)}>
              {alert.severity}
            </Badge>
            {alert.resolved && (
              <Badge
                variant="outline"
                className="border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
              >
                <Check className="size-3" />
                Resuelta
              </Badge>
            )}
          </div>
          <p className="text-sm font-medium text-foreground leading-snug">
            {alert.message}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3" />
            <span>{formatDate(alert.createdAt)}</span>
            {alert.entity && (
              <>
                <span className="mx-1">·</span>
                <span className="font-mono">{alert.entity}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="shrink-0 sm:ml-3">
        {!alert.resolved && (
          <Button
            variant="outline"
            size="sm"
            onClick={onResolve}
            disabled={resolving}
            className="gap-1.5"
          >
            {resolving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Resolver
          </Button>
        )}
      </div>
    </div>
  )
}
