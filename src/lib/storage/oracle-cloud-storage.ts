// ============================================================
// oracle-cloud-storage.ts — Oracle Cloud Object Storage adapter
// ============================================================
// Adapter para Oracle Cloud Infrastructure (OCI) Object Storage.
// OCI es compatible con la API de S3, así que usamos @aws-sdk/client-s3
// con un endpoint personalizado apuntando a Oracle.
//
// Endpoint S3-compatible de OCI:
//   https://{namespace}.compat.objectstorage.{region}.oraclecloud.com
//
// Configuración vía variables de entorno:
//   ORACLE_CLOUD_NAMESPACE   — namespace de Object Storage
//   ORACLE_CLOUD_REGION      — región (ej: us-ashburn-1, sa-saopaulo-1)
//   ORACLE_CLOUD_BUCKET      — nombre del bucket
//   ORACLE_CLOUD_ACCESS_KEY  — Access Key (de pre-authenticated request o API key)
//   ORACLE_CLOUD_SECRET_KEY  — Secret Key
//
// Si las credenciales no están configuradas, el constructor lanza error.
// El factory en index.ts decide si usar este adapter o LocalStorage.

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { logger } from '@/lib/logger'
import type { StoragePort } from './index'

export interface OracleCloudConfig {
  namespace: string
  region: string
  bucket: string
  accessKey: string
  secretKey: string
}

/** Lee la config de Oracle Cloud desde variables de entorno. */
export function getOracleCloudConfigFromEnv(): OracleCloudConfig | null {
  const namespace = process.env.ORACLE_CLOUD_NAMESPACE
  const region = process.env.ORACLE_CLOUD_REGION
  const bucket = process.env.ORACLE_CLOUD_BUCKET
  const accessKey = process.env.ORACLE_CLOUD_ACCESS_KEY
  const secretKey = process.env.ORACLE_CLOUD_SECRET_KEY

  if (!namespace || !region || !bucket || !accessKey || !secretKey) {
    return null
  }

  return { namespace, region, bucket, accessKey, secretKey }
}

/** True si Oracle Cloud está configurado. */
export function isOracleCloudConfigured(): boolean {
  return getOracleCloudConfigFromEnv() !== null
}

export class OracleCloudStorage implements StoragePort {
  private client: S3Client
  private bucket: string
  private namespace: string
  private region: string

  constructor(config: OracleCloudConfig) {
    this.bucket = config.bucket
    this.namespace = config.namespace
    this.region = config.region

    // Endpoint S3-compatible de Oracle Cloud.
    const endpoint = `https://${config.namespace}.compat.objectstorage.${config.region}.oraclecloud.com`

    this.client = new S3Client({
      region: config.region,
      endpoint,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      // Forzar path-style (Oracle lo requiere).
      forcePathStyle: true,
    })

    logger.info('storage.oracle-cloud initialized', {
      bucket: this.bucket,
      namespace: this.namespace,
      region: this.region,
      endpoint,
    })
  }

  async save(key: string, data: Buffer, contentType?: string): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType ?? 'application/octet-stream',
      })
      await this.client.send(command)
      logger.debug('storage.oracle-cloud.save', { key, bytes: data.length })
      return key
    } catch (err) {
      logger.error('storage.oracle-cloud.save failed', {
        key,
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  async read(key: string): Promise<Buffer | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
      const response = await this.client.send(command)
      if (!response.Body) return null

      // Convertir el stream a Buffer.
      const chunks: Uint8Array[] = []
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk)
      }
      return Buffer.concat(chunks)
    } catch (err) {
      // NoSuchKey → null (archivo no existe).
      const name = (err as { name?: string }).name
      if (name === 'NoSuchKey' || name === 'NotFound') return null
      logger.error('storage.oracle-cloud.read failed', {
        key,
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  getUrl(key: string): string {
    // URL pública del objeto en OCI Object Storage.
    // Formato: https://{namespace}.objectstorage.{region}.oraclecloud.com/n/{namespace}/b/{bucket}/o/{key}
    return `https://${this.namespace}.objectstorage.${this.region}.oraclecloud.com/n/${this.namespace}/b/${this.bucket}/o/${encodeURIComponent(key)}`
  }

  async delete(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
      await this.client.send(command)
      logger.debug('storage.oracle-cloud.delete', { key })
    } catch (err) {
      logger.error('storage.oracle-cloud.delete failed', {
        key,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /** Verifica si un objeto existe (usa HeadObject). */
  async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
      await this.client.send(command)
      return true
    } catch {
      return false
    }
  }
}
