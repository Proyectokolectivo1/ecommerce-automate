'use client'

// ============================================================
// sales-trend-chart.tsx — Area chart of sales (14 days)
// ============================================================
// Recharts AreaChart con dos Y-axes: total (izq) + count (der).
// Usa CSS vars chart-1 (área total) y chart-2 (línea count).

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCOP, formatNumber } from '@/lib/format'

export interface SalesTrendDatum {
  date: string
  label: string
  total: number
  count: number
}

interface SalesTrendChartProps {
  data: SalesTrendDatum[]
}

interface TooltipPayloadEntry {
  name?: string
  value?: number
  dataKey?: string | number
  color?: string
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null
  const total = payload.find((p) => p.dataKey === 'total')?.value ?? 0
  const count = payload.find((p) => p.dataKey === 'count')?.value ?? 0
  return (
    <div className="rounded-md border border-border bg-popover p-3 text-xs shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{label}</p>
      <p className="text-muted-foreground">
        Ventas:{' '}
        <span className="font-semibold text-foreground">
          {formatCOP(total)}
        </span>
      </p>
      <p className="text-muted-foreground">
        Pedidos:{' '}
        <span className="font-semibold text-foreground">
          {formatNumber(count)}
        </span>
      </p>
    </div>
  )
}

export function SalesTrendChart({ data }: SalesTrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart
        data={data}
        margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
      >
        <defs>
          <linearGradient id="salesTotalGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border)"
          vertical={false}
        />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          tickMargin={8}
        />
        <YAxis
          yAxisId="left"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          tickFormatter={(v: number) =>
            v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`
          }
          width={48}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          width={32}
        />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
        />
        <Area
          yAxisId="left"
          type="monotone"
          dataKey="total"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#salesTotalGradient)"
          name="Ventas"
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="count"
          stroke="var(--chart-2)"
          strokeWidth={2}
          dot={{ r: 2, fill: 'var(--chart-2)', strokeWidth: 0 }}
          activeDot={{ r: 4 }}
          name="Pedidos"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
