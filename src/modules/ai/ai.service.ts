// ============================================================
// ai.service.ts — AI insight persistence + multi-provider LLM bridge
// ============================================================
// Único punto de contacto con LLMs en todo el módulo de IA.
// Soporta 4 proveedores:
//   1. z-ai-web-dev-sdk (default, sin costo, incluido)
//   2. OpenAI (GPT-4o, GPT-4o-mini)
//   3. Anthropic (Claude 3.5 Sonnet)
//   4. Custom (cualquier API OpenAI-compatible)
//
// Las credenciales se leen desde IntegrationSetting (provider='AI_LLM').
// Si no hay configuración, usa z-ai-web-dev-sdk por defecto.
// Si z-ai-web-dev-sdk falla, devuelve null → los llamadores usan fallback.

import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import type { AiInsightType } from '@/lib/validation'

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export interface AiInsightResult {
  id: string
  type: AiInsightType
  title: string
  content: string
  aiGenerated: boolean
  metadata: Record<string, unknown> | null
  createdAt: Date
}

export interface SaveInsightInput {
  type: AiInsightType
  title: string
  content: string
  aiGenerated: boolean
  metadata?: Record<string, unknown> | null
}

export interface ListInsightsFilters {
  type?: AiInsightType
  aiGenerated?: boolean
  limit?: number
  offset?: number
}

export interface ListInsightsResult {
  insights: AiInsightResult[]
  total: number
}

export interface AiStats {
  total: number
  byType: Record<string, number>
  aiGenerated: number
  fallback: number
  lastGeneratedAt: Date | null
  provider: string
  configured: boolean
}

interface LlmConfig {
  provider: string
  apiKey?: string
  apiUrl?: string
  model?: string
}

// ------------------------------------------------------------
// Config loader — lee credenciales desde IntegrationSetting
// ------------------------------------------------------------

let cachedConfig: { config: LlmConfig | null; expires: number } = {
  config: null,
  expires: 0,
}
const CONFIG_TTL_MS = 60_000 // 1 minuto

export async function getLlmConfig(): Promise<LlmConfig | null> {
  const now = Date.now()
  if (cachedConfig.config !== null && now < cachedConfig.expires) {
    return cachedConfig.config
  }

  try {
    const setting = await db.integrationSetting.findUnique({
      where: { provider: 'AI_LLM' },
    })
    if (!setting || !setting.active) {
      cachedConfig = { config: null, expires: now + CONFIG_TTL_MS }
      return null
    }
    const cfg = JSON.parse(setting.config) as LlmConfig
    cachedConfig = { config: cfg, expires: now + CONFIG_TTL_MS }
    return cfg
  } catch {
    return null
  }
}

/** True si hay un proveedor de IA configurado. */
export async function isAiConfigured(): Promise<boolean> {
  const cfg = await getLlmConfig()
  return cfg !== null && cfg.provider !== 'z-ai-sdk'
}

// ------------------------------------------------------------
// LLM bridge — soporta múltiples proveedores
// ------------------------------------------------------------

/**
 * Llama al LLM configurado con system + user prompt.
 * Devuelve el texto generado o null si falla.
 *
 * Orden de preferencia:
 *   1. Si hay config de IA (AI_LLM): usar ese proveedor
 *   2. Si no hay config: usar z-ai-web-dev-sdk (default, sin costo)
 *   3. Si todo falla: devolver null (el llamador usa fallback estadístico)
 */
