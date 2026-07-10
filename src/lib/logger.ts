// ============================================================
// logger.ts — Structured logger
// ============================================================
// Formato: [ISO timestamp] [LEVEL] [module] message {metadata}
// Usa console por debajo pero con formato estructurado para que los
// logs del sandbox (dev.log) sean legibles y filtrables.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const LEVEL_STYLE: Record<LogLevel, string> = {
  debug: '\x1b[90m', // gray
  info: '\x1b[36m',  // cyan
  warn: '\x1b[33m',  // yellow
  error: '\x1b[31m', // red
}

const RESET = '\x1b[0m'

function getMinLevel(): LogLevel {
  const env = (process.env.LOG_LEVEL || '').toLowerCase() as LogLevel
  if (env in LEVEL_PRIORITY) return env
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug'
}

function serializeMeta(meta?: unknown): string {
  if (meta === undefined || meta === null) return ''
  if (meta instanceof Error) {
    return JSON.stringify({ name: meta.name, message: meta.message, stack: meta.stack })
  }
  if (typeof meta === 'object') {
    try {
      return JSON.stringify(meta)
    } catch {
      return String(meta)
    }
  }
  return String(meta)
}

export class Logger {
  private module: string
  private minLevel: LogLevel

  constructor(module: string) {
    this.module = module
    this.minLevel = getMinLevel()
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.minLevel]
  }

  private write(level: LogLevel, message: string, meta?: unknown): void {
    if (!this.shouldLog(level)) return
    const timestamp = new Date().toISOString()
    const metaStr = serializeMeta(meta)
    const style = LEVEL_STYLE[level]
    const metaPart = metaStr ? ` ${metaStr}` : ''
    const line = `${style}[${timestamp}] [${level.toUpperCase()}] [${this.module}]${RESET} ${message}${metaPart}`
    if (level === 'error') {
      console.error(line)
    } else if (level === 'warn') {
      console.warn(line)
    } else {
      console.log(line)
    }
  }

  debug(message: string, meta?: unknown): void {
    this.write('debug', message, meta)
  }

  info(message: string, meta?: unknown): void {
    this.write('info', message, meta)
  }

  warn(message: string, meta?: unknown): void {
    this.write('warn', message, meta)
  }

  error(message: string, meta?: unknown): void {
    this.write('error', message, meta)
  }

  /** Crea un child logger con un sub-módulo */
  child(sub: string): Logger {
    return new Logger(`${this.module}:${sub}`)
  }
}

/** Logger raíz de la aplicación */
export const logger = new Logger('app')

/** Factory para crear loggers por módulo */
export function createLogger(module: string): Logger {
  return new Logger(module)
}
