'use client'

// ============================================================
// /dashboard/impresion — Print queue management page
// ============================================================
// Página de gestión de la cola de impresión de guías. Client
// component que:
//   1) Lista los PrintJobs con filtros (búsqueda + estado) y
//      paginación, todo vía React Query.
//   2) Muestra 5 KPIs (total / en cola / enviadas / impresas /
//      fallidas) usando el componente KPICard.
//   3) Acciones ADMIN/BODEGA: "Procesar cola ahora" y "Reintentar
//      fallidos".
//   4) Toggle "Auto-actualizar" que refresca cada 5s con
//      refetchInterval; al detectar un job que pasó a PRINTED
//      muestra un toast.
//   5) Tabla con badges de estado (amber/teal/emerald/rose),
//      enlace al PDF, acciones por fila (reintentar / ver PDF).
//
// Endpoints consumidos:
//   GET  /api/print?status=&search=&limit=&offset=
//   GET  /api/print?stats=true
//   POST /api/print?process=true
//   POST /api/print/[id]/retry
//   GET  /api/guides/[guideNumber]/pdf  (descarga PDF)

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  FileText,
  Clock,
  Send,
  Printer,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Loader2,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Inbox,
  RotateCcw,
  Eye,
} from 'lucide-react'

import { KPICard } from '@/components/shared/kpi-card'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/format'
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

// ------------------------------------------------------------
// Types (mirror del backend PrintJobWithRelations + Stats)
// ------------------------------------------------------------

interface PrintJobCustomer {
  id: string
  name: string | null
  email: string | null
  phone: string | null
}

interface PrintJobOrder {
  id: string
  orderNumber: string
  status: string
  customer: PrintJobCustomer
}

interface PrintJobWithRelations {
  id: string
  orderId: string
  guideNumber: string | null
  status: string
  printer: string | null
  attempts: number
  error: string | null
  queuedAt: string
  sentAt: string | null
  printedAt: string | null
  order: PrintJobOrder
}

interface PrintJobListResponse {
  jobs: PrintJobWithRelations[]
  total: number
}

interface PrintStats {
  total: number
  queued: number
  sent: number
  printed: number
  failed: number
}

interface ProcessResponse {
  ok: boolean
  processed: number
  failed: number
}

interface RetryResponse {
  ok: boolean
  printJobId: string
  status: string
}

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------

const PAGE_SIZE = 15
const AUTO_REFRESH_MS = 5000

type PrintStatus = 'QUEUED' | 'SENT' | 'PRINTED' | 'FAILED'

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'Todos los estados' },
  { value: 'QUEUED', label: 'En cola' },
  { value: 'SENT', label: 'Enviadas' },
  { value: 'PRINTED', label: 'Impresas' },
  { value: 'FAILED', label: 'Fallidas' },
]

const STATUS_LABELS: Record<PrintStatus, string> = {
  QUEUED: 'En cola',
  SENT: 'Enviada',
  PRINTED: 'Impresa',
  FAILED: 'Fallida',
}

const STATUS_BADGE_CLASS: Record<PrintStatus, string> = {
  QUEUED:
    'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  SENT: 'border-teal-300 bg-teal-100 text-teal-800 dark:border-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  PRINTED:
    'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  FAILED:
    'border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function relativeTime(date: string | null): string {
  if (!date) return '—'
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true, locale: es })
  } catch {
    return '—'
  }
}

function isPrintStatus(s: string): s is PrintStatus {
  return s === 'QUEUED' || s === 'SENT' || s === 'PRINTED' || s === 'FAILED'
}

function guidePdfUrl(guideNumber: string): string {
  return `/api/guides/${encodeURIComponent(guideNumber)}/pdf`
}

// ============================================================
// Page
// ============================================================

