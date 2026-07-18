// ============================================================
// monthly-summary.ts — Monthly executive summary (LLM-driven)
// ============================================================
// Recolecta KPIs del último mes (ventas, rentabilidad, devoluciones,
// pedidos por estado, top productos) y genera un resumen ejecutivo
// en Markdown usando el LLM. Si el LLM falla, genera un resumen
// tabular básico como fallback.

import { logger } from '@/lib/logger'
import type { AiInsightType } from '@/lib/validation'
import { callLLM, saveInsight, type AiInsightResult } from './ai.service'
import {
  getProfitability,
  getReturnsMetrics,
  getSalesKPIs,
  getTopProducts,
} from '@/modules/analytics'

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export interface MonthlyKpis {
  sales: { total: number; count: number; avgTicket: number }
  profitability: {
    revenue: number
    netProfit: number
    margin: number
    costs: { product: number; shipping: number; advertising: number; operation: number; total: number }
  }
  returns: { count: number; rate: number; lostValue: number; topProduct: string | null }
  topProducts: {
    id: string
    title: string
    sku: string | null
    quantity: number
    revenue: number
    profit: number
    margin: number
  }[]
  periodStart: string
  periodEnd: string
}

// ------------------------------------------------------------
// KPI collector
// ------------------------------------------------------------

export async function collectMonthlyKpis(): Promise<MonthlyKpis> {
  const [sales, profitability, returns, topProducts] = await Promise.all([
    getSalesKPIs('month'),
    getProfitability(),
    getReturnsMetrics(),
    getTopProducts(5),
  ])

  const now = new Date()
  const start = new Date(now)
  start.setDate(now.getDate() - 30)

  return {
    sales,
    profitability,
    returns,
    topProducts,
    periodStart: start.toISOString(),
    periodEnd: now.toISOString(),
  }
}

// ------------------------------------------------------------
// Orchestration
// ------------------------------------------------------------

const SYSTEM_PROMPT = `Eres un analista financiero de ecommerce. Recibes KPIs del último mes y produces un resumen ejecutivo en Markdown (máx 500 palabras). Responde SIEMPRE en español. Estructura obligatoria: 1) Highlight principal (1 frase impactante), 2) KPIs clave (tabla), 3) Rentabilidad (análisis), 4) Top productos (tabla), 5) Devoluciones, 6) Recomendaciones accionables (3-5 bullets). No inventes cifras: usa solo las del JSON.`

export async function generateMonthlySummary(): Promise<AiInsightResult> {
  const kpis = await collectMonthlyKpis()

  const userPrompt = `KPIs del último mes (periodo: ${kpis.periodStart.slice(0, 10)} → ${kpis.periodEnd.slice(0, 10)}):

**Ventas:**
- Total: $${kpis.sales.total.toLocaleString('es-CO')} COP
- Pedidos: ${kpis.sales.count}
- Ticket promedio: $${kpis.sales.avgTicket.toLocaleString('es-CO')} COP

**Rentabilidad:**
- Revenue: $${kpis.profitability.revenue.toLocaleString('es-CO')}
- Costos: Producto $${kpis.profitability.costs.product.toLocaleString('es-CO')} | Envío $${kpis.profitability.costs.shipping.toLocaleString('es-CO')} | Publicidad $${kpis.profitability.costs.advertising.toLocaleString('es-CO')} | Operación $${kpis.profitability.costs.operation.toLocaleString('es-CO')} | Total $${kpis.profitability.costs.total.toLocaleString('es-CO')}
- Utilidad neta: $${kpis.profitability.netProfit.toLocaleString('es-CO')}
- Margen: ${kpis.profitability.margin}%

**Devoluciones:**
- Cantidad: ${kpis.returns.count}
- Tasa: ${kpis.returns.rate}%
- Valor perdido: $${kpis.returns.lostValue.toLocaleString('es-CO')}
- Top producto devuelto: ${kpis.returns.topProduct ?? 'N/A'}

**Top productos:**
${kpis.topProducts
  .map((p, i) => `${i + 1}. ${p.title} (SKU: ${p.sku ?? '-'}) — ${p.quantity} uds | Revenue $${p.revenue.toLocaleString('es-CO')} | Utilidad $${p.profit.toLocaleString('es-CO')} | Margen ${p.margin}%`)
  .join('\n')}

Genera el resumen ejecutivo en Markdown.`

  const llm = await callLLM(SYSTEM_PROMPT, userPrompt)
  const aiGenerated = !!(llm && llm.length > 80)
  const content = aiGenerated ? llm! : buildFallbackContent(kpis)

  return saveInsight({
    type: 'MONTHLY_SUMMARY' as AiInsightType,
    title: `Resumen mensual — Ventas $${kpis.sales.total.toLocaleString('es-CO')} | Margen ${kpis.profitability.margin}% | ${kpis.sales.count} pedidos`,
    content,
    aiGenerated,
    metadata: {
      aiGenerated,
      kpis,
      generatedAt: new Date().toISOString(),
    },
  })
}

function buildFallbackContent(kpis: MonthlyKpis): string {
  const productRows = kpis.topProducts
    .map((p) => `| ${p.title} | ${p.sku ?? '-'} | ${p.quantity} | $${p.revenue.toLocaleString('es-CO')} | $${p.profit.toLocaleString('es-CO')} | ${p.margin}% |`)
    .join('\n')

  return `## Resumen Ejecutivo Mensual

### Highlight
${kpis.profitability.margin >= 20 ? '✅ Buen desempeño: el margen se mantiene saludable.' : kpis.profitability.margin >= 10 ? '⚠️ Margen ajustado: revisar estructura de costos.' : '🚨 Margen crítico: acción inmediata requerida.'}

### KPIs clave
| Métrica | Valor |
|---------|------:|
| Ingresos | $${kpis.sales.total.toLocaleString('es-CO')} COP |
| Pedidos | ${kpis.sales.count} |
| Ticket promedio | $${kpis.sales.avgTicket.toLocaleString('es-CO')} COP |
| Utilidad neta | $${kpis.profitability.netProfit.toLocaleString('es-CO')} COP |
| Margen | ${kpis.profitability.margin}% |
| Devoluciones | ${kpis.returns.count} (${kpis.returns.rate}%) |

### Rentabilidad
- Costo de producto: $${kpis.profitability.costs.product.toLocaleString('es-CO')} COP
- Costo de envío: $${kpis.profitability.costs.shipping.toLocaleString('es-CO')} COP
- Publicidad: $${kpis.profitability.costs.advertising.toLocaleString('es-CO')} COP
- Operación: $${kpis.profitability.costs.operation.toLocaleString('es-CO')} COP

### Top productos
| Producto | SKU | Qty | Revenue | Utilidad | Margen |
|----------|-----|----:|--------:|---------:|-------:|
${productRows}

### Devoluciones
- Cantidad: ${kpis.returns.count} | Tasa: ${kpis.returns.rate}%
- Valor perdido: $${kpis.returns.lostValue.toLocaleString('es-CO')} COP
- Top producto devuelto: ${kpis.returns.topProduct ?? 'N/A'}

### Recomendaciones
- Mantener inversión en publicidad en los productos top por margen.
- Investigar causas de devoluciones del producto más afectado.
- Optimizar costo de envío si representa > 15% del revenue.
- Revisar precio de productos con margen < 15%.`
}
