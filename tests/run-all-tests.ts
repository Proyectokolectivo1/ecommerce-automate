// ============================================================
// run-all-tests.ts — Runner principal que ejecuta todas las pruebas
// ============================================================
// Ejecuta todos los suites de pruebas por módulo y muestra el reporte.
// Uso: bun run tests/run-all-tests.ts

import { runAll } from './runner'
import { runOrdersTests } from './modules/orders.test'
import { runCustomersTests } from './modules/customers.test'
import { runPaymentsLogisticsTests } from './modules/payments-logistics.test'
import { runAnalyticsAiTests } from './modules/analytics-ai.test'
import { runAlertsAdminTests } from './modules/alerts-admin.test'

async function main(): Promise<void> {
  console.log('')
  console.log('🧪 Iniciando pruebas unitarias por módulo...')
  console.log('   Base de datos: SQLite (db/custom.db)')
  console.log('')

  // Ejecutar todos los suites (cada uno registra sus tests via describe/it)
  runOrdersTests()
  runCustomersTests()
  runPaymentsLogisticsTests()
  runAnalyticsAiTests()
  runAlertsAdminTests()

  // Esperar a que todos los tests async terminen y mostrar reporte
  await runAll()
}

main().catch((err) => {
  console.error('Error fatal ejecutando pruebas:', err)
  process.exit(1)
})
