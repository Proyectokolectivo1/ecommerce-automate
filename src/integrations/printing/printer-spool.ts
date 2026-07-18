// ============================================================
// printer-spool.ts — Real printer spooler adapter
// ============================================================
// Adapter que envía un PDF a una impresora real.
//
// Estrategia:
//   1. Si CUPS está disponible (comando `lp`), usa `lp -d <printer> -t <title> <file>`.
//      Esto imprime en la impresora real configurada en el sistema.
//   2. Si CUPS NO está disponible (sandbox), escribe el PDF en un
//      spool directory (`storage/print-spool/`) y registra el evento
//      en un log de impresión. Esto simula el envío a impresora y
//      deja evidencia auditable.
//
// En producción (con CUPS instalado), el mismo código imprime en la
// impresora real sin cambios. El fallback del sandbox garantiza
// que el flujo funcione en cualquier entorno.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { logger } from '@/lib/logger'
import { storage } from '@/lib/storage'

const execFileAsync = promisify(execFile)

const SPOOL_DIR = '/home/z/my-project/storage/print-spool'
const SPOOL_LOG = '/home/z/my-project/storage/print-spool/spool.log'

export interface PrintRequest {
  /** Ruta o key del PDF en el storage. */
  pdfKey: string
  /** Nombre de la impresora (cola CUPS). Si null, usa la default. */
  printer?: string | null
  /** Título del trabajo (se muestra en la cola de impresión). */
  title: string
  /** Número de copias (default 1). */
  copies?: number
}

export interface PrintResult {
  /** True si se envió a impresora real (CUPS) o al spool (sandbox). */
  sent: boolean
  /** Método usado: 'cups' | 'spool-fallback' */
  method: 'cups' | 'spool-fallback'
  /** ID del trabajo de impresión (CUPS job ID o spool filename). */
  jobId?: string
  /** Nombre de la impresora usada. */
  printer: string
  /** Error si falló. */
  error?: string
}

let cupsAvailable: boolean | null = null

/** Verifica si CUPS (`lp`) está disponible en el sistema. */
export async function isCupsAvailable(): Promise<boolean> {
  if (cupsAvailable !== null) return cupsAvailable
  try {
    await execFileAsync('which', ['lp'], { timeout: 2000 })
    cupsAvailable = true
    logger.info('printer-spool.cups-detected')
  } catch {
    cupsAvailable = false
    logger.info('printer-spool.cups-not-available (usando spool-fallback)')
  }
  return cupsAvailable
}

/** Lista las impresoras disponibles (CUPS). Si no hay CUPS, devuelve []. */
export async function listPrinters(): Promise<string[]> {
  if (!(await isCupsAvailable())) return []
  try {
    const { stdout } = await execFileAsync('lpstat', ['-p'], { timeout: 5000 })
    const printers = stdout
      .split('\n')
      .filter((line) => line.startsWith('printer '))
      .map((line) => line.split(' ')[1])
      .filter(Boolean)
    return printers
  } catch {
    return []
  }
}

/**
 * Envía un PDF a la impresora.
 * - Si CUPS está disponible: usa `lp -d <printer> -t <title> -n <copies> <file>`.
 * - Si no: escribe el PDF en el spool directory y registra el evento.
 */
export async function sendToPrinter(req: PrintRequest): Promise<PrintResult> {
  const printer = req.printer || 'default'
  const copies = Math.max(1, req.copies ?? 1)

  const pdfBuffer = await storage.read(req.pdfKey)
  if (!pdfBuffer) {
    return {
      sent: false,
      method: 'spool-fallback',
      printer,
      error: `PDF no encontrado en storage: ${req.pdfKey}`,
    }
  }

  const available = await isCupsAvailable()

  if (available) {
    try {
      const tmpFile = `/tmp/print-${Date.now()}-${path.basename(req.pdfKey)}`
      await fs.writeFile(tmpFile, pdfBuffer)

      const args = ['-t', req.title, '-n', String(copies)]
      if (printer && printer !== 'default') {
        args.unshift('-d', printer)
      }
      args.push(tmpFile)

      const { stdout } = await execFileAsync('lp', args, { timeout: 30000 })

      void fs.unlink(tmpFile).catch(() => undefined)

      const jobIdMatch = stdout.match(/request id is (\S+)/)
      const jobId = jobIdMatch ? jobIdMatch[1] : `cups-${Date.now()}`

      logger.info('printer-spool.cups-sent', {
        printer,
        jobId,
        title: req.title,
        copies,
        pdfKey: req.pdfKey,
      })

      return { sent: true, method: 'cups', jobId, printer }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logger.error('printer-spool.cups-failed', {
        printer,
        error: errorMsg,
        pdfKey: req.pdfKey,
      })
      return spoolFallback(req, pdfBuffer, printer, errorMsg)
    }
  }

  return spoolFallback(req, pdfBuffer, printer)
}

/**
 * Fallback del sandbox: escribe el PDF en el spool directory y
 * registra el evento en un log. Simula el envío a impresora.
 */
async function spoolFallback(
  req: PrintRequest,
  pdfBuffer: Buffer,
  printer: string,
  error?: string,
): Promise<PrintResult> {
  try {
    await fs.mkdir(SPOOL_DIR, { recursive: true })

    const filename = `${Date.now()}-${path.basename(req.pdfKey)}`
    const spoolPath = path.join(SPOOL_DIR, filename)
    await fs.writeFile(spoolPath, pdfBuffer)

    const logEntry = {
      timestamp: new Date().toISOString(),
      printer,
      title: req.title,
      copies: req.copies ?? 1,
      file: spoolPath,
      originalKey: req.pdfKey,
      cupsError: error ?? null,
      status: 'SPOOLED',
    }
    await fs.appendFile(SPOOL_LOG, JSON.stringify(logEntry) + '\n')

    logger.info('printer-spool.spool-fallback-sent', {
      printer,
      title: req.title,
      spoolFile: spoolPath,
      bytes: pdfBuffer.length,
    })

    return {
      sent: true,
      method: 'spool-fallback',
      jobId: filename,
      printer,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('printer-spool.spool-fallback-failed', {
      printer,
      error: errorMsg,
      pdfKey: req.pdfKey,
    })
    return {
      sent: false,
      method: 'spool-fallback',
      printer,
      error: errorMsg,
    }
  }
}

/** Devuelve los trabajos del spool (sandbox fallback). */
export async function getSpoolJobs(): Promise<
  Array<{
    timestamp: string
    printer: string
    title: string
    file: string
    status: string
  }>
> {
  try {
    const content = await fs.readFile(SPOOL_LOG, 'utf-8')
    return content
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  } catch {
    return []
  }
}
