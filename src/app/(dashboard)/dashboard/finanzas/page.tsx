'use client'

// ============================================================
// /dashboard/finanzas — Financial analytics page
// ============================================================
// Client component. Selector de periodo, 5 KPIs, tendencia de
// 30 días (revenue/costs/profit), donut de costos por categoría
// y un estado de resultados detallado.
//
// Endpoints consumidos:
//   GET /api/analytics/profitability?period=&trend=true&breakdown=true

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Percent,
  Truck,
  Loader2,
  Inbox,
  Calendar,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { KPICard } from '@/components/shared/kpi-card'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { cn, formatCOP, formatPercent } from '@/lib/format'

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

interface ProfitabilityTrendPoint {
  date: string
  label: string
  revenue: number
  costs: number
  profit: number
  margin: number
  ordersCount: number
}

interface ProfitabilityBreakdown {
  product: number
  shipping: number
  advertising: number
  operation: number
  total: number
}

interface ProfitabilityByPeriod {
  period: string
  revenue: number
  transportCollected: number
  totalRevenue: number
  costs: ProfitabilityBreakdown
  grossProfit: number
  netProfit: number
  margin: number
  ordersCount: number
}

type PeriodKey = 'day' | 'week' | 'month' | 'year' | 'all'

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------

const PERIOD_OPTIONS: Array<{ value: PeriodKey; label: string }> = [
  { value: 'day', label: 'Hoy' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: 'year', label: 'Año' },
  { value: 'all', label: 'Todo' },
]

const COST_COLORS: Record<keyof ProfitabilityBreakdown, string> = {
  product: 'var(--chart-2)', // emerald
  shipping: 'var(--chart-3)', // teal
  advertising: 'var(--chart-4)', // amber
  operation: 'var(--chart-1)', // violet-ish
  total: 'var(--chart-5)',
}

const COST_LABELS: Record<keyof ProfitabilityBreakdown, string> = {
  product: 'Producto',
  shipping: 'Envío',
  advertising: 'Publicidad',
  operation: 'Operación',
  total: 'Total',
}

// ------------------------------------------------------------
// Page
// ------------------------------------------------------------

