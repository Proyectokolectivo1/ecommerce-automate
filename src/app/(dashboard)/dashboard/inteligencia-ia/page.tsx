'use client'

// ============================================================
// /dashboard/inteligencia-ia — AI Insights page
// ============================================================
// Client component. KPIs, 4 tarjetas de generación (predicción,
// anomalías, resumen, análisis de productos), lista colapsable
// de insights con markdown renderizado.
//
// Endpoints consumidos:
//   GET  /api/ai/insights
//   POST /api/ai/predict     -> AiInsightResult
//   POST /api/ai/anomalies   -> AiInsightResult
//   POST /api/ai/summary     -> AiInsightResult
//   POST /api/ai/products    -> AiInsightResult

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import {
  Sparkles,
  Brain,
  AlertTriangle,
  FileText,
  PackageSearch,
  Loader2,
  Inbox,
  ChevronDown,
  Bot,
  Zap,
  Clock,
} from 'lucide-react'

import { KPICard } from '@/components/shared/kpi-card'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn, formatDate } from '@/lib/format'

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

interface AiInsight {
  id: string
  type: string // SALES_PREDICTION | ANOMALY | MONTHLY_SUMMARY | PRODUCT_ANALYSIS
  title: string
  content: string // markdown
  aiGenerated: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
}

interface AiInsightsResponse {
  insights: AiInsight[]
  total: number
  stats: AiStats
  filters: unknown
}

interface AiInsightResult {
  id?: string
  type?: string
  title?: string
  content?: string
  aiGenerated?: boolean
  fallback?: boolean
  error?: string
}

interface AiStats {
  total: number
  byType: Record<string, number>
  aiGenerated: number
  fallback: number
  lastGeneratedAt: string | null
}

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  SALES_PREDICTION: 'Predicción',
  ANOMALY: 'Anomalía',
  MONTHLY_SUMMARY: 'Resumen mensual',
  PRODUCT_ANALYSIS: 'Análisis productos',
}

const TYPE_BADGE: Record<string, string> = {
  SALES_PREDICTION:
    'border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  ANOMALY:
    'border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  MONTHLY_SUMMARY:
    'border-teal-300 bg-teal-100 text-teal-700 dark:border-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  PRODUCT_ANALYSIS:
    'border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
}

function typeBadgeClass(t: string): string {
  return TYPE_BADGE[t] ?? 'border-border bg-muted text-muted-foreground'
}

type GenKey = 'predict' | 'anomalies' | 'summary' | 'products'

interface GenCard {
  key: GenKey
  title: string
  description: string
  color: 'emerald' | 'amber' | 'teal' | 'violet'
  icon: React.ReactNode
  endpoint: string
}

const GEN_CARDS: GenCard[] = [
  {
    key: 'predict',
    title: 'Predicción de ventas',
    description: 'Proyecta ventas de los próximos 7 días usando el modelo IA.',
    color: 'emerald',
    icon: <Brain className="size-5" />,
    endpoint: '/api/ai/predict',
  },
  {
    key: 'anomalies',
    title: 'Detección de anomalías',
    description: 'Identifica patrones inusuales en pedidos, devoluciones y costos.',
    color: 'amber',
    icon: <AlertTriangle className="size-5" />,
    endpoint: '/api/ai/anomalies',
  },
  {
    key: 'summary',
    title: 'Resumen mensual',
    description: 'Genera un resumen ejecutivo del último mes con IA.',
    color: 'teal',
    icon: <FileText className="size-5" />,
    endpoint: '/api/ai/summary',
  },
  {
    key: 'products',
    title: 'Análisis de productos',
    description: 'Análisis profundo del catálogo con oportunidades de optimización.',
    color: 'violet',
    icon: <PackageSearch className="size-5" />,
    endpoint: '/api/ai/products',
  },
]

const COLOR_MAP: Record<string, string> = {
  emerald:
    'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
  amber:
    'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
  teal: 'border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-900/20 dark:text-teal-300',
  violet:
    'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-900/20 dark:text-violet-300',
}

// ------------------------------------------------------------
// Page
// ------------------------------------------------------------

