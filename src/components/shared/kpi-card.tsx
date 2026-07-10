// ============================================================
// kpi-card.tsx — Reusable KPI Card
// ============================================================
// Card con: título (muted, pequeño), valor grande, subtítulo opcional,
// icono top-right, trend opcional (verde ▲ / rojo ▼), estado de carga.

import * as React from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/format'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export interface KPITrend {
  /** Porcentaje a mostrar (ej: 12.5). */
  value: number
  /** true → positivo (verde ▲), false → negativo (rojo ▼). */
  positive: boolean
}

export interface KPICardProps {
  title: string
  value: string
  subtitle?: string
  icon?: React.ReactNode
  trend?: KPITrend
  loading?: boolean
  className?: string
}

export function KPICard({
  title,
  value,
  subtitle,
  icon,
  trend,
  loading = false,
  className,
}: KPICardProps) {
  return (
    <Card className={cn('gap-0 p-4 md:p-5', className)}>
      <CardContent className="p-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {title}
            </p>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p
                className="truncate text-2xl font-semibold tracking-tight text-foreground"
                title={value}
              >
                {value}
              </p>
            )}
            {(subtitle || trend) && !loading && (
              <div className="flex items-center gap-2 text-xs">
                {trend && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-0.5 font-medium',
                      trend.positive
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400',
                    )}
                  >
                    {trend.positive ? (
                      <ArrowUp className="size-3" />
                    ) : (
                      <ArrowDown className="size-3" />
                    )}
                    {Math.abs(trend.value).toFixed(1)}%
                  </span>
                )}
                {subtitle && (
                  <span className="truncate text-muted-foreground">
                    {subtitle}
                  </span>
                )}
              </div>
            )}
          </div>
          {icon && (
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
              aria-hidden
            >
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
