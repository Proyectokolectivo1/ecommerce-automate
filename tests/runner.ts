// ============================================================
// runner.ts — Minimal test runner (no framework dependency)
// ============================================================
// Utilidad para escribir y ejecutar pruebas unitarias por módulo
// sin depender de jest/vitest. Cada test reporta PASS/FAIL y se
// acumulan resultados para un reporte final.
//
// Uso:
//   import { describe, it, expect, runAll } from './runner'
//   describe('Módulo X', () => {
//     it('función Y hace Z', () => {
//       expect(result).toBe(expected)
//     })
//   })
//   await runAll()

export interface TestResult {
  module: string
  name: string
  passed: boolean
  error?: string
  durationMs: number
}

const results: TestResult[] = []
let currentModule = ''
let passed = 0
let failed = 0

/** Define un grupo de tests bajo un nombre de módulo. */
export function describe(module: string, fn: () => void | Promise<void>): void {
  currentModule = module
  fn()
}

/** Define un test individual. Soporta async. */
export function it(name: string, fn: () => void | Promise<void>): void {
  const start = Date.now()
  try {
    const result = fn()
    // Si es async (Promise), lo encolamos para evaluar después.
    if (result instanceof Promise) {
      pendingAsync.push(
        result
          .then(() => {
            results.push({ module: currentModule, name, passed: true, durationMs: Date.now() - start })
            passed++
          })
          .catch((err) => {
            results.push({
              module: currentModule,
              name,
              passed: false,
              error: err instanceof Error ? err.message : String(err),
              durationMs: Date.now() - start,
            })
            failed++
          }),
      )
    } else {
      results.push({ module: currentModule, name, passed: true, durationMs: Date.now() - start })
      passed++
    }
  } catch (err) {
    results.push({
      module: currentModule,
      name,
      passed: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    })
    failed++
  }
}

const pendingAsync: Promise<void>[] = []

// ------------------------------------------------------------
// Expect / matchers
// ------------------------------------------------------------

export function expect<T>(actual: T): ExpectChain<T> {
  return {
    toBe(expected: T) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`)
      }
    },
    toEqual(expected: unknown) {
      if (!deepEqual(actual, expected)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to deeply equal ${JSON.stringify(expected)}`)
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be truthy`)
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be falsy`)
      }
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be null`)
      }
    },
    toBeGreaterThan(n: number) {
      if (typeof actual !== 'number' || actual <= n) {
        throw new Error(`Expected ${actual} to be greater than ${n}`)
      }
    },
    toBeGreaterThanOrEqual(n: number) {
      if (typeof actual !== 'number' || actual < n) {
        throw new Error(`Expected ${actual} to be greater than or equal ${n}`)
      }
    },
    toBeLessThan(n: number) {
      if (typeof actual !== 'number' || actual >= n) {
        throw new Error(`Expected ${actual} to be less than ${n}`)
      }
    },
    toBeLessThanOrEqual(n: number) {
      if (typeof actual !== 'number' || actual > n) {
        throw new Error(`Expected ${actual} to be less than or equal ${n}`)
      }
    },
    toContain(item: unknown) {
      if (typeof actual === 'string') {
        if (!actual.includes(String(item))) {
          throw new Error(`Expected "${actual}" to contain "${item}"`)
        }
      } else if (Array.isArray(actual)) {
        if (!actual.includes(item)) {
          throw new Error(`Expected array to contain ${JSON.stringify(item)}`)
        }
      } else {
        throw new Error(`Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(item)}`)
      }
    },
    toHaveLength(n: number) {
      if (actual == null) {
        throw new Error(`Expected ${JSON.stringify(actual)} to have length ${n}`)
      }
      const len = (actual as unknown as { length: number }).length
      if (len === undefined || len !== n) {
        throw new Error(`Expected length ${len} to be ${n}`)
      }
    },
    toHaveProperty(prop: string) {
      if (actual == null || typeof actual !== 'object') {
        throw new Error(`Expected ${JSON.stringify(actual)} to have property "${prop}"`)
      }
      if (!(prop in (actual as object))) {
        throw new Error(`Expected object to have property "${prop}"`)
      }
    },
    toBeInstanceOf(cls: new (...args: unknown[]) => unknown) {
      if (!(actual instanceof cls)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be instance of ${cls.name}`)
      }
    },
    not: {
      toBe(expected: T) {
        if (actual === expected) {
          throw new Error(`Expected ${JSON.stringify(actual)} NOT to be ${JSON.stringify(expected)}`)
        }
      },
      toEqual(expected: unknown) {
        if (deepEqual(actual, expected)) {
          throw new Error(`Expected ${JSON.stringify(actual)} NOT to deeply equal ${JSON.stringify(expected)}`)
        }
      },
      toBeNull() {
        if (actual === null) {
          throw new Error(`Expected ${JSON.stringify(actual)} NOT to be null`)
        }
      },
      toContain(item: unknown) {
        if (typeof actual === 'string') {
          if (actual.includes(String(item))) {
            throw new Error(`Expected "${actual}" NOT to contain "${item}"`)
          }
        } else if (Array.isArray(actual)) {
          if (actual.includes(item)) {
            throw new Error(`Expected array NOT to contain ${JSON.stringify(item)}`)
          }
        }
      },
      toHaveProperty(prop: string) {
        if (actual != null && typeof actual === 'object' && prop in (actual as object)) {
          throw new Error(`Expected object NOT to have property "${prop}"`)
        }
      },
    },
  }
}