export default function InteligenciaIaPage() {
  const qc = useQueryClient()
  const [pendingKey, setPendingKey] = useState<GenKey | null>(null)

  // Stats — derived from listing
  const insightsQuery = useQuery<AiInsightsResponse>({
    queryKey: ['ai-insights'],
    queryFn: async () => {
      const res = await fetch('/api/ai/insights')
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err?.error ?? `Error ${res.status}`)
      }
      return res.json() as Promise<AiInsightsResponse>
    },
  })

  const insights = insightsQuery.data?.insights ?? []
  const total = insightsQuery.data?.total ?? 0
  const stats: AiStats = insightsQuery.data?.stats ?? {
    total: 0,
    byType: {},
    aiGenerated: 0,
    fallback: 0,
    lastGeneratedAt: null,
  }

  // Generation mutation — single endpoint at a time
  const generateMutation = useMutation({
    mutationFn: async ({ endpoint, key }: { endpoint: string; key: GenKey }) => {
      setPendingKey(key)
      const res = await fetch(endpoint, { method: 'POST' })
      const json = (await res.json().catch(() => ({}))) as AiInsightResult
      if (!res.ok) {
        throw new Error(json?.error ?? `Error ${res.status}`)
      }
      return json
    },
    onSuccess: (data, vars) => {
      if (data.fallback) {
        toast.info('Insight generado en modo fallback', {
          description: 'La IA no estuvo disponible; se usó un resumen predefinido.',
        })
      } else {
        toast.success(`${GEN_CARDS.find((g) => g.key === vars.key)?.title} generado`)
      }
      void qc.invalidateQueries({ queryKey: ['ai-insights'] })
    },
    onError: (err: unknown) => {
      toast.error('No se pudo generar el insight', {
        description: err instanceof Error ? err.message : undefined,
      })
    },
    onSettled: () => setPendingKey(null),
  })

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Sparkles className="size-6 text-violet-500" aria-hidden />
            Inteligencia IA
          </h1>
          <p className="text-sm text-muted-foreground">
            Insights generados por IA · predicciones, anomalías y resúmenes.
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {stats.total} insights
        </Badge>
      </header>

      {/* KPIs */}
      <section
        aria-label="KPIs de IA"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <KPICard
          title="Total insights"
          value={String(stats.total)}
          subtitle="Registrados"
          icon={<Sparkles className="size-5" />}
          loading={insightsQuery.isLoading}
        />
        <KPICard
          title="Generados por IA"
          value={String(stats.aiGenerated)}
          subtitle="Modelo IA real"
          icon={<Bot className="size-5" />}
          loading={insightsQuery.isLoading}
        />
        <KPICard
          title="Fallback"
          value={String(stats.fallback)}
          subtitle="Resúmenes predefinidos"
          icon={<Zap className="size-5" />}
          loading={insightsQuery.isLoading}
        />
        <KPICard
          title="Última generación"
          value={stats.lastGeneratedAt ? formatDate(stats.lastGeneratedAt) : '—'}
          subtitle="Más reciente"
          icon={<Clock className="size-5" />}
          loading={insightsQuery.isLoading}
        />
      </section>

      {/* Generation cards */}
      <section aria-label="Generación de insights" className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {GEN_CARDS.map((card) => (
          <Card key={card.key} className={cn('border-2 p-5', COLOR_MAP[card.color])}>
            <CardContent className="p-0 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold leading-tight">
                    {card.title}
                  </h3>
                  <p className="text-xs opacity-80">{card.description}</p>
                </div>
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-background/60">
                  {card.icon}
                </div>
              </div>
              <Button
                onClick={() =>
                  generateMutation.mutate({
                    endpoint: card.endpoint,
                    key: card.key,
                  })
                }
                disabled={pendingKey !== null}
                className="w-full gap-2"
                variant="default"
              >
                {pendingKey === card.key ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {pendingKey === card.key ? 'Generando…' : 'Generar'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Insights list */}
      <Card className="gap-0 p-0">
        <CardHeader className="border-b p-4">
          <CardTitle className="text-base">Historial de insights</CardTitle>
          <CardDescription>
            Lista colapsable con markdown renderizado
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {insightsQuery.isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : insightsQuery.isError ? (
            <div className="flex flex-col items-center gap-2 p-12 text-center text-sm">
              <Inbox className="size-8 text-muted-foreground" />
              <p className="font-medium">No se pudieron cargar los insights.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => insightsQuery.refetch()}
              >
                Reintentar
              </Button>
            </div>
          ) : insights.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <Sparkles className="size-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Sin insights generados</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Genera tu primer insight usando las tarjetas de arriba.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {insights.map((insight) => (
                <InsightItem key={insight.id} insight={insight} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function isFallback(insight: AiInsight): boolean {
  // The `aiGenerated` boolean comes directly from the API.
  // When false, the insight was generated by the local fallback heuristic.
  return !insight.aiGenerated
}

// ------------------------------------------------------------
// Insight item (collapsible with markdown)
// ------------------------------------------------------------

function InsightItem({ insight }: { insight: AiInsight }) {
  const [open, setOpen] = useState(false)
  const fallback = isFallback(insight)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="p-4">
        <CollapsibleTrigger asChild>
          <button
            className="flex w-full items-start justify-between gap-3 text-left"
            aria-expanded={open}
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cn('border', typeBadgeClass(insight.type))}>
                  {TYPE_LABELS[insight.type] ?? insight.type}
                </Badge>
                {fallback ? (
                  <Badge
                    variant="outline"
                    className="border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-300"
                  >
                    <Zap className="size-3" />
                    Fallback
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  >
                    <Bot className="size-3" />
                    Generado por IA
                  </Badge>
                )}
              </div>
              <p className="text-sm font-medium text-foreground line-clamp-1">
                {insight.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDate(insight.createdAt)}
              </p>
            </div>
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform',
                open && 'rotate-180',
              )}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <Separator className="my-3" />
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed text-foreground">
            <ReactMarkdown>{insight.content}</ReactMarkdown>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
