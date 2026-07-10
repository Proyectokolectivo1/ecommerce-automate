// ============================================================
// orchestrator/index.ts — Minimal flow orchestrator (n8n substitute)
// ============================================================
// Orquestador de flujos en proceso: define flujos como secuencias de
// pasos, los ejecuta pasando un contexto compartido y maneja errores
// saltando a un step `on-failure` si está definido.
// Sustituye a n8n en el sandbox para tareas como:
//   - Generación de guía (validar → crear → imprimir → notificar)
//   - Sincronización de pedido Shopify (fetch → mapear → persistir)
//   - Pago COD (generar link → notificar → confirmar → liberar)

import { logger } from '@/lib/logger'

export type FlowContext = Record<string, unknown>

export interface Step {
  /** Nombre único dentro del flujo */
  name: string
  /** Step a ejecutar si este falla (transición de error). */
  onFailure?: string
  /**
   * Ejecuta el paso. Devuelve un partial del contexto que se mergea
   * con el contexto actual. Lanzar error interrumpe el flujo normal
   * y salta al step `onFailure` si está definido.
   */
  run(ctx: FlowContext): Promise<Partial<FlowContext> | void> | Partial<FlowContext> | void
}

export interface Flow {
  name: string
  steps: Step[]
}

export interface StepResult {
  step: string
  status: 'success' | 'skipped' | 'failed'
  durationMs: number
  error?: string
}

export interface FlowResult {
  flow: string
  status: 'completed' | 'failed'
  steps: StepResult[]
  context: FlowContext
  error?: string
  durationMs: number
}

/**
 * Define un flujo. Valida que los `onFailure` referencien steps existentes.
 */
export function defineFlow(name: string, steps: Step[]): Flow {
  const names = new Set(steps.map((s) => s.name))
  for (const step of steps) {
    if (step.onFailure && !names.has(step.onFailure)) {
      throw new Error(
        `defineFlow("${name}"): step "${step.name}" referencia onFailure "${step.onFailure}" que no existe`,
      )
    }
  }
  return { name, steps }
}

/**
 * Ejecuta un flujo. Recorre los steps en orden, mergea los resultados
 * al contexto y maneja errores saltando a `onFailure`.
 */
export async function runFlow(
  flow: Flow,
  initialContext: FlowContext = {},
): Promise<FlowResult> {
  const start = Date.now()
  const ctx: FlowContext = { ...initialContext }
  const results: StepResult[] = []
  const stepByName = new Map(flow.steps.map((s) => [s.name, s]))

  let cursor = 0
  let status: 'completed' | 'failed' = 'completed'
  let flowError: string | undefined

  while (cursor < flow.steps.length) {
    const step = flow.steps[cursor]
    const stepStart = Date.now()
    try {
      logger.info(`orchestrator.run step ${flow.name}/${step.name}`)
      const patch = await step.run(ctx)
      if (patch && typeof patch === 'object') {
        Object.assign(ctx, patch)
      }
      results.push({
        step: step.name,
        status: 'success',
        durationMs: Date.now() - stepStart,
      })
      cursor++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(`orchestrator.fail step ${flow.name}/${step.name}`, { error: message })
      results.push({
        step: step.name,
        status: 'failed',
        durationMs: Date.now() - stepStart,
        error: message,
      })

      if (step.onFailure) {
        const target = stepByName.get(step.onFailure)
        if (target) {
          cursor = flow.steps.indexOf(target)
          continue
        }
      }
      status = 'failed'
      flowError = message
      break
    }
  }

  const durationMs = Date.now() - start
  logger.info(`orchestrator.done ${flow.name}`, { status, durationMs })
  return {
    flow: flow.name,
    status,
    steps: results,
    context: ctx,
    error: flowError,
    durationMs,
  }
}

// ------------------------------------------------------------
// Registry singleton
// ------------------------------------------------------------

class Orchestrator {
  private flows = new Map<string, Flow>()

  register(flow: Flow): void {
    if (this.flows.has(flow.name)) {
      logger.warn(`orchestrator.register sobreescribiendo flujo "${flow.name}"`)
    }
    this.flows.set(flow.name, flow)
    logger.debug(`orchestrator.register ${flow.name}`)
  }

  execute(name: string, context: FlowContext = {}): Promise<FlowResult> {
    const flow = this.flows.get(name)
    if (!flow) {
      return Promise.resolve({
        flow: name,
        status: 'failed',
        steps: [],
        context,
        error: `Flujo "${name}" no registrado`,
        durationMs: 0,
      })
    }
    return runFlow(flow, context)
  }

  has(name: string): boolean {
    return this.flows.has(name)
  }

  list(): string[] {
    return Array.from(this.flows.keys())
  }
}

export const orchestrator = new Orchestrator()
