'use client'

// ============================================================
// /dashboard/productos — Products analytics page
// ============================================================
// Client component. Muestra KPIs de catálogo, los 3 productos
// "estrella" (más vendido, mayor facturación, mayor utilidad) y
// un ranking completo con búsqueda y paginación.
//
// Endpoints consumidos:
//   GET /api/analytics/products?stats=true
//   GET /api/analytics/products?star=true
//   GET /api/analytics/products?search=&limit=&offset=&sort=&order=

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Package,
  CheckCircle2,
  Boxes,
  DollarSign,
  Percent,
  Search,
  X,
  Loader2,
  Inbox,
  TrendingUp,
  Trophy,
  Crown,
  ChevronLeft,
  ChevronRight,
  Award,
} from 'lucide-react'

import { KPICard } from '@/components/shared/kpi-card'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { cn, formatCOP, formatNumber, formatPercent } from '@/lib/format'

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

interface ProductRow {
  id: string
  title: string
  sku: string | null
  variant?: string | null
  imageUrl?: string | null
  active?: boolean
  price?: number
  cost?: number
  inventoryQty?: number
  quantity: number
  revenue: number
  costTotal: number
  profit: number
  margin: number
  ordersCount?: number
}

interface ProductListResponse {
  products: ProductRow[]
  total: number
}

interface ProductStats {
  totalProducts: number
  activeProducts: number
  totalUnitsSold: number
  totalRevenue: number
  avgMargin: number
}

interface StarProducts {
  topByQuantity: ProductRow[]
  topByRevenue: ProductRow[]
  topByProfit: ProductRow[]
}

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------

const PAGE_SIZE = 15

const SORT_OPTIONS = [
  { value: 'quantity', label: 'Cantidad vendida' },
  { value: 'revenue', label: 'Ingresos' },
  { value: 'profit', label: 'Utilidad' },
  { value: 'margin', label: 'Margen' },
] as const

// ------------------------------------------------------------
// Page
// ------------------------------------------------------------