export default function ImpresionPage() {
  const { data: session, status: sessionStatus } = useSession()
  const qc = useQueryClient()

  // Permisos: ADMIN y BODEGA pueden operar; el resto solo lectura.
  const role = session?.user?.role
  const canManage = role === 'ADMIN' || role === 'BODEGA'

  // ----------------------------------------------------------
  // Filtros / paginación / auto-refresh
  // ----------------------------------------------------------
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [page, setPage] = useState(0)
  const [autoRefresh, setAutoRefresh] = useState(false)

  // Track de guías impresas para detectar transiciones.
  const printedRef = useRef<Set<string>>(new Set())

  // Debounce 300ms del input de búsqueda.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const listQueryKey = useMemo(
    () => ['print-jobs', statusFilter, debouncedSearch, page] as const,
    [statusFilter, debouncedSearch, page],
  )

  // ----------------------------------------------------------
  // Query: lista de PrintJobs
  // ----------------------------------------------------------
  const {
    data: listData,
    isLoading: listLoading,
    isFetching: listFetching,
    isError: listError,
  } = useQuery<PrintJobListResponse>({
    queryKey: listQueryKey,
    queryFn: async () => {
      const params = new URLSearchParams()
      if (statusFilter && statusFilter !== 'ALL')
        params.set('status', statusFilter)
      if (debouncedSearch) params.set('search', debouncedSearch)
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(page * PAGE_SIZE))
      const res = await fetch(`/api/print?${params.toString()}`)
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err?.error ?? `Error ${res.status}`)
      }
      return res.json() as Promise<PrintJobListResponse>
    },
    placeholderData: (prev) => prev,
    refetchInterval: autoRefresh ? AUTO_REFRESH_MS : false,
  })

  const jobs = listData?.jobs ?? []
  const total = listData?.total ?? 0
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1
  const to = Math.min((page + 1) * PAGE_SIZE, total)
  const hasNext = to < total
  const hasPrev = page > 0

  // ----------------------------------------------------------
  // Query: stats (KPIs)
  // ----------------------------------------------------------
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
  } = useQuery<PrintStats>({
    queryKey: ['print-stats'],
    queryFn: async () => {
      const res = await fetch('/api/print?stats=true')
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err?.error ?? `Error ${res.status}`)
      }
      return res.json() as Promise<PrintStats>
    },
    refetchInterval: autoRefresh ? AUTO_REFRESH_MS : false,
  })

  const s: PrintStats = stats ?? {
    total: 0,
    queued: 0,
    sent: 0,
    printed: 0,
    failed: 0,
  }

  // ----------------------------------------------------------
  // Detectar transiciones a PRINTED (solo cuando autoRefresh).
  // ----------------------------------------------------------
  useEffect(() => {
    if (!autoRefresh) {
      // Reset al desactivar auto-refresh.
      printedRef.current = new Set()
      return
    }
    const newlyPrinted: string[] = []
    for (const job of jobs) {
      if (job.status === 'PRINTED' && job.guideNumber) {
        if (!printedRef.current.has(job.id)) {
          printedRef.current.add(job.id)
          // Solo toast si ya teníamos un snapshot previo (job existía
          // antes en otra lista) — evita spam al cargar la 1ra vez.
          // Heurística: si printedAt es reciente (< 30s), sí toast.
          if (job.printedAt) {
            const ageMs = Date.now() - new Date(job.printedAt).getTime()
            if (ageMs < 30_000) {
              newlyPrinted.push(job.guideNumber)
            }
          }
        }
      } else {
        // Ya no está impresa (reintentaron) → eliminamos del set.
        printedRef.current.delete(job.id)
      }
    }
    for (const gn of newlyPrinted) {
      toast.success(`Guía ${gn} impresa`, {
        description: 'La guía fue procesada correctamente por la impresora.',
      })
    }
  }, [jobs, autoRefresh])

  // ----------------------------------------------------------
  // Mutation: procesar cola ahora
  // ----------------------------------------------------------
  const processMutation = useMutation<ProcessResponse, Error, void>({
    mutationFn: async () => {
      const res = await fetch('/api/print?process=true', { method: 'POST' })
      const json = (await res.json().catch(() => ({}))) as Partial<ProcessResponse> & {
        error?: string
      }
      if (!res.ok || !json.ok) {
        throw new Error(json?.error ?? `Error ${res.status}`)
      }
      return json as ProcessResponse
    },
    onSuccess: (data) => {
      toast.success('Cola procesada', {
        description: `${data.processed} procesadas · ${data.failed} fallidas`,
      })
      void qc.invalidateQueries({ queryKey: ['print-jobs'] })
      void qc.invalidateQueries({ queryKey: ['print-stats'] })
    },
    onError: (err) => {
      toast.error('Error al procesar la cola', {
        description: err instanceof Error ? err.message : 'Intenta de nuevo',
      })
    },
  })

  // ----------------------------------------------------------
  // Mutation: reintentar un solo job
  // ----------------------------------------------------------
  const retryMutation = useMutation<
    RetryResponse,
    Error,
    { id: string; guideNumber: string | null }
  >({
    mutationFn: async ({ id }) => {
      const res = await fetch(`/api/print/${id}/retry`, { method: 'POST' })
      const json = (await res.json().catch(() => ({}))) as Partial<RetryResponse> & {
        error?: string
      }
      if (!res.ok || !json.ok) {
        throw new Error(json?.error ?? `Error ${res.status}`)
      }
      return json as RetryResponse
    },
    onSuccess: (_data, vars) => {
      toast.success('Reintento encolado', {
        description: vars.guideNumber
          ? `Guía ${vars.guideNumber} vuelta a la cola.`
          : 'Trabajo vuelto a la cola.',
      })
      void qc.invalidateQueries({ queryKey: ['print-jobs'] })
      void qc.invalidateQueries({ queryKey: ['print-stats'] })
    },
    onError: (err) => {
      toast.error('No se pudo reintentar', {
        description: err instanceof Error ? err.message : 'Intenta de nuevo',
      })
    },
  })

  // ----------------------------------------------------------
  // Retry all failed
  // ----------------------------------------------------------
  const failedJobs = useMemo(
    () => jobs.filter((j) => j.status === 'FAILED'),
    [jobs],
  )

  const retryAllMutation = useMutation({
    mutationFn: async () => {
      // Corre en paralelo; cada job es independiente.
      const results = await Promise.allSettled(
        failedJobs.map((j) =>
          fetch(`/api/print/${j.id}/retry`, { method: 'POST' }).then((r) =>
            r.ok ? Promise.resolve(j) : Promise.reject(j),
          ),
        ),
      )
      const ok = results.filter((r) => r.status === 'fulfilled').length
      const failed = results.filter((r) => r.status === 'rejected').length
      return { ok, failed }
    },
    onSuccess: ({ ok, failed }) => {
      if (ok === 0) {
        toast.error('No se reintentó ningún trabajo', {
          description: 'Revisa los errores individuales en la tabla.',
        })
      } else {
        toast.success(`${ok} trabajo(s) rehecho(s) a la cola`, {
          description:
            failed > 0 ? `${failed} no pudieron reintentarse.` : undefined,
        })
      }
      void qc.invalidateQueries({ queryKey: ['print-jobs'] })
      void qc.invalidateQueries({ queryKey: ['print-stats'] })
    },
    onError: () => {
      toast.error('Error al reintentar fallidos')
    },
  })

  // ----------------------------------------------------------
  // Loading / session state
  // ----------------------------------------------------------
  if (sessionStatus === 'loading') {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      {/* --------------------------------------------------- */}
      {/* Header */}
      {/* --------------------------------------------------- */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight">
            Impresión de Guías
            {s.total > 0 && (
              <Badge variant="secondary" className="text-sm">
                {s.total} trabajos
              </Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            Cola de impresión automática de guías de envío.
          </p>
        </div>

        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            {s.failed > 0 && (
              <Button
                variant="outline"
                onClick={() => retryAllMutation.mutate()}
                disabled={retryAllMutation.isPending || failedJobs.length === 0}
              >
                {retryAllMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RotateCcw className="size-4" />
                )}
                Reintentar fallidos
                <Badge
                  variant="destructive"
                  className="ml-1 px-1.5 py-0 text-[10px]"
                >
                  {s.failed}
                </Badge>
              </Button>
            )}
            <Button
              onClick={() => processMutation.mutate()}
              disabled={processMutation.isPending}
            >
              {processMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Procesar cola ahora
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            <AlertTriangle className="size-4" />
            Solo lectura — tu rol no puede operar la cola.
          </div>
        )}
      </header>

      {/* --------------------------------------------------- */}
      {/* KPI row */}
      {/* --------------------------------------------------- */}
      <section
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
        aria-label="Indicadores de impresión"
      >
        <KPICard
          title="Total trabajos"
          value={String(s.total)}
          icon={<FileText className="size-5" />}
          loading={statsLoading}
        />
        <KPICard
          title="En cola"
          value={String(s.queued)}
          subtitle="Pendientes"
          icon={<Clock className="size-5" />}
          loading={statsLoading}
          className={s.queued > 0 ? 'border-amber-300/60' : undefined}
        />
        <KPICard
          title="Enviadas"
          value={String(s.sent)}
          subtitle="En proceso"
          icon={<Send className="size-5" />}
          loading={statsLoading}
          className={s.sent > 0 ? 'border-teal-300/60' : undefined}
        />
        <KPICard
          title="Impresas"
          value={String(s.printed)}
          subtitle="Completadas"
          icon={<Printer className="size-5" />}
          loading={statsLoading}
          className={s.printed > 0 ? 'border-emerald-300/60' : undefined}
        />
        <KPICard
          title="Fallidas"
          value={String(s.failed)}
          subtitle="Requieren atención"
          icon={<AlertTriangle className="size-5" />}
          loading={statsLoading}
          className={
            s.failed > 0
              ? 'border-rose-300 bg-rose-50/40 dark:bg-rose-900/10'
              : undefined
          }
        />
      </section>

      {statsError && (
        <p className="text-xs text-rose-600 dark:text-rose-400">
          No se pudieron cargar las estadísticas.
        </p>
      )}

      {/* --------------------------------------------------- */}
      {/* Filters bar */}
      {/* --------------------------------------------------- */}
      <Card className="gap-0 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                type="search"
                placeholder="Buscar por guía, pedido o cliente…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                aria-label="Buscar trabajos de impresión"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v)
                setPage(0)
              }}
            >
              <SelectTrigger className="w-full sm:w-52" aria-label="Estado">
                <div className="flex items-center gap-2">
                  <Filter className="size-4 text-muted-foreground" />
                  <SelectValue placeholder="Estado" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="auto-refresh"
              className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"
            >
              <Switch
                id="auto-refresh"
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
                aria-label="Auto-actualizar"
              />
              Auto-actualizar
              {autoRefresh && (
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                  5s
                </span>
              )}
            </label>
          </div>
        </div>

        {/* Pagination */}
        <div className="mt-3 flex flex-col items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground sm:flex-row">
          <span>
            {listFetching && !listLoading ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="size-3 animate-spin" /> Actualizando…
              </span>
            ) : (
              <>
                Mostrando <strong className="text-foreground">{from}</strong>–
                <strong className="text-foreground">{to}</strong> de{' '}
                <strong className="text-foreground">{total}</strong>
              </>
            )}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={!hasPrev || listLoading}
              aria-label="Página anterior"
            >
              <ChevronLeft className="size-4" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNext || listLoading}
              aria-label="Página siguiente"
            >
              Siguiente
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* --------------------------------------------------- */}
      {/* Table */}
      {/* --------------------------------------------------- */}
      <Card className="gap-0 p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[140px]">Guía</TableHead>
                <TableHead className="min-w-[100px]">Pedido</TableHead>
                <TableHead className="min-w-[160px]">Cliente</TableHead>
                <TableHead className="min-w-[110px]">Estado</TableHead>
                <TableHead className="min-w-[80px] text-center">Intentos</TableHead>
                <TableHead className="min-w-[110px]">Impresora</TableHead>
                <TableHead className="min-w-[120px]">Cola</TableHead>
                <TableHead className="min-w-[120px]">Impresa</TableHead>
                <TableHead className="min-w-[140px] text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <TableCell key={`sk-${i}-${j}`}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : listError ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center">
                    <div className="flex flex-col items-center gap-2 text-rose-600 dark:text-rose-400">
                      <AlertTriangle className="size-6" />
                      <p className="text-sm font-medium">
                        No se pudo cargar la cola de impresión.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => qc.invalidateQueries({ queryKey: ['print-jobs'] })}
                      >
                        <RefreshCw className="size-4" />
                        Reintentar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : jobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-16">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Inbox className="size-7" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">
                          No hay trabajos de impresión
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {search || statusFilter !== 'ALL'
                            ? 'Prueba ajustando los filtros de búsqueda.'
                            : 'Las guías encoladas aparecerán aquí automáticamente.'}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                jobs.map((job) => (
                  <PrintJobRow
                    key={job.id}
                    job={job}
                    canManage={canManage}
                    retryPending={retryMutation.isPending}
                    onRetry={(id, guideNumber) =>
                      retryMutation.mutate({ id, guideNumber })
                    }
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  )
}

