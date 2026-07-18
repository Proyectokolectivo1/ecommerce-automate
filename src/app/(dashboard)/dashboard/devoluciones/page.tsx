'use client'

// ============================================================
// /dashboard/devoluciones — Returns analytics page
// ============================================================
// Client component. Muestra KPIs de devoluciones, 2 gráficos de
// barras (top productos devueltos y top ciudades) y una tabla de
// devoluciones con badges de estado.
//
// Endpoints consumidos:
//   GET /api/analytics/returns?metrics=true
//   GET /api/analytics/returns?limit=&offset=

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Undo2,
  Percent,
  DollarSign,
  PackageX,
  Loader2,
  Inbox,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Box,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { KPICard } from '@/components/shared/kpi-card'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Skeleton } from '@/components/ui/skeleton'
import { cn, formatCOP, formatDate, formatNumber, formatPercent } from '@/lib/format'

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

interface ReturnRow {
  id: string
  orderId: string
  orderNumber: string
  orderStatus: string
  productId: string | null
  productTitle: string | null
  productSku: string | null
  reason: string | null
  city: string | null
  lostValue: number
  status: string
  createdAt: string
}

interface ReturnsListResponse {
  returns: ReturnRow[]
  total: number
}

interface ReturnsTopItem {
  id: string
  label: string
  count: number
  lostValue: number
}

interface ReturnsMetrics {
  count: number
  totalOrders: number
  rate: number
  lostValue: number
  topProduct: string | null
  topCity: string | null
  topProducts: ReturnsTopItem[]
  topCities: ReturnsTopItem[]
}

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------

const PAGE_SIZE = 15

const RETURN_STATUS_LABEL: Record<string, string> = {
  RECEIVED: 'Recibida',
  INSPECTED: 'Inspeccionada',
  RESTOCKED: 'Reabastecida',
  DISCARDED: 'Descartada',
}

const RETURN_STATUS_BADGE: Record<string, string> = {
  RECEIVED:
    'border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-200',
  INSPECTED:
    'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  RESTOCKED:
    'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  DISCARDED:
    'border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
}

function statusBadgeClass(s: string): string {
  return RETURN_STATUS_BADGE[s] ?? 'border-border bg-muted text-muted-foreground'
}

// ------------------------------------------------------------
// Page
// ------------------------------------------------------------