export default function ProductosPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sort, setSort] = useState<string>('revenue')
  const [order, setOrder] = useState<string>('desc')
  const [page, setPage] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  // Stats
  const statsQuery = useQuery<ProductStats>({
    queryKey: ['products-stats'],
    queryFn: async () => {
      const res = await fetch('/api/analytics/products?view=stats')
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err?.error ?? `Error ${res.status}`)
      }
      return res.json() as Promise<ProductStats>
    },
  })

  // Star products
  const starQuery = useQuery<StarProducts>({
    queryKey: ['products-star'],
    queryFn: async () => {
      const res = await fetch('/api/analytics/products?view=star')
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err?.error ?? `Error ${res.status}`)
      }
      return res.json() as Promise<StarProducts>
    },
  })

  // Ranking list
  const listQueryKey = useMemo(
    () =>
      ['products-ranking', debouncedSearch, sort, order, page] as const,
    [debouncedSearch, sort, order, page],
  )

  const listQuery = useQuery<ProductListResponse>({
    queryKey: listQueryKey,
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('view', 'ranking')
      if (debouncedSearch) params.set('search', debouncedSearch)
      params.set('sortBy', sort)
      params.set('sortDir', order)
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(page * PAGE_SIZE))
      const res = await fetch(
        `/api/analytics/products?${params.toString()}`,
      )
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err?.error ?? `Error ${res.status}`)
      }
      return res.json() as Promise<ProductListResponse>
    },
    placeholderData: (prev) => prev,
  })

  const products = listQuery.data?.products ?? []
  const total = listQuery.data?.total ?? 0
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1
  const to = Math.min((page + 1) * PAGE_SIZE, total)
  const hasNext = to < total
  const hasPrev = page > 0

  const hasActiveFilters = search.trim() !== ''

  function clearFilters() {
    setSearch('')
    setDebouncedSearch('')
    setSort('revenue')
    setOrder('desc')
    setPage(0)
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Package className="size-6 text-muted-foreground" aria-hidden />
            Productos
          </h1>
          <p className="text-sm text-muted-foreground">
            Analítica de catálogo · ranking por ventas, ingresos y utilidad.
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {formatNumber(statsQuery.data?.totalProducts ?? 0)} productos
        </Badge>
      </header>

      {/* KPIs */}
      <section
        aria-label="KPIs de productos"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <KPICard
          title="Total productos"
          value={formatNumber(statsQuery.data?.totalProducts ?? 0)}
          subtitle="En catálogo"
          icon={<Package className="size-5" />}
          loading={statsQuery.isLoading}
        />
        <KPICard
          title="Activos"
          value={formatNumber(statsQuery.data?.activeProducts ?? 0)}
          subtitle="Disponibles para venta"
          icon={<CheckCircle2 className="size-5" />}
          loading={statsQuery.isLoading}
        />
        <KPICard
          title="Unidades vendidas"
          value={formatNumber(statsQuery.data?.totalUnitsSold ?? 0)}
          subtitle="Histórico"
          icon={<Boxes className="size-5" />}
          loading={statsQuery.isLoading}
        />
        <KPICard
          title="Ingresos totales"
          value={formatCOP(statsQuery.data?.totalRevenue ?? 0)}
          subtitle="Acumulado"
          icon={<DollarSign className="size-5" />}
          loading={statsQuery.isLoading}
        />
        <KPICard
          title="Margen promedio"
          value={formatPercent(statsQuery.data?.avgMargin ?? 0, 1)}
          subtitle="Sobre ingresos"
          icon={<Percent className="size-5" />}
          loading={statsQuery.isLoading}
        />
      </section>

      {/* Star products */}
      <section aria-label="Productos estrella" className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StarCard
          title="Más vendido"
          subtitle="Por unidades"
          color="emerald"
          icon={<Trophy className="size-5" />}
          product={starQuery.data?.topByQuantity?.[0] ?? null}
          loading={starQuery.isLoading}
          metric="quantity"
        />
        <StarCard
          title="Mayor facturación"
          subtitle="Por ingresos"
          color="teal"
          icon={<Crown className="size-5" />}
          product={starQuery.data?.topByRevenue?.[0] ?? null}
          loading={starQuery.isLoading}
          metric="revenue"
        />
        <StarCard
          title="Mayor utilidad"
          subtitle="Por profit"
          color="violet"
          icon={<Award className="size-5" />}
          product={starQuery.data?.topByProfit?.[0] ?? null}
          loading={starQuery.isLoading}
          metric="profit"
        />
      </section>

      {/* Ranking */}
      <Card className="gap-0 overflow-hidden p-0">
        <CardHeader className="border-b p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">Ranking de productos</CardTitle>
              <CardDescription>Ordenable por cantidad, ingresos o utilidad</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  type="search"
                  placeholder="Buscar producto o SKU…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  aria-label="Buscar productos"
                />
              </div>
              <Select value={sort} onValueChange={(v) => { setSort(v); setPage(0) }}>
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
              <Select value={order} onValueChange={(v) => { setOrder(v); setPage(0) }}>
                <SelectTrigger className="w-full sm:w-32" aria-label="Dirección">
                  <SelectValue placeholder="Dirección" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Descendente</SelectItem>
                  <SelectItem value="asc">Ascendente</SelectItem>
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
        </CardHeader>

        <div className="overflow-x-auto">
          <div className="max-h-[640px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Producto</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Ingresos</TableHead>
                  <TableHead className="hidden md:table-cell text-right">Costo</TableHead>
                  <TableHead className="text-right">Utilidad</TableHead>
                  <TableHead className="pr-4 text-right">Margen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQuery.isLoading && products.length === 0
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={`sk-${i}`}>
                        <TableCell className="pl-4">
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="mt-1 h-3 w-20" />
                        </TableCell>
                        <TableCell className="text-right">
                          <Skeleton className="ml-auto h-4 w-12" />
                        </TableCell>
                        <TableCell className="text-right">
                          <Skeleton className="ml-auto h-4 w-24" />
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-right">
                          <Skeleton className="ml-auto h-4 w-24" />
                        </TableCell>
                        <TableCell className="text-right">
                          <Skeleton className="ml-auto h-4 w-24" />
                        </TableCell>
                        <TableCell className="pr-4 text-right">
                          <Skeleton className="ml-auto h-5 w-16 rounded-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  : products.map((p) => (
                      <ProductRowItem key={p.id} product={p} />
                    ))}
              </TableBody>
            </Table>

            {!listQuery.isLoading && !listQuery.isError && products.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                  <Inbox className="size-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">Sin productos para mostrar</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {hasActiveFilters
                      ? 'Ajusta los filtros para encontrar productos.'
                      : 'Aún no hay datos de ventas de productos.'}
                  </p>
                </div>
              </div>
            )}

            {listQuery.isError && (
              <div className="flex flex-col items-center gap-2 p-12 text-center text-sm">
                <Inbox className="size-8 text-muted-foreground" />
                <p className="font-medium">No se pudo cargar el ranking.</p>
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
// Star product card
// ------------------------------------------------------------

function StarCard({
  title,
  subtitle,
  color,
  icon,
  product,
  loading,
  metric,
}: {
  title: string
  subtitle: string
  color: 'emerald' | 'teal' | 'violet'
  icon: React.ReactNode
  product: ProductRow | null
  loading: boolean
  metric: 'quantity' | 'revenue' | 'profit'
}) {
  const colorMap: Record<string, string> = {
    emerald:
      'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
    teal:
      'border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-900/20 dark:text-teal-300',
    violet:
      'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-900/20 dark:text-violet-300',
  }

  return (
    <Card className={cn('gap-0 p-5 border-2', colorMap[color])}>
      <CardContent className="p-0 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-0.5">
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
              {title}
            </p>
            <p className="text-[11px] opacity-60">{subtitle}</p>
          </div>
          <div className="flex size-10 items-center justify-center rounded-lg bg-background/60">
            {icon}
          </div>
        </div>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-8 w-1/2" />
          </div>
        ) : product ? (
          <>
            <div className="space-y-1">
              <p className="text-sm font-semibold leading-tight line-clamp-2">
                {product.title}
              </p>
              {product.sku && (
                <p className="text-[11px] font-mono opacity-60">{product.sku}</p>
              )}
            </div>
            <Separator />
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-[11px] uppercase tracking-wide opacity-70">
                  {metric === 'quantity' && 'Unidades'}
                  {metric === 'revenue' && 'Ingresos'}
                  {metric === 'profit' && 'Utilidad'}
                </p>
                <p className="text-xl font-bold tabular-nums">
                  {metric === 'quantity' && formatNumber(product.quantity)}
                  {metric === 'revenue' && formatCOP(product.revenue)}
                  {metric === 'profit' && formatCOP(product.profit)}
                </p>
              </div>
              <Badge variant="outline" className="border-current opacity-80">
                <TrendingUp className="size-3" />
                {formatPercent(product.margin, 1)}
              </Badge>
            </div>
          </>
        ) : (
          <p className="text-sm opacity-60 py-4 text-center">Sin datos</p>
        )}
      </CardContent>
    </Card>
  )
}

