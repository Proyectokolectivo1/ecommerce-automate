// ============================================================
// export.ts — CSV export utility
// ============================================================
// Genera CSV desde arrays de objetos. Soporta:
//   - Selección de columnas
//   - Escaping de comas, comillas y saltos de línea
//   - BOM UTF-8 para Excel
//   - Descarga directa desde API route

export interface CsvColumn<T> {
  /** Nombre de la columna en el CSV. */
  header: string
  /** Función que extrae el valor de cada fila. */
  accessor: (row: T) => string | number | boolean | null | undefined
}

/**
 * Genera un string CSV desde un array de objetos.
 *
 * @param data - filas a exportar
 * @param columns - definición de columnas
 * @returns string CSV con BOM UTF-8
 */
export function toCsv<T>(data: T[], columns: CsvColumn<T>[]): string {
  // BOM UTF-8 para que Excel reconozca los caracteres especiales.
  const BOM = '\uFEFF'

  // Header row
  const header = columns.map((c) => escapeCsvValue(c.header)).join(',')

  // Data rows
  const rows = data.map((row) =>
    columns
      .map((col) => escapeCsvValue(col.accessor(row)))
      .join(','),
  )

  return BOM + header + '\n' + rows.join('\n') + '\n'
}

/** Escapa un valor para CSV (comas, comillas, saltos de línea). */
function escapeCsvValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  // Si contiene coma, comilla, salto de línea o BOM, envolver en comillas.
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    // Duplicar comillas internas.
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Crea una Response con el CSV para descarga directa.
 */
export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
