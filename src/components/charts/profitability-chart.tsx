'use client'

// ============================================================
// profitability-chart.tsx — Bar chart with 3 bars (Ingresos, Costos, Utilidad Neta)
// ============================================================
// Recharts BarChart simple, 3 barras verticales.

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
import { formatCOP } from '@/lib/format'

export interface ProfitabilityDatum {
  revenue: number
  costs: {
    product: number
    shipping: number
    advertising: number
    operation: number
    total: number
  }
  grossProfit: number
  netProfit: number
}

interface ProfitabilityChartProps {
  data: ProfitabilityDatum
}

interface TooltipPayloadEntry {
  payload?: { name: string; value: number; color: string }
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
      <p className="font-medium text-popover-foreground">{p.name}</p>
      <p className="text-muted-foreground">
        Monto:{' '}
        <span className="font-semibold text-foreground">
          {formatCOP(p.value)}
        </span>
      </p>
    </div>
  )
}

export function ProfitabilityChart({ data }: ProfitabilityChartProps) {
  const chartData = [
    { name: 'Ingresos', value: data.revenue, color: 'var(--chart-2)' },
    { name: 'Costos', value: data.costs.total, color: 'var(--chart-5)' },
    {
      name: 'Utilidad Neta',
      value: data.netProfit,
      color: data.netProfit >= 0 ? 'var(--chart-2)' : 'var(--chart-1)',
    },
  ]

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart
        data={chartData}
        margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border)"
          vertical={false}
        />
        <XAxis
          dataKey="name"
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
          content={<CustomTooltip />}
          cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={80}>
          {chartData.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
