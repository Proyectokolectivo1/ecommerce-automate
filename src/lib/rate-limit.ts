// ============================================================
// rate-limit.ts — Simple in-memory rate limiter
// ============================================================
// Rate limiting en memoria (sin Redis para el demo).
// Soporta límites por clave (userId, IP, etc.) con ventana de tiempo.
//
// En producción: reemplazar por Upstash Ratelimit o BullMQ.

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Limpieza periódica de entradas expiradas (cada 5 min).
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
let lastCleanup = Date.now()

function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now
  for (const [key, entry] of store) {
    if (entry.resetAt < now) {
      store.delete(key)
    }
  }
}

export interface RateLimitConfig {
  /** Número máximo de peticiones en la ventana. */
  limit: number
  /** Ventana de tiempo en milisegundos. */
  windowMs: number
}

export interface RateLimitResult {
  /** True si la petición está permitida. */
  allowed: boolean
  /** Peticiones restantes en la ventana actual. */
  remaining: number
  /** Timestamp cuando se resetea el contador (ms). */
  resetAt: number
  /** Límite total. */
  limit: number
}

/**
 * Verifica si una petición está dentro del límite.
 * Incrementa el contador automáticamente.
 *
 * @param key - identificador único (userId, IP, etc.)
 * @param config - límite y ventana
 * @returns resultado del rate limit
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): RateLimitResult {
  cleanup()

  const now = Date.now()
  const entry = store.get(key)

  if (!entry || entry.resetAt < now) {
    // Primera petición o ventana expirada.
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + config.windowMs,
    }
    store.set(key, newEntry)
    return {
      allowed: true,
      remaining: config.limit - 1,
      resetAt: newEntry.resetAt,
      limit: config.limit,
    }
  }

  // Ventana activa.
  entry.count++
  const allowed = entry.count <= config.limit
  const remaining = Math.max(0, config.limit - entry.count)

  return {
    allowed,
    remaining,
    resetAt: entry.resetAt,
    limit: config.limit,
  }
}

// ------------------------------------------------------------
// Presets por tipo de recurso
// ------------------------------------------------------------

export const RATE_LIMIT_PRESETS = {
  /** APIs autenticadas: 100 req/min por usuario. */
  authenticated: { limit: 100, windowMs: 60_000 },
  /** Webhooks entrantes: 1000 req/min por IP. */
  webhooks: { limit: 1000, windowMs: 60_000 },
  /** APIs de IA (z-ai-web-dev-sdk): 5 req/min por usuario. */
  ai: { limit: 5, windowMs: 60_000 },
  /** Login: 10 intentos/min por IP (previene brute force). */
  login: { limit: 10, windowMs: 60_000 },
  /** Exportación CSV: 10 req/min por usuario. */
  export: { limit: 10, windowMs: 60_000 },
} as const

/**
 * Wrapper para aplicar rate limiting en un handler de API.
 * Si el límite se excede, responde 429 Too Many Requests.
 *
 * @example
 * export async function GET(request: Request) {
 *   const limited = applyRateLimit(request, 'userId-123', RATE_LIMIT_PRESETS.authenticated)
 *   if (limited) return limited
 *   // ... handler logic
 * }
 */
export function applyRateLimit(
  request: Request,
  key: string,
  config: RateLimitConfig,
): Response | null {
  const result = checkRateLimit(key, config)
  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000)
    return new Response(
      JSON.stringify({
        error: 'Demasiadas peticiones',
        message: `Límite de ${result.limit} peticiones por minuto excedido. Intenta en ${retryAfter}s.`,
        retryAfter,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(result.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(result.resetAt),
        },
      },
    )
  }
  return null
}

/** Extrae una key de rate limit del request (IP o userId). */
export function getRateLimitKey(request: Request, userId?: string): string {
  if (userId) return `user:${userId}`
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() ?? 'unknown'
  return `ip:${ip}`
}
