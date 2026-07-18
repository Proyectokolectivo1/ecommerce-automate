// ============================================================
// /api/ai/insights — List + stats (read-only, fallback auth)
// ============================================================
// GET — devuelve lista paginada de insights + agregados (stats).
// Query params:
//   ?type=SALES_PREDICTION  (filtro por tipo)
//   ?aiGenerated=true|false
//   ?limit=20&offset=0

import { NextResponse } from 'next/server'
import { getCurrentUserOrFallback } from '@/lib/auth'
import { logger } from '@/lib/logger'
import {
  getAiStats,
  listInsights,
  type ListInsightsFilters,
} from '@/modules/ai/ai.service'
import type { AiInsightType } from '@/lib/validation'
import { AI_INSIGHT_TYPES } from '@/lib/validation'

export async function GET(request: Request) {
  const user = await getCurrentUserOrFallback()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  try {
    const url = new URL(request.url)
    const typeParam = url.searchParams.get('type') as AiInsightType | null
    const aiGeneratedParam = url.searchParams.get('aiGenerated')
    const limitParam = url.searchParams.get('limit')
    const offsetParam = url.searchParams.get('offset')

    const filters: ListInsightsFilters = {}
    if (typeParam && AI_INSIGHT_TYPES.includes(typeParam)) {
      filters.type = typeParam
    }
    if (aiGeneratedParam === 'true') filters.aiGenerated = true
    else if (aiGeneratedParam === 'false') filters.aiGenerated = false
    if (limitParam) filters.limit = parseInt(limitParam, 10)
    if (offsetParam) filters.offset = parseInt(offsetParam, 10)

    const [list, stats] = await Promise.all([
      listInsights(filters),
      getAiStats(),
    ])

    return NextResponse.json({
      insights: list.insights,
      total: list.total,
      stats,
      filters,
    })
  } catch (err) {
    logger.error('api.ai.insights error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: 'Error al obtener insights' },
      { status: 500 },
    )
  }
}
