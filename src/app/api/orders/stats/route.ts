// ============================================================
// /api/orders/stats — Conteos por estado + pedidos recientes
// ============================================================
// GET — devuelve { stats, recent } para el dashboard.

import { NextResponse } from 'next/server'
import { getCurrentUserOrFallback } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { getOrderStats, getRecentOrders } from '@/modules/orders/order.service'

export async function GET() {
  const user = await getCurrentUserOrFallback()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  try {
    const [stats, recent] = await Promise.all([
      getOrderStats(),
      getRecentOrders(5),
    ])
    return NextResponse.json({ stats, recent })
  } catch (err) {
    logger.error('api.orders.stats error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: 'Error al obtener estadísticas' },
      { status: 500 },
    )
  }
}
