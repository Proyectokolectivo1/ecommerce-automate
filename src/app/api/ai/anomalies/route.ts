// ============================================================
// /api/ai/anomalies — Anomaly report generation (ADMIN/GERENCIA)
// ============================================================
// POST — escanea los últimos 30 días en busca de spikes, caídas y
// devoluciones atípicas, genera un informe con el LLM y lo persiste.

import { NextResponse } from 'next/server'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { generateAnomalyReport } from '@/modules/ai/detect-anomalies'

export async function POST() {
  let user
  try {
    user = requireRole(await getCurrentUser(), 'ADMIN', 'GERENCIA')
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 403
    return NextResponse.json({ error: (err as Error).message }, { status: statusCode })
  }

  try {
    const insight = await generateAnomalyReport()
    logger.info('api.ai.anomalies success', {
      insightId: insight.id,
      aiGenerated: insight.aiGenerated,
      userId: user.id,
    })
    return NextResponse.json({ ok: true, insight }, { status: 201 })
  } catch (err) {
    logger.error('api.ai.anomalies error', {
      error: err instanceof Error ? err.message : String(err),
      userId: user.id,
    })
    return NextResponse.json(
      { error: 'Error al generar reporte de anomalías' },
      { status: 500 },
    )
  }
}