interface ExpectChain<T> {
  toBe(expected: T): void
  toEqual(expected: unknown): void
  toBeTruthy(): void
  toBeFalsy(): void
  toBeNull(): void
  toBeGreaterThan(n: number): void
  toBeGreaterThanOrEqual(n: number): void
  toBeLessThan(n: number): void
  toBeLessThanOrEqual(n: number): void
  toContain(item: unknown): void
  toHaveLength(n: number): void
  toHaveProperty(prop: string): void
  toBeInstanceOf(cls: new (...args: unknown[]) => unknown): void
  not: {
    toBe(expected: T): void
    toEqual(expected: unknown): void
    toBeNull(): void
    toContain(item: unknown): void
    toHaveProperty(prop: string): void
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return false
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return a === b
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    if (a.length !== (b as unknown[]).length) return false
    return a.every((v, i) => deepEqual(v, (b as unknown[])[i]))
  }
  const ka = Object.keys(a as object)
  const kb = Object.keys(b as object)
  if (ka.length !== kb.length) return false
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

// ------------------------------------------------------------
// Runner
// ------------------------------------------------------------

/** Ejecuta todos los tests pendientes (incluye async) y muestra el reporte. */
export async function runAll(): Promise<void> {
  await Promise.all(pendingAsync)

  // Reporte por módulo
  const modules = [...new Set(results.map((r) => r.module))]
  console.log('')
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  REPORTE DE PRUEBAS UNITARIAS')
  console.log('═══════════════════════════════════════════════════════════')
  console.log('')

  for (const mod of modules) {
    const modResults = results.filter((r) => r.module === mod)
    const modPassed = modResults.filter((r) => r.passed).length
    const modFailed = modResults.filter((r) => !r.passed).length
    const icon = modFailed === 0 ? '✅' : '❌'
    console.log(`${icon} ${mod}  (${modPassed}/${modResults.length} pasaron)`)

    for (const r of modResults) {
      const status = r.passed ? '  ✓' : '  ✗'
      const time = r.durationMs > 100 ? ` (${r.durationMs}ms)` : ''
      console.log(`${status} ${r.name}${time}`)
      if (!r.passed && r.error) {
        console.log(`      └─ ${r.error.slice(0, 120)}`)
      }
    }
    console.log('')
  }

  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  TOTAL: ${passed + failed} tests | ✅ ${passed} pasaron | ❌ ${failed} fallaron`)
  console.log('═══════════════════════════════════════════════════════════')

  if (failed > 0) {
    process.exitCode = 1
  }
}