// ============================================================
// PrintJobRow — fila individual con Collapsible de error
// ============================================================

interface PrintJobRowProps {
  job: PrintJobWithRelations
  canManage: boolean
  retryPending: boolean
  onRetry: (id: string, guideNumber: string | null) => void
}

function PrintJobRow({ job, canManage, retryPending, onRetry }: PrintJobRowProps) {
  const [open, setOpen] = useState(false)
  const status = isPrintStatus(job.status) ? job.status : 'QUEUED'
  const hasGuide = Boolean(job.guideNumber)
  const isFailed = status === 'FAILED'
  const isPrinted = status === 'PRINTED'
  const isInProgress = status === 'QUEUED' || status === 'SENT'
  const attemptsHigh = job.attempts >= 2
  const hasError = isFailed && Boolean(job.error)
  const errorPreview =
    job.error && job.error.length > 60
      ? `${job.error.slice(0, 59)}…`
      : (job.error ?? '')

  return (
    <TableRow
      className={cn(
        'transition-colors',
        isFailed && 'bg-rose-50/40 dark:bg-rose-900/10',
      )}
    >
      {/* Guía */}
      <TableCell>
        <div className="flex flex-col gap-1">
          <span
            className="font-mono text-xs font-medium text-foreground"
            title={job.guideNumber ?? 'Sin guía'}
          >
            {job.guideNumber ?? (
              <span className="text-muted-foreground">— sin guía —</span>
            )}
          </span>
          {hasGuide && (
            <a
              href={guidePdfUrl(job.guideNumber!)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-1 text-[11px] font-medium text-emerald-600 hover:underline dark:text-emerald-400"
            >
              <ExternalLink className="size-3" />
              PDF
            </a>
          )}
        </div>
      </TableCell>

      {/* Pedido */}
      <TableCell>
        <Link
          href="/dashboard/pedidos"
          className="font-medium text-foreground hover:underline"
          title={`Ir a pedidos · ${job.order.orderNumber}`}
        >
          {job.order.orderNumber}
        </Link>
      </TableCell>

      {/* Cliente */}
      <TableCell>
        <div className="flex flex-col">
          <span className="truncate text-sm">{job.order.customer.name ?? '—'}</span>
          {job.order.customer.email && (
            <span className="truncate text-[11px] text-muted-foreground">
              {job.order.customer.email}
            </span>
          )}
        </div>
      </TableCell>

      {/* Estado */}
      <TableCell>
        <div className="flex flex-col gap-1.5">
          <Badge
            variant="outline"
            className={cn('gap-1.5 border', STATUS_BADGE_CLASS[status])}
          >
            {isInProgress && (
              <Loader2 className="size-3 animate-spin" aria-hidden />
            )}
            {isPrinted && <Printer className="size-3" aria-hidden />}
            {isFailed && <AlertTriangle className="size-3" aria-hidden />}
            {status === 'QUEUED' && <Clock className="size-3" aria-hidden />}
            {status === 'SENT' && <Send className="size-3" aria-hidden />}
            {STATUS_LABELS[status]}
          </Badge>

          {hasError && (
            <Collapsible open={open} onOpenChange={setOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="max-w-[200px] truncate text-left text-[11px] text-rose-600 hover:underline dark:text-rose-400"
                  title={job.error ?? undefined}
                >
                  {open ? '▼ ' : '▶ '}
                  {errorPreview}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <p className="mt-1 max-w-[260px] whitespace-pre-wrap break-words rounded border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-800 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
                  {job.error}
                </p>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </TableCell>

      {/* Intentos */}
      <TableCell className="text-center">
        <span
          className={cn(
            'text-sm tabular-nums',
            attemptsHigh && 'font-semibold text-amber-600 dark:text-amber-400',
          )}
          title={
            attemptsHigh
              ? `${job.attempts} intentos — revisa la impresora`
              : `${job.attempts} intento(s)`
          }
        >
          {job.attempts}
        </span>
      </TableCell>

      {/* Impresora */}
      <TableCell>
        <span className="text-sm text-muted-foreground">
          {job.printer ?? 'default'}
        </span>
      </TableCell>

      {/* Cola */}
      <TableCell>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help text-xs text-muted-foreground">
              {relativeTime(job.queuedAt)}
            </span>
          </TooltipTrigger>
          <TooltipContent>{job.queuedAt}</TooltipContent>
        </Tooltip>
      </TableCell>

      {/* Impresa */}
      <TableCell>
        {job.printedAt ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help text-xs text-muted-foreground">
                {relativeTime(job.printedAt)}
              </span>
            </TooltipTrigger>
            <TooltipContent>{job.printedAt}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Acciones */}
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          {isFailed && canManage && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRetry(job.id, job.guideNumber)}
              disabled={retryPending}
            >
              {retryPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RotateCcw className="size-3.5" />
              )}
              Reintentar
            </Button>
          )}
          {isPrinted && hasGuide && (
            <Button asChild variant="outline" size="sm">
              <a
                href={guidePdfUrl(job.guideNumber!)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Eye className="size-3.5" />
                Ver PDF
              </a>
            </Button>
          )}
          {isInProgress && (
            <span
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
              title="En progreso — el worker procesará este trabajo"
            >
              <Loader2 className="size-3.5 animate-spin" />
              <span className="hidden sm:inline">En proceso</span>
            </span>
          )}
          {isFailed && !canManage && (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}
