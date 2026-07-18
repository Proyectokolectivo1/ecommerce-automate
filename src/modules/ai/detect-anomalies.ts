// ============================================================
// detect-anomalies.ts — Anomaly detection (spikes, drops, returns)
// ============================================================
// Detecta anomalías en ventas y devoluciones usando reglas
// estadísticas simples:
//   - Spike de ventas: día con revenue > media + 2σ (sobre 30d).
//   - Drop de ventas: día con revenue < media − 2σ.
//   - Devoluciones altas: día con >3 devoluciones registradas.
//
// `detectAnomalies()` es el detector puro (devuelve el reporte).
// `generateAnomalyReport()` lo orquesta: llama al LLM con el reporte
// y persiste un insight ANOMALY con markdown.

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import type { AiInsightType } from '@/lib/validation'
import { callLLM, saveInsight, type AiInsightResult } from './ai.service'
import { getSalesHistory, type DailySalesPoint } from './predict-sales'

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export type AnomalyKind = 'SALES_SPIKE' | 'SALES_DROP' | 'HIGH_RETURNS'

export interface Anomaly {
  kind: AnomalyKind
  date: string // YYYY-MM-DD
  value: number
  threshold: number
  description: string
}

export interface AnomalyReport {
  mean: number
  stdDev: number
  anomalies: Anomaly[]
  historyDays: number
  generatedAt: string
}

// ------------------------------------------------------------
// Helpers
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

// ------------------------------------------------------------
// Detector
// ------------------------------------------------------------

/**
 * Detector puro: toma el historial de ventas + conteo de devoluciones
 * por día y devuelve el reporte de anomalías.
 *
 * @param history Serie diaria de ventas.
 * @param returnsByDay Mapa `YYYY-MM-DD` → número de devoluciones ese día.
 * @param returnsThreshold Día con más devoluciones que este umbral se
 *   considera anómalo (default 3).
 */
export function detectAnomalies(
  history: DailySalesPoint[],
  returnsByDay: Map<string, number> = new Map(),
  returnsThreshold = 3,
): AnomalyReport {
  const revenues = history.map((p) => p.revenue)
  const m = mean(revenues)
  const sd = stdDev(revenues)
  const upper = m + 2 * sd
  const lower = Math.max(0, m - 2 * sd)
  const anomalies: Anomaly[] = []

  for (const p of history) {
    if (sd > 0 && p.revenue > upper) {
      anomalies.push({
        kind: 'SALES_SPIKE',
        date: p.date,
        value: round2(p.revenue),
        threshold: round2(upper),
        description: `Ingresos de $${p.revenue.toLocaleString('es-CO')} superiores al umbral de $${round2(upper).toLocaleString('es-CO')} (media+2σ).`,
      })
    } else if (sd > 0 && p.revenue > 0 && p.revenue < lower) {
      anomalies.push({
        kind: 'SALES_DROP',
        date: p.date,
        value: round2(p.revenue),
        threshold: round2(lower),
        description: `Ingresos de $${p.revenue.toLocaleString('es-CO')} por debajo del umbral de $${round2(lower).toLocaleString('es-CO')} (media−2σ).`,
      })
    }
    const returns = returnsByDay.get(p.date) ?? 0
    if (returns > returnsThreshold) {
      anomalies.push({
        kind: 'HIGH_RETURNS',
        date: p.date,
        value: returns,
        threshold: returnsThreshold,
        description: `${returns} devoluciones registradas (umbral: >${returnsThreshold}/día).`,
      })
    }
  }

  return {
    mean: round2(m),
    stdDev: round2(sd),
    anomalies,
    historyDays: history.length,
    generatedAt: new Date().toISOString(),
  }
}

// ------------------------------------------------------------
// DB fetcher for returns by day
// ------------------------------------------------------------

async function getReturnsByDay(days: number): Promise<Map<string, number>> {
  try {
    const since = new Date()
    since.setDate(since.getDate() - days)
    since.setHours(0, 0, 0, 0)

    const returns = await db.return.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    })

    const map = new Map<string, number>()
    for (const r of returns) {
      const d = new Date(r.createdAt)
      d.setHours(0, 0, 0, 0)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      const key = `${y}-${m}-${dd}`
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  } catch (err) {
    logger.error('ai.getReturnsByDay error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return new Map()
  }
}

