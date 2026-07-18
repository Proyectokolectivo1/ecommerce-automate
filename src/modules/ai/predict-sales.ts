// ============================================================
// predict-sales.ts — Sales prediction (LLM + heuristic fallback)
// ============================================================
// Genera una predicción de ventas de los próximos 7 días a partir
// de la serie histórica de los últimos 30 días.
//
// Estrategia:
//   1. `calculatePrediction(history)` — función PURA: usa media móvil
//      + tendencia lineal simple (least squares) sobre los últimos N
//      días. Devuelve forecast[7], avgDailyRevenue, trend (% y signo),
//      totalProjected7d y un score de confianza.
//   2. `generateSalesPrediction()` — orquestador: toma datos de la BD,
//      arma un prompt, llama al LLM vía `callLLM`. Si el LLM falla o no
//      hay suficientes datos, usa el resultado heurístico y persiste
//      el insight con `aiGenerated: false`.

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import type { AiInsightType } from '@/lib/validation'
import { callLLM, saveInsight, type AiInsightResult } from './ai.service'

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export interface DailySalesPoint {
  date: string // YYYY-MM-DD
  revenue: number
  count: number
}

export type TrendDirection = 'up' | 'down' | 'flat'

export interface SalesPrediction {
  forecast: number[] // 7 valores, uno por día
  avgDailyRevenue: number
  trend: TrendDirection
  trendPercentage: number // -100..+100
  totalProjected7d: number
  confidence: number // 0..1
}

const HISTORY_DAYS = 30
const FORECAST_DAYS = 7

// ------------------------------------------------------------
// Pure prediction (no DB, no LLM)
// ------------------------------------------------------------

