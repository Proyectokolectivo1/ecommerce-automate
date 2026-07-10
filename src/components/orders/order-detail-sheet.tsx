'use client'

// ============================================================
// order-detail-sheet.tsx — Right-side drawer with full order detail
// ============================================================
// Sheet (lado derecho) que muestra el detalle completo de un
// pedido: cliente, items, envíos, transacciones, bitácora de
// estados (timeline) y botones para ejecutar transiciones
// permitidas por la FSM.
//
// - Se alimenta de `GET /api/orders/[id]` con React Query.
// - Al ejecutar una transición, invalida los queries del pedido
//   y de la lista para refrescar UI.

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Package,
  MapPin,
  CreditCard,
  Truck,
  User,
  Mail,
  Phone,
  Calendar,
  Receipt,
  AlertTriangle,
  Ban,
  ArrowRight,
  Clock,
  Building2,
  CircleDot,
} from 'lucide-react'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { StatusBadge } from '@/components/shared/status-badge'
import { TransitionDialog } from './transition-dialog'
import { formatCOP, formatDate } from '@/lib/format'
import {
  ORDER_STATE_LABELS,
  getAllowedTransitions,
} from '@/modules/orders/state-machine'

interface OrderDetailSheetProps {
  orderId: string | null
  onClose: () => void
  onTransitioned: () => void
}

// ------------------------------------------------------------
// Helpers de presentación
// ------------------------------------------------------------

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  PREPAID: 'Prepagado',
  COD: 'Contra entrega',
}

const CARRIER_LABEL: Record<string, string> = {
  SERVIENTREGA: 'Servientrega',
  ENVIA: 'Envía',
  INTERRAPIDISIMO: 'Interrapidísimo',
}

const SHIPMENT_STATUS_LABEL: Record<string, string> = {
  CREATED: 'Creado',
  PRINTED: 'Impreso',
  IN_TRANSIT: 'En tránsito',
  DELIVERED: 'Entregado',
  RETURNED: 'Devuelto',
}

const TX_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobada',
  DECLINED: 'Rechazada',
  REFUNDED: 'Reembolsada',
}

const TX_TYPE_LABEL: Record<string, string> = {
  TRANSPORT: 'Transporte',
  ORDER_PAYMENT: 'Pago del pedido',
}

const TX_STATUS_VARIANT: Record<
  string,
  'secondary' | 'default' | 'destructive' | 'outline'
> = {
  PENDING: 'secondary',
  APPROVED: 'default',
  DECLINED: 'destructive',
  REFUNDED: 'outline',
}

function txStatusClass(status: string): string {
  switch (status) {
    case 'APPROVED':
      return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300'
    case 'DECLINED':
      return ''
    case 'REFUNDED':
      return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300'
    default:
      return 'bg-zinc-100 text-zinc-800 border-zinc-300 dark:bg-zinc-800/60 dark:text-zinc-200'
  }
}

function actorLabel(actor: string | null): string {
  if (!actor) return 'Sistema'
  if (actor === 'system') return 'Sistema'
  if (actor === 'shopify') return 'Shopify'
  if (actor === 'bodega') return 'Bodega'
  return actor.slice(0, 8)
}

// ------------------------------------------------------------
// Sub-secciones
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
    <div className="flex items-start justify-between gap-3 py-1.5">
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

// ------------------------------------------------------------
// Componente principal
// ------------------------------------------------------------

