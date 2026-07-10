'use client'

// ============================================================
// orders-status-chart.tsx — Horizontal bar chart of orders by status
// ============================================================
// Recharts BarChart con layout="vertical" (barras horizontales) para
// legibilidad de los 8 estados.

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatNumber } from '@/lib/format'

export interface OrdersStatusDatum {
  status: string
  label: string
  count: number
  color: string
}

interface OrdersStatusChartProps {
  data: OrdersStatusDatum[]
}

interface TooltipPayloadEntry {
  payload?: OrdersStatusDatum
  value?: number
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: TooltipPayloadEntry[]
}) {
  if (!active || !payload || payload.length === 0) return null
  const p = payload[0]?.payload
  if (!p) return null
  return (
    <div className="rounded-md border border-border bg-popover p-3 text-xs shadow-md">
      <p className="font-medium text-popover-foreground">{p.label}</p>
      <p className="text-muted-foreground">
        Pedidos:{' '}
        <span className="font-semibold text-foreground">
          {formatNumber(p.count)}
        </span>
      </p>
    </div>
  )
}

export function OrdersStatusChart({ data }: OrdersStatusChartProps) {
  // Truncamos etiquetas largas para que quepan en el eje Y.
  const formatted = data.map((d) => ({
    ...d,
    shortLabel:
      d.label.length > 22 ? `${d.label.slice(0, 21)}…` : d.label,
  }))

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart
        data={formatted}
        layout="vertical"
        margin={{ top: 0, right: 24, bottom: 0, left: 8 }}
        barCategoryGap={6}
      >
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="shortLabel"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          width={140}
        />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20}>
          {formatted.map((entry) => (
            <Cell key={entry.status} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
