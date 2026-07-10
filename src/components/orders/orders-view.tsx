'use client'

// ============================================================
// orders-view.tsx — Client component for the Orders list page
// ============================================================
// Renderiza la barra de filtros, la tabla de pedidos y la
// paginación. Mantiene el estado de filtros + página, hace
// fetch con React Query (debounced para la búsqueda) y abre
// el detalle del pedido en un Sheet lateral al hacer clic en
// cualquier fila.

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Filter,
  Eye,
  ChevronLeft,
  ChevronRight,
  Package,
  X,
  Loader2,
  Inbox,
} from 'lucide-react'

import { Card } from '@/components/ui/card'
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
import { StatusBadge } from '@/components/shared/status-badge'
import { OrderDetailSheet } from './order-detail-sheet'
import { formatCOP, formatDate } from '@/lib/format'
import {
  ORDER_STATE_LABELS,
  ORDER_STATES,
} from '@/modules/orders/state-machine'

const PAGE_SIZE = 20

interface OrdersViewProps {
  initialOrders: OrderListRow[]
  initialTotal: number
  user: { id: string; name?: string | null; email: string; role: string }
}

interface Filters {
  status: string
  search: string
  paymentMethod: string
}

const DEFAULT_FILTERS: Filters = {
  status: 'ALL',
  search: '',
  paymentMethod: 'ALL',
}

// ------------------------------------------------------------
// Componente principal
// ------------------------------------------------------------

