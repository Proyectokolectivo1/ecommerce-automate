// ============================================================
// /api/ai/summary — Monthly summary generation (ADMIN/GERENCIA)
// ============================================================
// POST — recolecta KPIs del último mes y genera un resumen
// ejecutivo en Markdown con el LLM.

import { NextResponse } from 'next/server'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { generateMonthlySummary } from '@/modules/ai/monthly-summary'

export async function POST() {
  let user
  try {
    user = requireRole(await getCurrentUser(), 'ADMIN', 'GERENCIA')
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 403
    return NextResponse.json({ error: (err as Error).message }, { status: statusCode })
  }

  try {
    const insight = await generateMonthlySummary()
    logger.info('api.ai.summary success', {
      insightId: insight.id,
      aiGenerated: insight.aiGenerated,
      userId: user.id,
    })
    return NextResponse.json({ ok: true, insight }, { status: 201 })
  } catch (err) {
    logger.error('api.ai.summary error', {
      error: err instanceof Error ? err.message : String(err),
      userId: user.id,
    })
    return NextResponse.json(
      { error: 'Error al generar resumen mensual' },
      { status: 500 },
    )
  }
}