// ------------------------------------------------------------
// Margin badge
// ------------------------------------------------------------

function MarginBadge({ margin }: { margin: number }) {
  let cls = 'border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-200'
  if (margin >= 30) {
    cls = 'border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
  } else if (margin < 10) {
    cls = 'border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
  }
  return (
    <Badge variant="outline" className={cn('border tabular-nums', cls)}>
      {formatPercent(margin, 1)}
    </Badge>
  )
}

// ------------------------------------------------------------
// Row
// ------------------------------------------------------------

function ProductRowItem({ product }: { product: ProductRow }) {
  return (
    <TableRow>
      <TableCell className="pl-4">
        <div className="flex flex-col">
          <span className="font-medium text-foreground line-clamp-1 max-w-[280px]">
            {product.title}
          </span>
          {product.sku && (
            <span className="text-xs text-muted-foreground font-mono">
              {product.sku}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatNumber(product.quantity)}
      </TableCell>
      <TableCell className="text-right tabular-nums font-medium">
        {formatCOP(product.revenue)}
      </TableCell>
      <TableCell className="hidden md:table-cell text-right tabular-nums text-muted-foreground">
        {formatCOP(product.costTotal)}
      </TableCell>
      <TableCell
        className={cn(
          'text-right tabular-nums font-medium',
          product.profit >= 0
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-rose-600 dark:text-rose-400',
        )}
      >
        {formatCOP(product.profit)}
      </TableCell>
      <TableCell className="pr-4 text-right">
        <MarginBadge margin={product.margin} />
      </TableCell>
    </TableRow>
  )
}
