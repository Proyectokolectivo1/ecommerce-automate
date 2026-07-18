// ============================================================
// /api/ai/products — Product analysis generation (ADMIN/GERENCIA)
// ============================================================
// POST — analiza el desempeño de los top productos (margen,
// devoluciones, inventario) y genera un informe con el LLM.

import { NextResponse } from 'next/server'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { generateProductAnalysis } from '@/modules/ai/product-analysis'

export async function POST() {
  let user
  try {
    user = requireRole(await getCurrentUser(), 'ADMIN', 'GERENCIA')
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 403
    return NextResponse.json({ error: (err as Error).message }, { status: statusCode })
  }

  try {
    const insight = await generateProductAnalysis()
    logger.info('api.ai.products success', {
      insightId: insight.id,
      aiGenerated: insight.aiGenerated,
      userId: user.id,
    })
    return NextResponse.json({ ok: true, insight }, { status: 201 })
  } catch (err) {
    logger.error('api.ai.products error', {
      error: err instanceof Error ? err.message : String(err),
      userId: user.id,
    })
    return NextResponse.json(
      { error: 'Error al generar análisis de productos' },
      { status: 500 },
    )
  }
}
