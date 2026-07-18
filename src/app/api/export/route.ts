// ============================================================
// /api/export — Exportación CSV
// ============================================================
// GET — genera un CSV con los registros solicitados.
//   Query params:
//     - type: orders | customers | returns  (default: orders)
//     - limit: hasta 1000 (default 200)
//     - search / status / classification: filtros opcionales
//
// Devuelve `Content-Type: text/csv` con `Content-Disposition: attachment`.
// Requiere auth.

import { NextResponse } from 'next/server'
import { getCurrentUserOrFallback } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { listOrders } from '@/modules/orders/order.service'
import { listCustomers } from '@/modules/customers/customer.service'
import { getReturnsList } from '@/modules/analytics/returns.metrics'
import { ORDER_STATUSES } from '@/lib/validation'

const VALID_TYPES = new Set(['orders', 'customers', 'returns'])

/** Escapa un valor para CSV: si contiene coma, salto de línea o comillas, lo envuelve en comillas dobles y duplica las comillas internas. */
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = typeof value === 'string' ? value : String(value)
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function row(values: unknown[]): string {
  return values.map(csvEscape).join(',')
}

function fmtDate(d: Date | string | null): string {
  if (!d) return ''
  try {
    const date = typeof d === 'string' ? new Date(d) : d
    return date.toISOString()
  } catch {
    return ''
  }
}

export async function GET(request: Request) {
  const user = await getCurrentUserOrFallback()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const url = new URL(request.url)
  const params = url.searchParams
  const type = params.get('type') ?? 'orders'
  if (!VALID_TYPES.has(type)) {
    return NextResponse.json(
      { error: `Tipo inválido: ${type}. Valores permitidos: orders, customers, returns` },
      { status: 400 },
    )
  }

  const limitParam = params.get('limit')
  const limit = Math.min(Math.max(limitParam ? Number(limitParam) : 200, 1), 1000)
  if (!Number.isFinite(limit)) {
    return NextResponse.json({ error: 'limit inválido' }, { status: 400 })
  }
  const search = params.get('search') ?? undefined
  const status = params.get('status') ?? undefined
  const classification = params.get('classification') ?? undefined

  if (type === 'orders' && status && status !== 'ALL' && !ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number])) {
    return NextResponse.json({ error: `Estado inválido: ${status}` }, { status: 400 })
  }

  try {
    let csv = ''

    if (type === 'orders') {
      const { orders } = await listOrders({
        search,
        status: status === 'ALL' ? undefined : status || undefined,
        limit,
        offset: 0,
      })
      csv = [
        row([
          'orderNumber',
          'status',
          'paymentMethod',
          'customerName',
          'customerEmail',
          'customerPhone',
          'city',
          'subtotal',
          'shippingCost',
          'transportCost',
          'total',
          'codPaid',
          'placedAt',
          'paidAt',
          'shippedAt',
          'deliveredAt',
        ]),
        ...orders.map((o) =>
          row([
            o.orderNumber,
            o.status,
            o.paymentMethod,
            o.customer?.name ?? '',
            o.customer?.email ?? '',
            o.customer?.phone ?? '',
            o.city ?? '',
            o.subtotal,
            o.shippingCost,
            o.transportCost,
            o.total,
            o.codPaid,
            fmtDate(o.placedAt),
            fmtDate(o.paidAt),
            fmtDate(o.shippedAt),
            fmtDate(o.deliveredAt),
          ]),
        ),
      ].join('\n')
    } else if (type === 'customers') {
      const { customers } = await listCustomers({
        search,
        classification: classification === 'ALL' ? undefined : classification || undefined,
        limit,
        offset: 0,
        sortBy: 'createdAt',
        sortDir: 'desc',
      })
      csv = [
        row([
          'id',
          'name',
          'email',
          'phone',
          'city',
          'classification',
          'totalSpent',
          'ordersCount',
          'lastOrderAt',
          'createdAt',
        ]),
        ...customers.map((c) =>
          row([
            c.id,
            c.name,
            c.email ?? '',
            c.phone ?? '',
            c.city ?? '',
            c.classification,
            c.totalSpent,
            c.ordersCount,
            fmtDate(c.lastOrderAt),
            fmtDate(c.createdAt),
          ]),
        ),
      ].join('\n')
    } else {
      // returns
      const { returns } = await getReturnsList({
        search,
        status: status === 'ALL' ? undefined : status || undefined,
        limit,
        offset: 0,
      })
      csv = [
        row([
          'id',
          'orderNumber',
          'orderStatus',
          'productTitle',
          'productSku',
          'reason',
          'city',
          'lostValue',
          'status',
          'createdAt',
        ]),
        ...returns.map((r) =>
          row([
            r.id,
            r.orderNumber,
            r.orderStatus,
            r.productTitle ?? '',
            r.productSku ?? '',
            r.reason ?? '',
            r.city ?? '',
            r.lostValue,
            r.status,
            fmtDate(r.createdAt),
          ]),
        ),
      ].join('\n')
    }

    const filename = `${type}-${new Date().toISOString().slice(0, 10)}.csv`
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    logger.error('api.export error', {
      type,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Error al exportar' }, { status: 500 })
  }
}