// ------------------------------------------------------------
// Orchestration
// ------------------------------------------------------------

const SYSTEM_PROMPT = `Eres un analista de datos de ecommerce especializado en detección de anomalías. Analizas reportes de spikes, caídas y devoluciones atípicas y produces un informe Markdown conciso (máx 350 palabras). Responde SIEMPRE en español. Estructura: Resumen, Anomalías detectadas (lista con fecha, tipo, descripción), Posibles causas, Recomendaciones (3 bullets). No inventes fechas ni cifras fuera del JSON provisto.`

export async function generateAnomalyReport(): Promise<AiInsightResult> {
  const history = await getSalesHistory(30)
  const returnsByDay = await getReturnsByDay(30)
  const report = detectAnomalies(history, returnsByDay, 3)

  let content: string
  let aiGenerated = false

  if (report.anomalies.length > 0) {
    const userPrompt = `Reporte de anomalías (últimos 30 días):
- Media diaria: $${report.mean}
- Desviación estándar: $${report.stdDev}
- Umbral spike: >$${round2(report.mean + 2 * report.stdDev).toLocaleString('es-CO')}
- Umbral caída: <$${Math.max(0, round2(report.mean - 2 * report.stdDev)).toLocaleString('es-CO')}
- Umbral devoluciones: >3/día

Anomalías detectadas (${report.anomalies.length}):
${report.anomalies
  .map((a, i) => `${i + 1}. [${a.kind}] ${a.date} — ${a.description}`)
  .join('\n')}

Genera un informe ejecutivo en Markdown. Sé específico, no inventes datos.`
    const llm = await callLLM(SYSTEM_PROMPT, userPrompt)
    if (llm && llm.length > 50) {
      content = llm
      aiGenerated = true
    } else {
      content = buildFallbackContent(report)
      aiGenerated = false
    }
  } else {
    content = buildFallbackContent(report)
    aiGenerated = false
  }

  const severity = report.anomalies.length === 0 ? 'sin anomalías' : `${report.anomalies.length} anomalía(s)`

  return saveInsight({
    type: 'ANOMALY' as AiInsightType,
    title: `Detección de anomalías — ${severity}`,
    content,
    aiGenerated,
    metadata: {
      aiGenerated,
      report,
      generatedAt: new Date().toISOString(),
    },
  })
}

function buildFallbackContent(report: AnomalyReport): string {
  if (report.anomalies.length === 0) {
    return `## Detección de anomalías — Sin hallazgos

### Resumen
No se detectaron anomalías estadísticamente significativas en los últimos ${report.historyDays} días.

### Parámetros usados
- **Media diaria:** $${report.mean.toLocaleString('es-CO')} COP
- **Desviación estándar:** $${report.stdDev.toLocaleString('es-CO')} COP
- **Umbral spike:** > $${round2(report.mean + 2 * report.stdDev).toLocaleString('es-CO')} COP
- **Umbral caída:** < $${Math.max(0, round2(report.mean - 2 * report.stdDev)).toLocaleString('es-CO')} COP
- **Umbral devoluciones:** > 3/día

### Conclusión
El comportamiento de ventas y devoluciones se mantiene dentro de los rangos esperados (±2σ). No se requiere acción inmediata.`
  }

  const lines = report.anomalies
    .map((a, i) => `**${i + 1}. ${a.kind}** — \`${a.date}\`\n   - ${a.description}`)
    .join('\n\n')

  return `## Detección de anomalías — ${report.anomalies.length} hallazgo(s)

### Resumen
- **Media diaria:** $${report.mean.toLocaleString('es-CO')} COP
- **Desviación estándar:** $${report.stdDev.toLocaleString('es-CO')} COP

### Anomalías detectadas
${lines}

### Posibles causas
- **Spikes:** campañas publicitarias, promociones, viralidad en redes.
- **Caídas:** fallos en la pasarela de pago, ruptura de stock, días no laborables.
- **Devoluciones altas:** problema de calidad en un lote, error de logística, descripción incorrecta del producto.

### Recomendaciones
- Correlacionar cada anomalía con eventos de marketing y operación.
- Revisar los productos involucrados en las devoluciones.
- Mantener monitoreo diario; si un patrón se repite, activar alerta operacional.`
}