export default function FinanzasPage() {
  const [period, setPeriod] = useState<PeriodKey>('month')

  // Period data (single combined request returns byPeriod + trend).
  // We don't use the breakdown view because period already includes
  // the cost breakdown; trend is included in the default response.
  const { data, isLoading, isError, refetch } = useQuery<ProfitabilityByPeriod>({
    queryKey: ['profitability', period],
    queryFn: async () => {
      const res = await fetch(
        `/api/analytics/profitability?view=period&period=${period}`,
      )
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err?.error ?? `Error ${res.status}`)
      }
      return res.json() as Promise<ProfitabilityByPeriod>
    },
  })

  // Trend is fetched separately for the 30-day chart (always 30 days).
  const trendQuery = useQuery<ProfitabilityTrendPoint[]>({
    queryKey: ['profitability-trend', '30'],
    queryFn: async () => {
      const res = await fetch('/api/analytics/profitability?view=trend&days=30')
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err?.error ?? `Error ${res.status}`)
      }
      return res.json() as Promise<ProfitabilityTrendPoint[]>
    },
  })

  const trend = trendQuery.data ?? []
  const breakdown = data?.costs

  const costPieData = useMemo(() => {
    if (!breakdown) return []
    return [
      { name: COST_LABELS.product, value: breakdown.product, key: 'product' as const },
      { name: COST_LABELS.shipping, value: breakdown.shipping, key: 'shipping' as const },
      { name: COST_LABELS.advertising, value: breakdown.advertising, key: 'advertising' as const },
      { name: COST_LABELS.operation, value: breakdown.operation, key: 'operation' as const },
    ].filter((d) => d.value > 0)
  }, [breakdown])

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <DollarSign className="size-6 text-muted-foreground" aria-hidden />
            Finanzas
          </h1>
          <p className="text-sm text-muted-foreground">
            Rentabilidad, costos y estado de resultados.
          </p>
        </div>

        {/* Period selector */}
        <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
          {PERIOD_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={period === opt.value ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setPeriod(opt.value)}
              className="h-8 px-3 text-xs"
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </header>

      {/* KPIs */}
      <section
        aria-label="KPIs financieros"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <KPICard
          title="Ingresos totales"
          value={formatCOP(data?.revenue ?? 0)}
          subtitle={`Periodo: ${PERIOD_OPTIONS.find((p) => p.value === period)?.label}`}
          icon={<DollarSign className="size-5" />}
          loading={isLoading}
        />
        <KPICard
          title="Utilidad bruta"
          value={formatCOP(data?.grossProfit ?? 0)}
          subtitle="Ingresos − Producto − Envío"
          icon={<TrendingUp className="size-5" />}
          loading={isLoading}
        />
        <KPICard
          title="Utilidad neta"
          value={formatCOP(data?.netProfit ?? 0)}
          subtitle="Tras todos los costos"
          icon={<TrendingDown className="size-5" />}
          loading={isLoading}
        />
        <KPICard
          title="Margen"
          value={formatPercent(data?.margin ?? 0, 1)}
          subtitle="Neto sobre ingresos"
          icon={<Percent className="size-5" />}
          loading={isLoading}
        />
        <KPICard
          title="Transporte cobrado"
          value={formatCOP(data?.transportCollected ?? 0)}
          subtitle="A clientes"
          icon={<Truck className="size-5" />}
          loading={isLoading}
        />
      </section>

      {isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center text-sm">
            <Inbox className="size-8 text-muted-foreground" />
            <p className="font-medium">No se pudieron cargar los datos financieros.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Reintentar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Trend chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="size-4 text-muted-foreground" />
            Tendencia de 30 días
          </CardTitle>
          <CardDescription>
            Ingresos, costos y utilidad diaria
          </CardDescription>
        </CardHeader>
        <CardContent>
          {trendQuery.isLoading ? (
            <Skeleton className="h-[320px] w-full" />
          ) : trend.length === 0 ? (
            <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
              Sin datos suficientes para mostrar la tendencia.
            </div>
          ) : (
            <ProfitabilityTrendChart data={trend} />
          )}
        </CardContent>
      </Card>

      {/* Cost breakdown + Income statement */}
      <section
        aria-label="Desglose de costos y estado de resultados"
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
      >
        {/* Donut */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribución de costos</CardTitle>
            <CardDescription>Por categoría</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : costPieData.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                Sin costos registrados para este periodo.
              </div>
            ) : (
              <CostsDonutChart data={costPieData} total={breakdown?.total ?? 0} />
            )}
          </CardContent>
        </Card>

        {/* Income statement */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Estado de resultados</CardTitle>
            <CardDescription>Resumen financiero del periodo</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : data ? (
              <IncomeStatement data={data} />
            ) : null}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

// ------------------------------------------------------------
// Trend chart
// ------------------------------------------------------------

function ProfitabilityTrendChart({ data }: { data: ProfitabilityTrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          tickMargin={8}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          tickFormatter={(v: number) =>
            v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`
          }
          width={48}
        />
        <Tooltip
          cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
          content={({ active, payload, label }) => {
            if (!active || !payload || payload.length === 0) return null
            const get = (k: string) =>
              (payload.find((p) => p.dataKey === k)?.value as number) ?? 0
            return (
              <div className="rounded-md border border-border bg-popover p-3 text-xs shadow-md">
                <p className="mb-1.5 font-medium text-popover-foreground">{label}</p>
                <div className="space-y-1">
                  <LineRow color="var(--chart-2)" label="Ingresos" value={formatCOP(get('revenue'))} />
                  <LineRow color="var(--chart-5)" label="Costos" value={formatCOP(get('costs'))} />
                  <LineRow color="var(--chart-1)" label="Utilidad" value={formatCOP(get('profit'))} />
                </div>
              </div>
            )
          }}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="var(--chart-2)"
          strokeWidth={2}
          fill="url(#revGradient)"
          name="Ingresos"
        />
        <Area
          type="monotone"
          dataKey="costs"
          stroke="var(--chart-5)"
          strokeWidth={2}
          fill="none"
          name="Costos"
        />
        <Area
          type="monotone"
          dataKey="profit"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#profitGradient)"
          name="Utilidad"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function LineRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </span>
      <span className="font-semibold text-foreground tabular-nums">{value}</span>
    </div>
  )
}

// ------------------------------------------------------------
// Donut chart
// ------------------------------------------------------------

interface DonutDatum {
  name: string
  value: number
  key: keyof ProfitabilityBreakdown
}

function CostsDonutChart({ data, total }: { data: DonutDatum[]; total: number }) {
  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
            stroke="var(--background)"
            strokeWidth={2}
          >
            {data.map((d) => (
              <Cell key={d.key} fill={COST_COLORS[d.key]} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null
              const p = payload[0]
              const value = (p.value as number) ?? 0
              const pct = total > 0 ? (value / total) * 100 : 0
              return (
                <div className="rounded-md border border-border bg-popover p-3 text-xs shadow-md">
                  <p className="font-medium text-popover-foreground">{p.name}</p>
                  <p className="text-muted-foreground">
                    {formatCOP(value)} · {formatPercent(pct, 1)}
                  </p>
                </div>
              )
            }}
          />
          <Legend
            iconType="circle"
            formatter={(value) => (
              <span className="text-xs text-muted-foreground">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Total center */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-3">
        <span className="text-xs text-muted-foreground">Costos totales</span>
        <span className="font-semibold tabular-nums">{formatCOP(total)}</span>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Income statement
// ------------------------------------------------------------

function IncomeStatement({ data }: { data: ProfitabilityByPeriod }) {
  const { revenue, costs, grossProfit, netProfit, margin, transportCollected } = data
  const positive = netProfit >= 0

  return (
    <div className="space-y-3">
      <StatementLine label="Ingresos" value={formatCOP(revenue)} bold />
      <Separator />
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Costos
      </p>
      <StatementLine
        label={COST_LABELS.product}
        value={formatCOP(costs.product)}
        negative
      />
      <StatementLine
        label={COST_LABELS.shipping}
        value={formatCOP(costs.shipping)}
        negative
      />
      <StatementLine
        label={COST_LABELS.advertising}
        value={formatCOP(costs.advertising)}
        negative
      />
      <StatementLine
        label={COST_LABELS.operation}
        value={formatCOP(costs.operation)}
        negative
      />
      <Separator />
      <StatementLine label="Total costos" value={formatCOP(costs.total)} negative bold />
      <Separator />
      <StatementLine
        label="Utilidad bruta"
        value={formatCOP(grossProfit)}
        bold
        highlight={grossProfit >= 0 ? 'positive' : 'negative'}
      />
      <StatementLine
        label="Utilidad neta"
        value={formatCOP(netProfit)}
        bold
        highlight={positive ? 'positive' : 'negative'}
      />

      <div className="space-y-1.5 pt-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Margen neto</span>
          <span className="font-semibold text-foreground tabular-nums">
            {formatPercent(margin, 1)}
          </span>
        </div>
        <Progress
          value={Math.max(0, Math.min(100, margin))}
          className={cn(
            'h-2 bg-muted',
            positive ? '[&>div]:bg-emerald-500' : '[&>div]:bg-rose-500',
          )}
        />
      </div>

      <Separator />
      <StatementLine
        label="Transporte cobrado"
        value={formatCOP(transportCollected)}
        hint="Cobrado al cliente"
      />
    </div>
  )
}

function StatementLine({
  label,
  value,
  bold = false,
  negative = false,
  highlight,
  hint,
}: {
  label: string
  value: string
  bold?: boolean
  negative?: boolean
  highlight?: 'positive' | 'negative'
  hint?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={cn('text-sm', bold ? 'font-semibold' : 'text-muted-foreground')}>
        {label}
        {hint && (
          <span className="ml-1 text-[10px] text-muted-foreground/70">· {hint}</span>
        )}
      </span>
      <span
        className={cn(
          'tabular-nums',
          bold ? 'text-sm font-semibold' : 'text-sm',
          highlight === 'positive' && 'text-emerald-600 dark:text-emerald-400',
          highlight === 'negative' && 'text-rose-600 dark:text-rose-400',
          negative && !highlight && 'text-rose-600/80 dark:text-rose-400/80',
        )}
      >
        {negative ? '−' : ''}
        {value}
      </span>
    </div>
  )
}