export function OrdersView({
  initialOrders,
  initialTotal,
}: OrdersViewProps) {
  const qc = useQueryClient()
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(0)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)

  // Debounce del input de búsqueda (300ms)
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(filters.search.trim())
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [filters.search])

  const queryKey = useMemo(
    () => [
      'orders',
      filters.status,
      filters.paymentMethod,
      debouncedSearch,
      page,
    ],
    [filters.status, filters.paymentMethod, debouncedSearch, page],
  )

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey,
    initialData:
      page === 0
        ? { orders: initialOrders, total: initialTotal }
        : undefined,
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters.status && filters.status !== 'ALL')
        params.set('status', filters.status)
      if (filters.paymentMethod && filters.paymentMethod !== 'ALL')
        params.set('paymentMethod', filters.paymentMethod)
      if (debouncedSearch) params.set('search', debouncedSearch)
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(page * PAGE_SIZE))
      const res = await fetch(`/api/orders?${params.toString()}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? `Error ${res.status}`)
      }
      return res.json() as Promise<{ orders: OrderListRow[]; total: number }>
    },
    // Mantener datos previos mientras se carga la siguiente página.
    placeholderData: (prev) => prev,
  })

  const orders = data?.orders ?? []
  const total = data?.total ?? 0
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1
  const to = Math.min((page + 1) * PAGE_SIZE, total)
  const hasNext = to < total
  const hasPrev = page > 0

  const hasActiveFilters =
    filters.status !== 'ALL' ||
    filters.paymentMethod !== 'ALL' ||
    filters.search.trim() !== ''

  function clearFilters() {
    setFilters(DEFAULT_FILTERS)
    setDebouncedSearch('')
    setPage(0)
  }

  function handleTransitioned() {
    void qc.invalidateQueries({ queryKey: ['orders'] })
  }

  return (
    <div className="space-y-4">
      {/* Filters bar */}
      <Card className="gap-0 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              type="search"
              placeholder="Buscar por número, cliente, email, ciudad…"
              value={filters.search}
              onChange={(e) =>
                setFilters((f) => ({ ...f, search: e.target.value }))
              }
              className="pl-9"
              aria-label="Buscar pedidos"
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
              <SelectTrigger className="w-full sm:w-56" aria-label="Estado">
                <div className="flex items-center gap-2">
                  <Filter className="size-4 text-muted-foreground" />
                  <SelectValue placeholder="Estado" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos los estados</SelectItem>
                {ORDER_STATES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {ORDER_STATE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.paymentMethod}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, paymentMethod: v }))
                setPage(0)
              }}
            >
              <SelectTrigger className="w-full sm:w-44" aria-label="Método de pago">
                <SelectValue placeholder="Método de pago" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos los métodos</SelectItem>
                <SelectItem value="PREPAID">Prepagado</SelectItem>
                <SelectItem value="COD">Contra entrega</SelectItem>
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
        <div className="orders-scroll max-h-[600px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden md:table-cell">Fecha</TableHead>
                <TableHead className="hidden sm:table-cell">Método</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="pr-4 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && !orders.length
                ? Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={`sk-${i}`}>
                      <TableCell className="pl-4">
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Skeleton className="h-5 w-20 rounded-full" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-28 rounded-full" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="ml-auto h-4 w-20" />
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <Skeleton className="ml-auto h-8 w-20" />
                      </TableCell>
                    </TableRow>
                  ))
                : orders.map((o) => (
                    <OrderRow
                      key={o.id}
                      order={o}
                      onView={() => setSelectedOrderId(o.id)}
                    />
                  ))}
            </TableBody>
          </Table>

          {!isLoading && !isError && orders.length === 0 && (
            <EmptyState hasFilters={hasActiveFilters} onClear={clearFilters} />
          )}

          {isError && (
            <div className="flex flex-col items-center gap-2 p-12 text-center text-sm">
              <Inbox className="size-8 text-muted-foreground" />
              <p className="font-medium">No se pudieron cargar los pedidos.</p>
              <p className="text-xs text-muted-foreground">
                Revisa tu conexión o intenta de nuevo más tarde.
              </p>
            </div>
          )}
        </div>

        {/* Pagination */}
        <div className="flex flex-col items-center justify-between gap-3 border-t bg-card p-3 sm:flex-row">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {isFetching && (
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
              disabled={!hasPrev || isFetching}
              className="gap-1"
            >
              <ChevronLeft className="size-4" />
              Anterior
            </Button>
            <span className="text-xs text-muted-foreground">
              Pág. {page + 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNext || isFetching}
              className="gap-1"
            >
              Siguiente
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Detail sheet */}
      <OrderDetailSheet
        orderId={selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
        onTransitioned={handleTransitioned}
      />
    </div>
  )
}

// ------------------------------------------------------------
// Fila de la tabla
// ------------------------------------------------------------

function OrderRow({
  order,
  onView,
}: {
  order: OrderListRow
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
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Package className="size-4" />
          </div>
          <div>
            <div className="font-mono text-sm font-medium">
              {order.orderNumber}
            </div>
            {order.city && (
              <div className="text-xs text-muted-foreground">
                {order.city}
              </div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="text-sm font-medium">
          {order.customer?.name ?? '—'}
        </div>
        {order.customer?.email && (
          <div className="text-xs text-muted-foreground">
            {order.customer.email}
          </div>
        )}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <span className="text-xs text-muted-foreground">
          {formatDate(order.placedAt)}
        </span>
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <PaymentMethodBadge method={order.paymentMethod} />
      </TableCell>
      <TableCell>
        <StatusBadge status={order.status} />
      </TableCell>
      <TableCell className="text-right">
        <span className="font-semibold tabular-nums">
          {formatCOP(order.total)}
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

function PaymentMethodBadge({ method }: { method: string }) {
  if (method === 'COD') {
    return (
      <Badge
        variant="outline"
        className="border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
      >
        COD
      </Badge>
    )
  }
  return <Badge variant="secondary">Prepagado</Badge>
}

// ------------------------------------------------------------
// Estado vacío
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
        <p className="text-sm font-medium">No se encontraron pedidos</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {hasFilters
            ? 'Prueba con otros filtros o limpia la búsqueda.'
            : 'Aún no se han registrado pedidos en la plataforma.'}
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
// Tipo de fila (recortado del OrderListItem de Prisma)
// ------------------------------------------------------------

interface OrderListRow {
  id: string
  orderNumber: string
  status: string
  paymentMethod: string
  subtotal: number
  shippingCost: number
  total: number
  city: string | null
  placedAt: string
  customer: {
    id: string
    name: string
    email: string | null
    phone: string | null
  } | null
}