export default function DevolucionesPage() {
  const [page, setPage] = useState(0)

  const metricsQuery = useQuery<ReturnsMetrics>({
    queryKey: ['returns-metrics'],
    queryFn: async () => {
      const res = await fetch('/api/analytics/returns?view=metrics')
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err?.error ?? `Error ${res.status}`)
      }
      return res.json() as Promise<ReturnsMetrics>
    },
  })

  const listQuery = useQuery<ReturnsListResponse>({
    queryKey: ['returns-list', page],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('view', 'list')
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(page * PAGE_SIZE))
      const res = await fetch(`/api/analytics/returns?${params.toString()}`)
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err?.error ?? `Error ${res.status}`)
      }
      return res.json() as Promise<ReturnsListResponse>
    },
    placeholderData: (prev) => prev,
  })

  const returns = listQuery.data?.returns ?? []
  const total = listQuery.data?.total ?? 0
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1
  const to = Math.min((page + 1) * PAGE_SIZE, total)
  const hasNext = to < total
  const hasPrev = page > 0

  const topProducts = metricsQuery.data?.topProducts ?? []
  const topCities = metricsQuery.data?.topCities ?? []

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Undo2 className="size-6 text-muted-foreground" aria-hidden />
            Devoluciones
          </h1>
          <p className="text-sm text-muted-foreground">
            Analítica de devoluciones · impacto operativo y producto más devuelto.
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {formatNumber(metricsQuery.data?.count ?? 0)} devoluciones
        </Badge>
      </header>

      {/* KPIs */}
      <section
        aria-label="KPIs de devoluciones"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <KPICard
          title="Total devoluciones"
          value={formatNumber(metricsQuery.data?.count ?? 0)}
          subtitle="Histórico"
          icon={<Undo2 className="size-5" />}
          loading={metricsQuery.isLoading}
        />
        <KPICard
          title="Tasa devolución"
          value={formatPercent(metricsQuery.data?.rate ?? 0, 1)}
          subtitle="Sobre pedidos"
          icon={<Percent className="size-5" />}
          loading={metricsQuery.isLoading}
        />
        <KPICard
          title="Valor perdido"
          value={formatCOP(metricsQuery.data?.lostValue ?? 0)}
          subtitle="Por devoluciones"
          icon={<DollarSign className="size-5" />}
          loading={metricsQuery.isLoading}
        />
        <KPICard
          title="Producto más devuelto"
          value={metricsQuery.data?.topProduct ?? '—'}
          subtitle="Por número de devoluciones"
          icon={<PackageX className="size-5" />}
          loading={metricsQuery.isLoading}
        />
      </section>

      {/* Charts */}
      <section
        aria-label="Gráficos de devoluciones"
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Box className="size-4 text-rose-500" />
              Top productos devueltos
            </CardTitle>
            <CardDescription>Por número de devoluciones</CardDescription>
          </CardHeader>
          <CardContent>
            <ReturnsBarChart
              data={topProducts}
              color="var(--chart-1)"
              loading={metricsQuery.isLoading}
              emptyText="Sin datos de productos devueltos."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="size-4 text-amber-500" />
              Top ciudades con devoluciones
            </CardTitle>
            <CardDescription>Distribución geográfica</CardDescription>
          </CardHeader>
          <CardContent>
            <ReturnsBarChart
              data={topCities}
              color="var(--chart-4)"
              loading={metricsQuery.isLoading}
              emptyText="Sin datos de ciudades."
            />
          </CardContent>
        </Card>
      </section>

      {/* Table */}
      <Card className="gap-0 overflow-hidden p-0">
        <CardHeader className="border-b p-4">
          <CardTitle className="text-base">Listado de devoluciones</CardTitle>
          <CardDescription>
            Últimas devoluciones registradas en el sistema
          </CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <div className="max-h-[640px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Pedido</TableHead>
                  <TableHead className="hidden md:table-cell">Razón</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="hidden lg:table-cell">Ciudad</TableHead>
                  <TableHead className="text-right">Valor perdido</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="pr-4 hidden xl:table-cell">Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQuery.isLoading && returns.length === 0
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={`sk-${i}`}>
                        <TableCell className="pl-4">
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-32" />
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Skeleton className="h-4 w-40" />
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell className="text-right">
                          <Skeleton className="ml-auto h-4 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-24 rounded-full" />
                        </TableCell>
                        <TableCell className="pr-4 hidden xl:table-cell">
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                      </TableRow>
                    ))
                  : returns.map((r) => (
                      <ReturnRowItem key={r.id} row={r} />
                    ))}
              </TableBody>
            </Table>

            {!listQuery.isLoading && !listQuery.isError && returns.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                  <Inbox className="size-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">Sin devoluciones registradas</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Cuando se registren devoluciones aparecerán aquí.
                  </p>
                </div>
              </div>
            )}

            {listQuery.isError && (
              <div className="flex flex-col items-center gap-2 p-12 text-center text-sm">
                <Inbox className="size-8 text-muted-foreground" />
                <p className="font-medium">No se pudieron cargar las devoluciones.</p>
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

function ReturnsBarChart({
  data,
  color,
  loading,
  emptyText,
}: {
  data: ReturnsTopItem[]
  color: string
  loading: boolean
  emptyText: string
}) {
  // Map API shape (id/label/count) to the chart shape (name/count).
  const chartData = useMemo(
    () => data.slice(0, 8).map((d) => ({ name: d.label, count: d.count })),
    [data],
  )

  if (loading) {
    return <Skeleton className="h-[280px] w-full" />
  }

  if (chartData.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          width={120}
          tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)}
        />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
          content={({ active, payload, label }) => {
            if (!active || !payload || payload.length === 0) return null
            return (
              <div className="rounded-md border border-border bg-popover p-3 text-xs shadow-md">
                <p className="mb-1 font-medium text-popover-foreground truncate max-w-[200px]">
                  {label}
                </p>
                <p className="text-muted-foreground">
                  Devoluciones:{' '}
                  <span className="font-semibold text-foreground">
                    {formatNumber(payload[0].value as number)}
                  </span>
                </p>
              </div>
            )
          }}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
          {chartData.map((_, i) => (
            <Cell key={i} fill={color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ------------------------------------------------------------
// Row
// ------------------------------------------------------------

function ReturnRowItem({ row }: { row: ReturnRow }) {
  return (
    <TableRow>
      <TableCell className="pl-4">
        <span className="font-mono text-sm font-medium">{row.orderNumber}</span>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <span className="text-sm text-muted-foreground line-clamp-2 max-w-[220px]">
          {row.reason ?? '—'}
        </span>
      </TableCell>
      <TableCell>
        <span className="text-sm text-muted-foreground line-clamp-1 max-w-[220px]">
          {row.productTitle ?? '—'}
        </span>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <span className="text-sm text-muted-foreground">{row.city ?? '—'}</span>
      </TableCell>
      <TableCell className="text-right">
        <span className="font-semibold tabular-nums text-rose-600 dark:text-rose-400">
          {formatCOP(row.lostValue)}
        </span>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={cn('border', statusBadgeClass(row.status))}>
          {RETURN_STATUS_LABEL[row.status] ?? row.status}
        </Badge>
      </TableCell>
      <TableCell className="pr-4 hidden xl:table-cell">
        <span className="text-xs text-muted-foreground">{formatDate(row.createdAt)}</span>
      </TableCell>
    </TableRow>
  )
}
