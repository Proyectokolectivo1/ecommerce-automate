// ============================================================
// /api/ai/predict — Sales prediction generation (ADMIN/GERENCIA)
// ============================================================
// POST — genera un nuevo insight de predicción de ventas llamando
// al LLM (con fallback heurístico). Requiere rol ADMIN o GERENCIA.

import { NextResponse } from 'next/server'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { generateSalesPrediction } from '@/modules/ai/predict-sales'

export async function POST() {
  let user
  try {
    user = requireRole(await getCurrentUser(), 'ADMIN', 'GERENCIA')
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 403
    return NextResponse.json({ error: (err as Error).message }, { status: statusCode })
  }

  try {
    const insight = await generateSalesPrediction()
    logger.info('api.ai.predict success', {
      insightId: insight.id,
      aiGenerated: insight.aiGenerated,
      userId: user.id,
    })
    return NextResponse.json({ ok: true, insight }, { status: 201 })
  } catch (err) {
    logger.error('api.ai.predict error', {
      error: err instanceof Error ? err.message : String(err),
      userId: user.id,
    })
    return NextResponse.json(
      { error: 'Error al generar predicción de ventas' },
      { status: 500 },
    )
  }
}