export function OrderDetailSheet({
  orderId,
  onClose,
  onTransitioned,
}: OrderDetailSheetProps) {
  const qc = useQueryClient()
  const [transitionTarget, setTransitionTarget] = useState<string | null>(null)

  const open = !!orderId

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ['order', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? `Error ${res.status}`)
      }
      return res.json()
    },
  })

  const allowedTransitions = order?.status
    ? getAllowedTransitions(order.status as string)
    : []

  const statusLogsDesc = order?.statusLogs
    ? [...order.statusLogs].sort(
        (a: StatusLogView, b: StatusLogView) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    : []

  function handleOpenChange(next: boolean) {
    if (!next) onClose()
  }

  function handleTransitionSuccess() {
    void qc.invalidateQueries({ queryKey: ['order', orderId] })
    void qc.invalidateQueries({ queryKey: ['orders'] })
    onTransitioned()
    setTransitionTarget(null)
  }

  const isCodPendingTransport =
    order?.paymentMethod === 'COD' &&
    order?.status === 'PENDIENTE_PAGO_TRANSPORTE'

  return (
    <>
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 sm:max-w-[480px]"
      >
        {/* Header */}
        <SheetHeader className="border-b p-4 pr-12">
          <SheetTitle className="flex items-center justify-between gap-2">
            <span className="font-mono text-base">
              {order?.orderNumber ?? 'Pedido'}
            </span>
            {order?.status && <StatusBadge status={order.status} />}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Detalle del pedido {order?.orderNumber}
          </SheetDescription>
        </SheetHeader>

        {/* Body */}
        <ScrollArea className="flex-1">
          <div className="space-y-6 p-4">
            {isLoading && <DetailSkeleton />}

            {isError && (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <AlertTriangle className="size-8 text-amber-500" />
                <p className="text-sm font-medium">No se pudo cargar el pedido</p>
                <p className="text-xs text-muted-foreground">
                  Intenta cerrar y abrir nuevamente el detalle.
                </p>
              </div>
            )}

            {order && !isLoading && !isError && (
              <>
                {/* COD pendiente de pago de transporte */}
                {isCodPendingTransport && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900/20">
                    <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
                      <AlertTriangle className="size-4" />
                      <span className="text-sm font-semibold">
                        Pago de transporte pendiente
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                      Este pedido es contra entrega y requiere el pago del
                      transporte (
                      <strong>{formatCOP(order.transportCost ?? 0)}</strong>)
                      antes de avanzar a preparación.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-3 gap-2 border-amber-400 bg-white text-amber-900 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60"
                      disabled
                      title="Próximamente: integración con pasarelas de pago"
                    >
                      <CreditCard className="size-3.5" />
                      Generar link de pago
                    </Button>
                  </div>
                )}

                {/* Cliente */}
                <section className="space-y-2">
                  <SectionTitle icon={User}>Cliente</SectionTitle>
                  <div className="rounded-lg border bg-card p-3">
                    <div className="text-sm font-semibold text-foreground">
                      {order.customer?.name ?? '—'}
                    </div>
                    <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {order.customer?.email && (
                        <div className="flex items-center gap-1.5">
                          <Mail className="size-3.5" />
                          <span>{order.customer.email}</span>
                        </div>
                      )}
                      {order.customer?.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="size-3.5" />
                          <span>{order.customer.phone}</span>
                        </div>
                      )}
                      {order.city && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="size-3.5" />
                          <span>
                            {order.city}
                            {order.address ? ` · ${order.address}` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {/* Información del pedido */}
                <section className="space-y-2">
                  <SectionTitle icon={Receipt}>Resumen</SectionTitle>
                  <div className="rounded-lg border bg-card p-3">
                    <InfoRow
                      label="Fecha"
                      value={formatDate(order.placedAt)}
                      icon={Calendar}
                    />
                    <InfoRow
                      label="Método de pago"
                      value={
                        PAYMENT_METHOD_LABEL[order.paymentMethod] ??
                        order.paymentMethod
                      }
                      icon={CreditCard}
                    />
                    {order.paymentMethod === 'COD' && (
                      <InfoRow
                        label="¿Transporte pagado?"
                        value={
                          order.codPaid ? (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              Sí
                            </span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400">
                              No
                            </span>
                          )
                        }
                      />
                    )}
                    <Separator className="my-2" />
                    <InfoRow
                      label="Subtotal"
                      value={formatCOP(order.subtotal)}
                    />
                    <InfoRow
                      label="Envío (cobrado)"
                      value={formatCOP(order.shippingCost)}
                    />
                    {order.transportCost > 0 && (
                      <InfoRow
                        label="Costo transporte"
                        value={formatCOP(order.transportCost)}
                      />
                    )}
                    <Separator className="my-2" />
                    <InfoRow
                      label="Total"
                      value={
                        <span className="text-base font-bold">
                          {formatCOP(order.total)}
                        </span>
                      }
                    />
                  </div>
                </section>

                {/* Items */}
                <section className="space-y-2">
                  <SectionTitle icon={Package}>Productos</SectionTitle>
                  <div className="space-y-2">
                    {order.items?.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Este pedido no tiene items.
                      </p>
                    )}
                    {order.items?.map((item: OrderItemView) => (
                      <div
                        key={item.id}
                        className="rounded-lg border bg-card p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {item.title}
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {item.sku ? (
                                <span className="font-mono">{item.sku}</span>
                              ) : (
                                <span>Sin SKU</span>
                              )}{' '}
                              · Qty {item.quantity}
                            </div>
                          </div>
                          <div className="text-right text-xs">
                            <div className="text-muted-foreground">
                              {formatCOP(item.unitPrice)} c/u
                            </div>
                            <div className="font-semibold">
                              {formatCOP(item.total)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Envíos y guías */}
                {order.shipments?.length > 0 && (
                  <section className="space-y-2">
                    <SectionTitle icon={Truck}>Envíos y seguimiento</SectionTitle>
                    <div className="space-y-2">
                      {order.shipments.map((sh: ShipmentView) => (
                        <div
                          key={sh.id}
                          className="rounded-lg border bg-card p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-xs">
                              <Building2 className="size-3.5 text-muted-foreground" />
                              <span className="font-medium">
                                {sh.carrier
                                  ? CARRIER_LABEL[sh.carrier] ?? sh.carrier
                                  : 'Transportadora no asignada'}
                              </span>
                              <Badge variant="outline" className="text-[10px]">
                                {SHIPMENT_STATUS_LABEL[sh.status] ?? sh.status}
                              </Badge>
                            </div>
                            {sh.guideNumber && (
                              <div className="font-mono text-xs text-muted-foreground">
                                #{sh.guideNumber}
                              </div>
                            )}
                          </div>
                          {sh.trackingEvents?.length > 0 && (
                            <ol className="mt-3 space-y-2 border-l border-border pl-3">
                              {sh.trackingEvents
                                .slice()
                                .sort(
                                  (
                                    a: TrackingEventView,
                                    b: TrackingEventView,
                                  ) =>
                                    new Date(b.occurredAt).getTime() -
                                    new Date(a.occurredAt).getTime(),
                                )
                                .map((ev: TrackingEventView) => (
                                  <li
                                    key={ev.id}
                                    className="relative text-xs"
                                  >
                                    <CircleDot className="absolute -left-[18px] size-3 text-muted-foreground" />
                                    <div className="font-medium text-foreground">
                                      {ev.message ?? ev.status}
                                    </div>
                                    <div className="text-muted-foreground">
                                      {ev.city ? `${ev.city} · ` : ''}
                                      {formatDate(ev.occurredAt)}
                                    </div>
                                  </li>
                                ))}
                            </ol>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Transacciones */}
                {order.transactions?.length > 0 && (
                  <section className="space-y-2">
                    <SectionTitle icon={CreditCard}>Transacciones</SectionTitle>
                    <div className="space-y-2">
                      {order.transactions.map((tx: TransactionView) => (
                        <div
                          key={tx.id}
                          className="rounded-lg border bg-card p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs">
                              <span className="font-medium">{tx.provider}</span>
                              <span className="text-muted-foreground">
                                {' '}
                                · {TX_TYPE_LABEL[tx.type] ?? tx.type}
                              </span>
                            </div>
                            <Badge
                              variant={TX_STATUS_VARIANT[tx.status] ?? 'outline'}
                              className={txStatusClass(tx.status)}
                            >
                              {TX_STATUS_LABEL[tx.status] ?? tx.status}
                            </Badge>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-xs">
                            <span className="font-mono text-muted-foreground">
                              {tx.reference ?? tx.providerTxId ?? '—'}
                            </span>
                            <span className="font-semibold">
                              {formatCOP(tx.amount)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Timeline de estados */}
                <section className="space-y-2">
                  <SectionTitle icon={Clock}>Bitácora de estados</SectionTitle>
                  {statusLogsDesc.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Sin eventos registrados.
                    </p>
                  ) : (
                    <ol className="space-y-3 border-l border-border pl-4">
                      {statusLogsDesc.map(
                        (log: StatusLogView, idx: number) => (
                          <li key={log.id} className="relative">
                            <span
                              className={`absolute -left-[21px] top-1 size-3 rounded-full border-2 ${
                                idx === 0
                                  ? 'border-foreground bg-foreground'
                                  : 'border-muted-foreground bg-background'
                              }`}
                            />
                            <div className="flex flex-wrap items-center gap-1.5">
                              {log.fromStatus ? (
                                <>
                                  <StatusBadge
                                    status={log.fromStatus}
                                    size="sm"
                                  />
                                  <ArrowRight className="size-3 text-muted-foreground" />
                                  <StatusBadge
                                    status={log.toStatus}
                                    size="sm"
                                  />
                                </>
                              ) : (
                                <StatusBadge status={log.toStatus} size="sm" />
                              )}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {formatDate(log.createdAt)} · por{' '}
                              {actorLabel(log.actor)}
                            </div>
                            {log.reason && (
                              <div className="mt-1 text-xs text-foreground">
                                “{log.reason}”
                              </div>
                            )}
                          </li>
                        ),
                      )}
                    </ol>
                  )}
                </section>

                {/* Acciones / transiciones */}
                <section className="space-y-2">
                  <SectionTitle icon={ArrowRight}>Acciones</SectionTitle>
                  {allowedTransitions.length === 0 ? (
                    <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                      <Ban className="size-4" />
                      Este pedido está en un estado terminal: no tiene
                      transiciones disponibles.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {allowedTransitions.map((target) => (
                        <Button
                          key={target}
                          type="button"
                          variant={
                            target === 'CANCELADO' ? 'destructive' : 'default'
                          }
                          className="justify-between"
                          onClick={() => setTransitionTarget(target)}
                        >
                          <span className="flex items-center gap-2">
                            <ArrowRight className="size-4" />
                            Mover a{' '}
                            <span className="font-semibold">
                              {ORDER_STATE_LABELS[
                                target as keyof typeof ORDER_STATE_LABELS
                              ] ?? target}
                            </span>
                          </span>
                          <StatusBadge status={target} size="sm" />
                        </Button>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>

    {/* Diálogo de confirmación de transición — fuera del Sheet para evitar conflicto de focus trap */}
    {order && transitionTarget && (
      <TransitionDialog
        open={!!transitionTarget}
        onClose={() => setTransitionTarget(null)}
        orderId={order.id}
        orderNumber={order.orderNumber}
        currentStatus={order.status}
        targetStatus={transitionTarget}
        onSuccess={handleTransitionSuccess}
        modal={false}
      />
    )}
    </>
  )
}

// ------------------------------------------------------------
// Skeleton de carga
// ------------------------------------------------------------

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <div className="rounded-lg border p-3">
            <Skeleton className="mb-2 h-3 w-3/4" />
            <Skeleton className="mb-2 h-3 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------
// Tipos de vista (derivados del payload del API)
// ------------------------------------------------------------

interface OrderItemView {
  id: string
  title: string
  sku: string | null
  quantity: number
  unitPrice: number
  total: number
}

interface TrackingEventView {
  id: string
  status: string
  message: string | null
  city: string | null
  occurredAt: string
}

interface ShipmentView {
  id: string
  carrier: string | null
  guideNumber: string | null
  status: string
  trackingEvents: TrackingEventView[]
}

interface TransactionView {
  id: string
  provider: string
  type: string
  amount: number
  status: string
  reference: string | null
  providerTxId: string | null
}

interface StatusLogView {
  id: string
  fromStatus: string | null
  toStatus: string
  reason: string | null
  actor: string | null
  createdAt: string
}