function mean(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

function stdDev(arr: number[]): number {
  if (arr.length === 0) return 0
  const m = mean(arr)
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Predicción pura basada en serie diaria de ventas.
 * - Tendencia: regresión lineal simple (least squares) sobre los
 *   últimos N días. Si la pendiente es cercana a 0 → 'flat'.
 * - Forecast: combinación de media móvil (7d) + proyección de la
 *   tendencia para los próximos 7 días.
 * - Confianza: inversamente proporcional al coeficiente de variación
 *   (σ/μ) de la serie histórica. Mínimo 0.2 si hay datos.
 *
 * @param history Serie diaria ordenada ASC por fecha. Si tiene menos
 *   de 7 puntos, la confianza es muy baja y el forecast se basa solo
 *   en la media.
 */
export function calculatePrediction(history: DailySalesPoint[]): SalesPrediction {
  const revenues = history.map((p) => p.revenue)
  const n = revenues.length

  // Caso vacío: todo ceros.
  if (n === 0) {
    return {
      forecast: new Array(FORECAST_DAYS).fill(0),
      avgDailyRevenue: 0,
      trend: 'flat',
      trendPercentage: 0,
      totalProjected7d: 0,
      confidence: 0,
    }
  }

  const avgDailyRevenue = round2(mean(revenues))

  // Regresión lineal: y = a + b*x
  const xs = revenues.map((_, i) => i)
  const xMean = mean(xs)
  const yMean = mean(revenues)
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (revenues[i] - yMean)
    den += (xs[i] - xMean) ** 2
  }
  const slope = den === 0 ? 0 : num / den // ingresos/día
  const intercept = yMean - slope * xMean

  // Trend percentage: (pendiente proyectada a 7 días) / media, * 100.
  let trendPct = avgDailyRevenue > 0 ? (slope * FORECAST_DAYS / avgDailyRevenue) * 100 : 0
  trendPct = Math.max(-100, Math.min(100, round2(trendPct)))
  const trend: TrendDirection =
    Math.abs(trendPct) < 3 ? 'flat' : trendPct > 0 ? 'up' : 'down'

  // Forecast 7 días: media móvil 7d (o todas si hay menos) + tendencia.
  const last7 = revenues.slice(-7)
  const ma = mean(last7)
  const forecast: number[] = []
  for (let i = 1; i <= FORECAST_DAYS; i++) {
    const projected = ma + slope * (n - 1 + i - xMean)
    // No permitir ingresos negativos.
    forecast.push(round2(Math.max(0, projected)))
  }

  const totalProjected7d = round2(forecast.reduce((s, v) => s + v, 0))

  // Confianza: base alta si hay muchos datos y baja varianza.
  const sd = stdDev(revenues)
  const cv = avgDailyRevenue > 0 ? sd / avgDailyRevenue : 1
  let confidence = 1 - Math.min(1, cv)
  // Penaliza series cortas.
  if (n < 14) confidence *= 0.5
  else if (n < 21) confidence *= 0.75
  confidence = round2(Math.max(0.1, Math.min(0.95, confidence)))

  return {
    forecast,
    avgDailyRevenue,
    trend,
    trendPercentage: trendPct,
    totalProjected7d,
    confidence,
  }
}

// ------------------------------------------------------------
// History fetcher
// ------------------------------------------------------------

/** Trae la serie diaria de los últimos N días (no cancelados/devueltos). */
export async function getSalesHistory(days: number = HISTORY_DAYS): Promise<DailySalesPoint[]> {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const start = new Date(today)
    start.setDate(today.getDate() - (days - 1))

    const orders = await db.order.findMany({
      where: {
        status: { notIn: ['CANCELADO', 'DEVUELTO'] },
        placedAt: { gte: start },
      },
      select: { total: true, placedAt: true },
    })

    const byDate = new Map<string, { revenue: number; count: number }>()
    for (const o of orders) {
      const d = new Date(o.placedAt)
      d.setHours(0, 0, 0, 0)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      const key = `${y}-${m}-${dd}`
      const entry = byDate.get(key) ?? { revenue: 0, count: 0 }
      entry.revenue += o.total
      entry.count += 1
      byDate.set(key, entry)
    }

    // Rellena días faltantes con ceros.
    const result: DailySalesPoint[] = []
    for (let i = 0; i < days; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      const key = `${y}-${m}-${dd}`
      const e = byDate.get(key) ?? { revenue: 0, count: 0 }
      result.push({
        date: key,
        revenue: round2(e.revenue),
        count: e.count,
      })
    }
    return result
  } catch (err) {
    logger.error('ai.getSalesHistory error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

// ------------------------------------------------------------
// Orchestration
// ------------------------------------------------------------

const SYSTEM_PROMPT = `Eres un analista de negocio especializado en ecommerce. Analizas series de ventas diarias y generas predicciones claras y accionables. Responde SIEMPRE en español, en formato Markdown conciso (máx 400 palabras), sin inventar cifras fuera del JSON provisto. Estructura sugerida: Resumen ejecutivo (2-3 líneas), Pronóstico 7 días (tabla), Tendencia, Factores clave, Recomendaciones (3 bullets).`

export async function generateSalesPrediction(): Promise<AiInsightResult> {
  const history = await getSalesHistory(HISTORY_DAYS)
  const prediction = calculatePrediction(history)

  // Si hay muy pocos datos, no llamamos al LLM (no tendría contexto).
  const hasEnoughData = history.filter((p) => p.revenue > 0).length >= 5

  let content: string
  let aiGenerated = false

  if (hasEnoughData) {
    const userPrompt = `Serie diaria de ventas (últimos ${HISTORY_DAYS} días, formato YYYY-MM-DD: ingresos COP, #pedidos):
${history.map((p) => `${p.date}: $${p.revenue} (${p.count} pedidos)`).join('\n')}

Resultado del cálculo heurístico:
- Promedio diario: $${prediction.avgDailyRevenue}
- Tendencia: ${prediction.trend} (${prediction.trendPercentage > 0 ? '+' : ''}${prediction.trendPercentage}%)
- Proyección 7 días: $${prediction.totalProjected7d}
- Confianza (0-1): ${prediction.confidence}

Genera un análisis de predicción de ventas en Markdown. Sé conciso, accionable y específico. No inventes números: usa los del JSON.`
    const llm = await callLLM(SYSTEM_PROMPT, userPrompt)
    if (llm && llm.length > 50) {
      content = llm
      aiGenerated = true
    } else {
      content = buildFallbackContent(prediction, history)
      aiGenerated = false
    }
  } else {
    content = buildFallbackContent(prediction, history)
    aiGenerated = false
  }

  return saveInsight({
    type: 'SALES_PREDICTION' as AiInsightType,
    title: `Predicción de ventas — ${prediction.totalProjected7d.toLocaleString('es-CO')} COP en 7 días (${prediction.trend === 'up' ? '↑' : prediction.trend === 'down' ? '↓' : '→'} ${prediction.trendPercentage > 0 ? '+' : ''}${prediction.trendPercentage}%)`,
    content,
    aiGenerated,
    metadata: {
      aiGenerated,
      prediction,
      historyDays: HISTORY_DAYS,
      historySample: history.slice(-7),
      generatedAt: new Date().toISOString(),
    },
  })
}

function buildFallbackContent(
  prediction: SalesPrediction,
  history: DailySalesPoint[],
): string {
  const arrow = prediction.trend === 'up' ? '📈' : prediction.trend === 'down' ? '📉' : '➡️'
  const rows = prediction.forecast
    .map((v, i) => {
      const d = new Date()
      d.setDate(d.getDate() + i + 1)
      const label = d.toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: '2-digit' })
      return `| ${label} | $${v.toLocaleString('es-CO')} |`
    })
    .join('\n')

  const last7 = history.slice(-7)
  const recentSum = last7.reduce((s, p) => s + p.revenue, 0)

  return `## Predicción de Ventas — Próximos 7 días

### Resumen
- **Promedio diario (30d):** $${prediction.avgDailyRevenue.toLocaleString('es-CO')} COP
- **Tendencia:** ${arrow} ${prediction.trend === 'up' ? 'Ascendente' : prediction.trend === 'down' ? 'Descendente' : 'Estable'} (${prediction.trendPercentage > 0 ? '+' : ''}${prediction.trendPercentage}%)
- **Proyección 7 días:** $${prediction.totalProjected7d.toLocaleString('es-CO')} COP
- **Confianza:** ${(prediction.confidence * 100).toFixed(0)}%
- **Ventas últimos 7 días:** $${recentSum.toLocaleString('es-CO')} COP

### Pronóstico diario
| Día | Ingreso proyectado |
|-----|-------------------:|
${rows}

### Notas
- Predicción generada por modelo heurístico (media móvil + regresión lineal).
- La confianza disminuye si la varianza histórica es alta o si hay pocos datos.
- Recomendable revisar campañas de publicidad y nivel de inventario antes de proyectar compras.`
}
