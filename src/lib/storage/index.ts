// ============================================================
// storage/index.ts — File storage port (local, swappable for S3)
// ============================================================
// Abstracción de almacenamiento de archivos (PDFs de guías, imágenes
// de productos, etc.). Cumple la interfaz StoragePort para poder
// intercambiarse por S3/GCS sin tocar el código consumidor.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { logger } from '@/lib/logger'

export interface StoragePort {
  /** Guarda un buffer bajo `key`. Devuelve la key usada. */
  save(key: string, data: Buffer, contentType?: string): Promise<string>
  /** Lee un archivo. Devuelve null si no existe. */
  read(key: string): Promise<Buffer | null>
  /** Devuelve una URL accesible (relativa o absoluta según backend). */
  getUrl(key: string): string
  /** Elimina un archivo. No falla si no existe. */
  delete(key: string): Promise<void>
}

const STORAGE_ROOT = '/home/z/my-project/storage'

export class LocalStorage implements StoragePort {
  private root: string

  constructor(root: string = STORAGE_ROOT) {
    this.root = root
  }

  private resolve(key: string): string {
    // Previene path traversal: normaliza y rechaza keys que salgan del root.
    const safe = path.normalize(key).replace(/^(\.\.[/\\])+/, '')
    const full = path.resolve(this.root, safe)
    if (!full.startsWith(path.resolve(this.root))) {
      throw new Error(`storage: path traversal detectado para key "${key}"`)
    }
    return full
  }

  async save(key: string, data: Buffer, _contentType?: string): Promise<string> {
    const full = this.resolve(key)
    await fs.mkdir(path.dirname(full), { recursive: true })
    await fs.writeFile(full, data)
    logger.debug(`storage.save ${key}`, { bytes: data.length })
    return key
  }

  async read(key: string): Promise<Buffer | null> {
    try {
      const full = this.resolve(key)
      return await fs.readFile(full)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return null
      throw err
    }
  }

  getUrl(key: string): string {
    // URL relativa para ser servida por una ruta API estática.
    return `/storage/${encodeURIComponent(key)}`
  }

  async delete(key: string): Promise<void> {
    try {
      const full = this.resolve(key)
      await fs.unlink(full)
      logger.debug(`storage.delete ${key}`)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') throw err
    }
  }
}

/** Singleton de storage para toda la app */
export const storage: StoragePort = new LocalStorage()
