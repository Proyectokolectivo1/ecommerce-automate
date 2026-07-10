// ============================================================
// format.ts — Formatting helpers (COP currency, dates, percent)
// ============================================================

import { format as formatDateFns, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'

export { cn }

/**
 * Formatea un monto en pesos colombianos.
 * Ej: 1234567 -> "$ 1.234.567"
 */
export function formatCOP(amount: number): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '$ 0'
  const rounded = Math.round(amount)
  const parts = Math.abs(rounded).toLocaleString('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  const sign = rounded < 0 ? '-' : ''
  return `${sign}$ ${parts}`
}

/**
 * Formatea una fecha como "dd/MM/yyyy HH:mm" (hora local Colombia).
 */
export function formatDate(date: Date | string): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? parseISO(date) : date
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '—'
  try {
    return formatDateFns(d, 'dd/MM/yyyy HH:mm', { locale: es })
  } catch {
    return d.toISOString()
  }
}

/**
 * Formatea una fecha corta como "dd/MM/yyyy".
 */
export function formatDateShort(date: Date | string): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? parseISO(date) : date
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '—'
  try {
    return formatDateFns(d, 'dd/MM/yyyy', { locale: es })
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

/**
 * Formatea un porcentaje. Acepta fracción (0.23) o valor (23).
 * Ej: formatPercent(0.2345) -> "23.45%"
 */
export function formatPercent(n: number, fractionDigits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '0%'
  // Heurística: si |n| <= 1 asumimos fracción, sino porcentaje directo.
  const pct = Math.abs(n) <= 1 ? n * 100 : n
  return `${pct.toFixed(fractionDigits)}%`
}

/**
 * Formatea un número con separadores de miles (es-CO).
 */
export function formatNumber(n: number): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '0'
  return n.toLocaleString('es-CO')
}

/**
 * Trunca un string largo agregando …
 */
export function truncate(value: string, max = 60): string {
  if (!value) return ''
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

/**
 * Iniciales a partir de un nombre (máx 2 caracteres).
 */
export function initials(name?: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
