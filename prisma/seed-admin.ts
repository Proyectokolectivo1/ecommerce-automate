// ============================================================
// seed-admin.ts — One-off seed for the demo admin user
// ============================================================
// Crea (o actualiza) el usuario admin@demo.com / admin123 con rol ADMIN.
// Idempotente: se puede correr varias veces sin duplicar.
//
// Uso: bun run prisma/seed-admin.ts

import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/auth-utils'

async function main() {
  const email = 'admin@demo.com'
  const passwordHash = hashPassword('admin123')

  const user = await db.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: 'ADMIN',
      active: true,
    },
    create: {
      email,
      name: 'Administrador Demo',
      passwordHash,
      role: 'ADMIN',
      active: true,
    },
  })

  console.log('✅ Admin user ready:', user.email, '| role:', user.role)
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
