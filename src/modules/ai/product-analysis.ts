// ============================================================
// product-analysis.ts — AI product performance analysis
// ============================================================
// Usa `getTopProducts` del módulo analytics y enriquece con datos
// de devoluciones por producto. El LLM genera un análisis de
// performance de catálogo con foco en márgenes y rotación.

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import type { AiInsightType } from '@/lib/validation'
import { callLLM, saveInsight, type AiInsightResult } from './ai.service'
import { getTopProducts, type TopProduct } from '@/modules/analytics'

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export interface ProductAnalysisRow extends TopProduct {
  returnsCount: number
  returnsLostValue: number
  inventoryQty: number
}

export interface ProductAnalysis {
  topProducts: ProductAnalysisRow[]
  totalRevenue: number
  totalProfit: number
  weightedMargin: number
  generatedAt: string
}

// ------------------------------------------------------------
// Data collector
// ------------------------------------------------------------

/** Trae top productos y los enriquece con devoluciones e inventario. */
export async function collectProductData(
  limit = 10,
): Promise<ProductAnalysis> {
  const topProducts = await getTopProducts(limit)
  if (topProducts.length === 0) {
    return {
      topProducts: [],
      totalRevenue: 0,
      totalProfit: 0,
      weightedMargin: 0,
      generatedAt: new Date().toISOString(),
    }
  }

  // Devoluciones + inventario por producto.
  const productIds = topProducts.map((p) => p.id)
  const [returns, inventory] = await Promise.all([
    db.return.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds } },
      _count: true,
      _sum: { lostValue: true },
    }),
    db.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, inventoryQty: true },
    }),
  ])

  const returnsMap = new Map<string, { count: number; lostValue: number }>()
  for (const r of returns) {
    if (!r.productId) continue
    returnsMap.set(r.productId, {
      count: r._count,
      lostValue: r._sum.lostValue ?? 0,
    })
  }
  const invMap = new Map<string, number>()
  for (const p of inventory) invMap.set(p.id, p.inventoryQty)

  const rows: ProductAnalysisRow[] = topProducts.map((p) => {
    const r = returnsMap.get(p.id)
    return {
      ...p,
      returnsCount: r?.count ?? 0,
      returnsLostValue: r?.lostValue ?? 0,
      inventoryQty: invMap.get(p.id) ?? 0,
    }
  })

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
  const totalProfit = rows.reduce((s, r) => s + r.profit, 0)
  const weightedMargin =
    totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100 * 100) / 100 : 0

  return {
    topProducts: rows,
    totalRevenue,
    totalProfit,
    weightedMargin,
    generatedAt: new Date().toISOString(),
  }
}

// ------------------------------------------------------------
// Orchestration
// ------------------------------------------------------------

const SYSTEM_PROMPT = `Eres un analista de catálogo para ecommerce. Analizas el desempeño de los productos top y produces un informe en Markdown (máx 450 palabras). Responde SIEMPRE en español. Estructura: 1) Resumen (2-3 líneas), 2) Tabla top productos (con margen y rotación), 3) Insights clave (3-5 bullets sobre márgenes, devoluciones, inventario), 4) Recomendaciones accionables. No inventes datos fuera del JSON.`

export async function generateProductAnalysis(): Promise<AiInsightResult> {
  const analysis = await collectProductData(10)

  let content: string
  let aiGenerated = false

  if (analysis.topProducts.length === 0) {
    content = `## Análisis de productos — Sin datos suficientes

No hay ventas registradas en el período actual para realizar el análisis de catálogo. Una vez existan pedidos completados, este informe se generará automáticamente.`
    aiGenerated = false
  } else {
    const userPrompt = `Análisis de catálogo (top ${analysis.topProducts.length} productos):

**Agregados:**
- Revenue total: $${analysis.totalRevenue.toLocaleString('es-CO')} COP
- Utilidad total: $${analysis.totalProfit.toLocaleString('es-CO')} COP
- Margen ponderado: ${analysis.weightedMargin}%

**Productos:**
${analysis.topProducts
  .map((p, i) => `${i + 1}. ${p.title} (SKU: ${p.sku ?? '-'})
   - Cantidad vendida: ${p.quantity}
   - Revenue: $${p.revenue.toLocaleString('es-CO')} | Utilidad: $${p.profit.toLocaleString('es-CO')} | Margen: ${p.margin}%
   - Devoluciones: ${p.returnsCount} ($${p.returnsLostValue.toLocaleString('es-CO')} perdido)
   - Inventario actual: ${p.inventoryQty} uds`)
  .join('\n')}

Genera el análisis en Markdown.`

    const llm = await callLLM(SYSTEM_PROMPT, userPrompt)
    if (llm && llm.length > 80) {
      content = llm
      aiGenerated = true
    } else {
      content = buildFallbackContent(analysis)
      aiGenerated = false
    }
  }

  const title = analysis.topProducts.length === 0
    ? 'Análisis de productos — Sin datos suficientes'
    : `Análisis de productos — Top ${analysis.topProducts.length} | Margen ponderado ${analysis.weightedMargin}%`

  return saveInsight({
    type: 'PRODUCT_ANALYSIS' as AiInsightType,
    title,
    content,
    aiGenerated,
    metadata: {
      aiGenerated,
      analysis,
      generatedAt: new Date().toISOString(),
    },
  })
}

function buildFallbackContent(analysis: ProductAnalysis): string {
  const rows = analysis.topProducts
    .map((p, i) => `| ${i + 1} | ${p.title} | ${p.sku ?? '-'} | ${p.quantity} | $${p.revenue.toLocaleString('es-CO')} | $${p.profit.toLocaleString('es-CO')} | ${p.margin}% | ${p.returnsCount} | ${p.inventoryQty} |`)
    .join('\n')

  return `## Análisis de Productos — Top ${analysis.topProducts.length}

### Resumen
- **Revenue total (top):** $${analysis.totalRevenue.toLocaleString('es-CO')} COP
- **Utilidad total (top):** $${analysis.totalProfit.toLocaleString('es-CO')} COP
- **Margen ponderado:** ${analysis.weightedMargin}%

### Top productos
| # | Producto | SKU | Qty | Revenue | Utilidad | Margen | Devol. | Inventario |
|---|----------|-----|----:|--------:|---------:|-------:|-------:|-----------:|
${rows}

### Insights clave
${analysis.topProducts
  .filter((p) => p.margin < 15)
  .map((p) => `- ⚠️ **${p.title}** tiene margen bajo (${p.margin}%). Revisar precio o costo.`)
  .join('\n')}
${analysis.topProducts
  .filter((p) => p.returnsCount >= 2)
  .map((p) => `- 🔁 **${p.title}** tiene ${p.returnsCount} devoluciones ($${p.returnsLostValue.toLocaleString('es-CO')} perdido). Investigar causas.`)
  .join('\n')}
${analysis.topProducts
  .filter((p) => p.inventoryQty < 10)
  .map((p) => `- 📦 **${p.title}** tiene inventario bajo (${p.inventoryQty} uds). Reabastecer.`)
  .join('\n')}

### Recomendaciones
- Mantener inversión publicitaria en productos de alto margen.
- Renegociar costo con proveedores de productos con margen < 15%.
- Implementar control de calidad en productos con alta tasa de devolución.
- Diversificar el catálogo para no depender de pocos productos.`
}
