// ============================================================
// /api/system/health — Health check endpoint
// ============================================================
// GET — devuelve el estado del sistema para monitoring y Docker.
// No requiere auth.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: 'unknown' as string,
    services: {
      realtime: process.env.REALTIME_URL ? 'configured' : 'not-configured',
      oracleCloud: process.env.ORACLE_CLOUD_NAMESPACE ? 'configured' : 'local-fallback',
      redis: process.env.REDIS_URL ? 'configured' : 'memory-fallback',
    },
  }

  // Verificar DB
  try {
    await db.$queryRaw`SELECT 1`
    health.database = 'ok'
  } catch {
    health.database = 'error'
    health.status = 'degraded'
  }

  const httpStatus = health.status === 'ok' ? 200 : 503
  return NextResponse.json(health, { status: httpStatus })
}