export async function callLLM(
  systemPrompt: string,
  userPrompt: string,
): Promise<string | null> {
  const config = await getLlmConfig()

  // Si hay config personalizada, usarla.
  if (config && config.provider !== 'z-ai-sdk') {
    try {
      const result = await callExternalLLM(config, systemPrompt, userPrompt)
      if (result) return result
      // Si el proveedor externo falla, caer a z-ai-sdk como fallback.
      logger.warn('ai.callLLM external-failed-falling-back-to-zai', {
        provider: config.provider,
      })
    } catch (err) {
      logger.warn('ai.callLLM external-error', {
        provider: config.provider,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Default: z-ai-web-dev-sdk (sin costo, incluido en el sandbox).
  return callZaiLLM(systemPrompt, userPrompt)
}

/** Llama a z-ai-web-dev-sdk (default, sin credenciales). */
async function callZaiLLM(
  systemPrompt: string,
  userPrompt: string,
): Promise<string | null> {
  try {
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      thinking: { type: 'disabled' },
    })
    const content = completion?.choices?.[0]?.message?.content
    if (!content || typeof content !== 'string') {
      logger.warn('ai.callZaiLLM empty-response')
      return null
    }
    return content.trim()
  } catch (err) {
    logger.warn('ai.callZaiLLM failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/** Llama a OpenAI, Anthropic, o Custom (OpenAI-compatible). */
async function callExternalLLM(
  config: LlmConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string | null> {
  const { provider, apiKey, apiUrl, model } = config
  if (!apiKey) return null

  // --- OpenAI / Custom (OpenAI-compatible API) ---
  if (provider === 'openai' || provider === 'custom') {
    const baseUrl = apiUrl || 'https://api.openai.com/v1'
    const modelName = model || 'gpt-4o-mini'
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 2000,
        }),
      })
      if (!res.ok) {
        const errText = await res.text()
        logger.error('ai.callExternalLLM openai failed', {
          status: res.status,
          errText: errText.slice(0, 200),
        })
        return null
      }
      const json = (await res.json()) as {
        choices: Array<{ message: { content: string } }>
      }
      const content = json.choices?.[0]?.message?.content
      return content?.trim() ?? null
    } catch (err) {
      logger.error('ai.callExternalLLM openai error', {
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  // --- Anthropic (Claude) ---
  if (provider === 'anthropic') {
    const modelName = model || 'claude-3-5-sonnet-20241022'
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: modelName,
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })
      if (!res.ok) {
        const errText = await res.text()
        logger.error('ai.callExternalLLM anthropic failed', {
          status: res.status,
          errText: errText.slice(0, 200),
        })
        return null
      }
      const json = (await res.json()) as {
        content: Array<{ type: string; text: string }>
      }
      const content = json.content?.[0]?.text
      return content?.trim() ?? null
    } catch (err) {
      logger.error('ai.callExternalLLM anthropic error', {
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  return null
}

// ------------------------------------------------------------
// Persistence
// ------------------------------------------------------------

export async function saveInsight(input: SaveInsightInput): Promise<AiInsightResult> {
  const record = await db.aiInsight.create({
    data: {
      type: input.type,
      title: input.title,
      content: input.content,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  })
  logger.info('ai.saveInsight', {
    id: record.id,
    type: record.type,
    aiGenerated: input.aiGenerated,
  })
  return {
    id: record.id,
    type: record.type as AiInsightType,
    title: record.title,
    content: record.content,
    aiGenerated: input.aiGenerated,
    metadata: input.metadata ?? null,
    createdAt: record.createdAt,
  }
}

// ------------------------------------------------------------
// Query helpers
// ------------------------------------------------------------

function rowToResult(row: {
  id: string
  type: string
  title: string
  content: string
  metadata: string | null
  createdAt: Date
}): AiInsightResult {
  let metadata: Record<string, unknown> | null = null
  let aiGenerated = false
  if (row.metadata) {
    try {
      const parsed = JSON.parse(row.metadata) as Record<string, unknown>
      metadata = parsed
      if (typeof parsed.aiGenerated === 'boolean') {
        aiGenerated = parsed.aiGenerated
      }
    } catch {
      metadata = null
    }
  }
  return {
    id: row.id,
    type: row.type as AiInsightType,
    title: row.title,
    content: row.content,
    aiGenerated,
    metadata,
    createdAt: row.createdAt,
  }
}

export async function listInsights(
  filters: ListInsightsFilters = {},
): Promise<ListInsightsResult> {
  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100)
  const offset = Math.max(filters.offset ?? 0, 0)

  const where: {
    type?: string
    metadata?: { contains: string }
  } = {}
  if (filters.type) where.type = filters.type
  if (typeof filters.aiGenerated === 'boolean') {
    where.metadata = { contains: `"aiGenerated":${filters.aiGenerated}` }
  }

  const [rows, total] = await Promise.all([
    db.aiInsight.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.aiInsight.count({ where }),
  ])

  return {
    insights: rows.map(rowToResult),
    total,
  }
}

export async function getLatestInsight(
  type: AiInsightType,
): Promise<AiInsightResult | null> {
  const row = await db.aiInsight.findFirst({
    where: { type },
    orderBy: { createdAt: 'desc' },
  })
  return row ? rowToResult(row) : null
}

export async function getAiStats(): Promise<AiStats> {
  const rows = await db.aiInsight.findMany({
    select: { type: true, metadata: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  const byType: Record<string, number> = {}
  let aiGenerated = 0
  let fallback = 0
  let lastGeneratedAt: Date | null = null

  for (const r of rows) {
    byType[r.type] = (byType[r.type] ?? 0) + 1
    let isAi = false
    if (r.metadata) {
      try {
        const parsed = JSON.parse(r.metadata) as Record<string, unknown>
        if (typeof parsed.aiGenerated === 'boolean') isAi = parsed.aiGenerated
      } catch {
        // noop
      }
    }
    if (isAi) aiGenerated++
    else fallback++
    if (!lastGeneratedAt) lastGeneratedAt = r.createdAt
  }

  const config = await getLlmConfig()

  return {
    total: rows.length,
    byType,
    aiGenerated,
    fallback,
    lastGeneratedAt,
    provider: config?.provider ?? 'z-ai-sdk (default)',
    configured: config !== null && config.provider !== 'z-ai-sdk',
  }
}
