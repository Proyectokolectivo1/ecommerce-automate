// ============================================================
// cache.ts — In-memory cache with TTL
// ============================================================
// Implementación simple de cache LRU-ish con TTL por entrada.
// Cumple la interfaz CacheStore para que pueda intercambiarse por
// Redis (u otro backend) sin cambiar el código consumidor.

import { logger } from '@/lib/logger'

export interface CacheStore {
  get<T>(key: string): Promise<T | null> | T | null
  set<T>(key: string, value: T, ttlMs?: number): Promise<void> | void
  delete(key: string): Promise<void> | void
  clear(): Promise<void> | void
}

export const DEFAULT_TTL_MS = 5 * 60 * 1000 // 5 minutos

interface CacheEntry<T> {
  value: T
  expiresAt: number // epoch ms
}

export class MemoryCache implements CacheStore {
  private store = new Map<string, CacheEntry<unknown>>()
  private defaultTtl: number

  constructor(defaultTtlMs: number = DEFAULT_TTL_MS) {
    this.defaultTtl = defaultTtlMs
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key)
    if (!entry) return null
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key)
      return null
    }
    return entry.value as T
  }

  set<T>(key: string, value: T, ttlMs: number = this.defaultTtl): void {
    const expiresAt = Date.now() + ttlMs
    this.store.set(key, { value, expiresAt })
  }

  delete(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  /** Elimina entradas expiradas. Útil para llamar periódicamente. */
  prune(): number {
    let removed = 0
    const now = Date.now()
    for (const [key, entry] of this.store) {
      if (now >= entry.expiresAt) {
        this.store.delete(key)
        removed++
      }
    }
    return removed
  }

  /** Tamaño actual del cache (incluye entradas expiradas no purgadas) */
  size(): number {
    return this.store.size
  }
}

/** Singleton de cache en memoria para toda la app */
export const cache: CacheStore = new MemoryCache()

// Purga periódica cada 10 minutos para evitar memory leaks.
if (typeof setInterval !== 'undefined') {
  try {
    setInterval(() => {
      const mem = cache as MemoryCache
      if (typeof mem.prune === 'function') {
        const removed = mem.prune()
        if (removed > 0) logger.debug(`cache.pruned ${removed} entries`)
      }
    }, 10 * 60 * 1000).unref?.()
  } catch {
    // noop: setInterval no disponible en este entorno
  }
}
