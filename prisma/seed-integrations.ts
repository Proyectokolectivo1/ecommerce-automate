// ============================================================
// seed-integrations.ts — Seed default integration settings
// ============================================================
// Crea IntegrationSetting con configs mock/sandbox por defecto para
// los 9 proveedores. Solo crea si no existen (upsert con skip update).

import { db } from '../src/lib/db'

const defaults = [
  {
    provider: 'SHOPIFY',
    config: { shop: '', accessToken: '', apiSecret: '', apiKey: '' },
    active: false,
  },
  {
    provider: 'MASTERSHOP',
    config: { apiUrl: 'https://api.mastershop.com', apiKey: 'mock', merchantId: '', defaultCarrier: 'SERVIENTREGA' },
    active: true,
  },
  {
    provider: 'WOMPI',
    config: { publicKey: '', privateKey: '', integritySecret: '', sandbox: true },
    active: true,
  },
  {
    provider: 'PAYU',
    config: { apiKey: '', publicKey: '', merchantId: '', accountId: '', sandbox: true },
    active: false,
  },
  {
    provider: 'MERCADOPAGO',
    config: { apiKey: '', accessToken: '', secret: '', sandbox: true },
    active: false,
  },
  {
    provider: 'EPAYCO',
    config: { publicKey: '', privateKey: '', merchantId: '', secret: '', sandbox: true },
    active: false,
  },
  {
    provider: 'BOLD',
    config: { apiKey: '', publicKey: '', secret: '', sandbox: true },
    active: false,
  },
  {
    provider: 'WHATSAPP',
    config: { phoneNumberId: '', accessToken: '', templateName: 'pago_transporte' },
    active: false,
  },
  {
    provider: 'EMAIL',
    config: { provider: 'resend', apiKey: '', fromAddress: 'no-reply@ecommerce.com', fromName: 'Ecommerce' },
    active: false,
  },
]

async function main() {
  let created = 0
  for (const d of defaults) {
    const result = await db.integrationSetting.upsert({
      where: { provider: d.provider },
      create: { provider: d.provider, config: JSON.stringify(d.config), active: d.active },
      update: {}, // no sobrescribe configs existentes
    })
    created++
    console.log(`  ✓ ${result.provider} (active=${result.active})`)
  }
  const total = await db.integrationSetting.count()
  console.log(`\nDone. ${created} integration settings ensured. Total in DB: ${total}`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
