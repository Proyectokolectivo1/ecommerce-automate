// ============================================================
// /api/print/printer-status — Printer system status
// ============================================================
// GET — devuelve el estado del sistema de impresión:
//   - cupsAvailable: si CUPS está disponible
//   - printers: lista de impresoras (si CUPS)
//   - spoolJobs: trabajos en el spool (sandbox fallback)
// Útil para que el admin vea si la impresión es real o simulada.

import { NextResponse } from 'next/server'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { isCupsAvailable, listPrinters, getSpoolJobs } from '@/integrations/printing/printer-spool'

export async function GET() {
  let user
  try {
    user = requireRole(await getCurrentUser(), 'ADMIN', 'BODEGA')
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 403
    return NextResponse.json({ error: (err as Error).message }, { status: statusCode })
  }
  void user

  try {
    const [cupsAvailable, printers, spoolJobs] = await Promise.all([
      isCupsAvailable(),
      listPrinters(),
      getSpoolJobs(),
    ])

    return NextResponse.json({
      cupsAvailable,
      method: cupsAvailable ? 'cups' : 'spool-fallback',
      printers,
      spoolJobs: spoolJobs.slice(-20), // últimos 20
      spoolJobsCount: spoolJobs.length,
      message: cupsAvailable
        ? 'CUPS detectado. Las guías se imprimen en la impresora real.'
        : 'CUPS no disponible. Las guías se envían al spool directory (simulado). En producción con CUPS, se imprimirán en la impresora real.',
    })
  } catch (err) {
    logger.error('api.print.printer-status error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Error al obtener estado de impresoras' }, { status: 500 })
  }
}
