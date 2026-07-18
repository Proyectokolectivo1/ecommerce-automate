// ============================================================
// dashboard-client.tsx — Executive Dashboard (client, period selector)
// ============================================================
// Client component con selector de período interactivo.
// Usa TanStack Query para fetch desde /api/analytics.

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import {
  AlertTriangle,
  DollarSign,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Undo2,
  ChevronRight,
  Calendar,
} from 'lucide-react'
import {
  formatCOP,
  formatNumber,
  formatPercent,
} from '@/lib/format'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { KPICard } from '@/components/shared/kpi-card'
import { StatusBadge } from '@/components/shared/status-badge'
import { SalesTrendChart } from '@/components/charts/sales-trend-chart'
import { OrdersStatusChart } from '@/components/charts/orders-status-chart'
import { ProfitabilityChart } from '@/components/charts/profitability-chart'
import { Skeleton } from '@/components/ui/skeleton'
import type { OrderStatus } from '@/modules/orders/types'

const TERMINAL_STATUSES: OrderStatus[] = ['ENTREGADO', 'DEVUELTO', 'CANCELADO']

type Period = 'day' | 'week' | 'month' | 'year'

const PERIOD_LABELS: Record<Period, string> = {
  day: 'Hoy',
  week: 'Semana',
  month: 'Mes',
  year: 'Año',
}

const PERIOD_DESC: Record<Period, string> = {
  day: 'Ventas de hoy',
  week: 'Últimos 7 días',
  month: 'Últimos 30 días',
  year: 'Últimos 365 días',
}

interface AnalyticsPayload {
  sales: {
    day: { total: number; count: number; avgTicket: number }
    week: { total: number; count: number; avgTicket: number }
    month: { total: number; count: number; avgTicket: number }
    year: { total: number; count: number; avgTicket: number }
  }
  trend: Array<{ date: string; label: string; total: number; count: number }>
  ordersByStatus: Array<{ status: OrderStatus; label: string; count: number; color: string }>
  ordersByPaymentMethod: {
    prepaid: { count: number; total: number }
    cod: { count: number; total: number }
  }
  topProducts: Array<{
    id: string
    title: string
    sku: string | null
    quantity: number
    revenue: number
    profit: number
    margin: number
  }>
  returns: {
    count: number
    rate: number
    lostValue: number
    topProduct: string | null
    topCity: string | null
  }
  profitability: {
    revenue: number
    costs: { product: number; shipping: number; advertising: number; operation: number; total: number }
    grossProfit: number
    netProfit: number
    margin: number
  }
  recentOrders: Array<{
    id: string
    orderNumber: string
    status: string
    total: number
    city: string | null
    customer: { name: string } | null
  }>
  generatedAt: string
}

export function DashboardClient() {
  const { data: session } = useSession()
  const [period, setPeriod] = useState<Period>('month')

  const { data, isLoading, isError } = useQuery<AnalyticsPayload>({
    queryKey: ['analytics-dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/analytics')
      if (!res.ok) throw new Error('Error al cargar analytics')
      return res.json()
    },
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-72" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center space-y-2">
          <AlertTriangle className="size-10 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No se pudieron cargar los datos del dashboard.
          </p>
        </div>
      </div>
    )
  }

  const periodSales = data.sales[period]
  const totalOrders = data.ordersByStatus.reduce((s, o) => s + o.count, 0)
  const activeOrders = data.ordersByStatus
    .filter((o) => !TERMINAL_STATUSES.includes(o.status))
    .reduce((s, o) => s + o.count, 0)

  const totalPaymentCount =
    data.ordersByPaymentMethod.prepaid.count + data.ordersByPaymentMethod.cod.count
  const prepaidShare =
    totalPaymentCount > 0
      ? (data.ordersByPaymentMethod.prepaid.count / totalPaymentCount) * 100
      : 0
  const codShare = 100 - prepaidShare

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Resumen ejecutivo · Hola, {session?.user?.name ?? 'Usuario'} ({session?.user?.role})
          </p>
        </div>

        {/* Period selector */}
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          <Calendar className="size-3.5 text-muted-foreground ml-2 mr-1" />
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                period === p
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </header>

      {/* Row 1 — KPI cards (driven by selected period) */}
      <section
        aria-label="KPIs principales"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <KPICard
          title={`Ventas ${PERIOD_LABELS[period].toLowerCase()}`}
          value={formatCOP(periodSales.total)}
          subtitle={`${formatNumber(periodSales.count)} pedidos · ${PERIOD_DESC[period]}`}
          icon={<DollarSign className="size-5" />}
        />
        <KPICard
          title="Ventas del mes"
          value={formatCOP(data.sales.month.total)}
          subtitle={`${formatNumber(data.sales.month.count)} pedidos`}
          icon={<TrendingUp className="size-5" />}
        />
        <KPICard
          title="Pedidos totales"
          value={formatNumber(totalOrders)}
          subtitle={`${formatNumber(activeOrders)} activos`}
          icon={<ShoppingCart className="size-5" />}
        />
        <KPICard
          title={`Ticket promedio (${PERIOD_LABELS[period].toLowerCase()})`}
          value={formatCOP(periodSales.avgTicket)}
          subtitle={`Año: ${formatCOP(data.sales.year.avgTicket)}`}
          icon={<Receipt className="size-5" />}
        />
      </section>

      {/* Row 2 — Sales trend + Payment method */}
      <section
        aria-label="Tendencia de ventas y método de pago"
        className="grid grid-cols-1 gap-4 lg:grid-cols-3"
      >
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Tendencia de ventas (14 días)</CardTitle>
            <CardDescription>Ingresos diarios en COP y número de pedidos</CardDescription>
          </CardHeader>
          <CardContent>
            <SalesTrendChart data={data.trend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Método de pago</CardTitle>
            <CardDescription>Prepagado vs Contra entrega</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">Prepagado</span>
                <span className="text-muted-foreground">
                  {formatNumber(data.ordersByPaymentMethod.prepaid.count)} ·{' '}
                  {formatCOP(data.ordersByPaymentMethod.prepaid.total)}
                </span>
              </div>
              <Progress value={prepaidShare} className="h-2 bg-muted" />
              <p className="text-xs text-muted-foreground">{formatPercent(prepaidShare, 1)} del total</p>
            </div>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">Contra entrega (COD)</span>
                <span className="text-muted-foreground">
                  {formatNumber(data.ordersByPaymentMethod.cod.count)} ·{' '}
                  {formatCOP(data.ordersByPaymentMethod.cod.total)}
                </span>
              </div>
              <Progress value={codShare} className="h-2 bg-muted" />
              <p className="text-xs text-muted-foreground">{formatPercent(codShare, 1)} del total</p>
            </div>
            <Separator />
            <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
              <span className="text-xs text-muted-foreground">Total procesado</span>
              <span className="text-sm font-semibold text-foreground">
                {formatCOP(data.ordersByPaymentMethod.prepaid.total + data.ordersByPaymentMethod.cod.total)}
              </span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Row 3 — Orders by status + Profitability */}
      <section
        aria-label="Pedidos por estado y rentabilidad"
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pedidos por estado</CardTitle>
            <CardDescription>Distribución actual de la FSM de 8 estados</CardDescription>
          </CardHeader>
          <CardContent>
            <OrdersStatusChart data={data.ordersByStatus} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rentabilidad</CardTitle>
            <CardDescription>Ingresos, costos y utilidad (últimos 30 días)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProfitabilityChart data={data.profitability} />
            <Separator />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Ingresos</dt>
              <dd className="text-right font-medium text-foreground">{formatCOP(data.profitability.revenue)}</dd>
              <dt className="text-muted-foreground">Costos totales</dt>
              <dd className="text-right font-medium text-foreground">{formatCOP(data.profitability.costs.total)}</dd>
              <dt className="text-muted-foreground">Utilidad bruta</dt>
              <dd className={`text-right font-medium ${data.profitability.grossProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {formatCOP(data.profitability.grossProfit)}
              </dd>
              <dt className="text-muted-foreground">Utilidad neta</dt>
              <dd className={`text-right font-medium ${data.profitability.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {formatCOP(data.profitability.netProfit)}
              </dd>
            </dl>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Margen neto</span>
                <span className="font-semibold text-foreground">{formatPercent(data.profitability.margin, 1)}</span>
              </div>
              <Progress value={Math.max(0, Math.min(100, data.profitability.margin))} className="h-2 bg-muted" />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Row 4 — Top products table */}
      <section aria-label="Top productos">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 5 productos</CardTitle>
            <CardDescription>Por ingreso (excluyendo pedidos cancelados/devueltos)</CardDescription>
          </CardHeader>
          <CardContent>
            {data.topProducts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Sin datos de productos para mostrar.</p>
            ) : (
              <div className="max-h-96 overflow-y-auto pr-1 [scrollbar-width:thin]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Ingresos</TableHead>
                      <TableHead className="text-right">Utilidad</TableHead>
                      <TableHead className="text-right">Margen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topProducts.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{p.title}</span>
                            {p.sku && <span className="text-xs text-muted-foreground">{p.sku}</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(p.quantity)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCOP(p.revenue)}</TableCell>
                        <TableCell className={`text-right tabular-nums ${p.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {formatCOP(p.profit)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatPercent(p.margin, 1)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Row 5 — Returns + Recent orders */}
      <section
        aria-label="Devoluciones y pedidos recientes"
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Undo2 className="size-4 text-muted-foreground" />
              Devoluciones
            </CardTitle>
            <CardDescription>Impacto de pedidos devueltos en la operación</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Devoluciones</p>
                <p className="mt-1 text-xl font-semibold text-foreground">{formatNumber(data.returns.count)}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Tasa devolución</p>
                <p className={`mt-1 text-xl font-semibold ${data.returns.rate > 5 ? 'text-rose-600 dark:text-rose-400' : 'text-foreground'}`}>
                  {formatPercent(data.returns.rate, 1)}
                </p>
              </div>
            </div>
            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Valor perdido</span>
                <span className="font-semibold text-rose-600 dark:text-rose-400">{formatCOP(data.returns.lostValue)}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Producto top</span>
                <span className="truncate text-right font-medium text-foreground">{data.returns.topProduct ?? '—'}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Ciudad top</span>
                <span className="truncate text-right font-medium text-foreground">{data.returns.topCity ?? '—'}</span>
              </div>
            </div>
            {data.returns.rate > 5 && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>La tasa de devolución supera el umbral del 5%. Revisa productos y transportadoras.</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="has-data-[slot=card-action]:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <CardTitle className="text-base">Pedidos recientes</CardTitle>
              <CardDescription>Últimos 5 pedidos recibidos</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {data.recentOrders.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Sin pedidos recientes.</p>
            ) : (
              <ul className="max-h-96 space-y-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
                {data.recentOrders.map((order) => (
                  <li key={order.id}>
                    <Link
                      href="/dashboard/pedidos"
                      className="flex items-center justify-between gap-3 rounded-md p-2 transition-colors hover:bg-muted/60"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{order.orderNumber}</span>
                          <StatusBadge status={order.status} />
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {order.customer?.name ?? 'Cliente'}
                          {order.city ? ` · ${order.city}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground tabular-nums">{formatCOP(order.total)}</span>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
