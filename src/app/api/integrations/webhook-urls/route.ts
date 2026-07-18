// ============================================================
// /api/integrations/webhook-urls — Get webhook URLs (server-side)
// ============================================================
// GET — devuelve las URLs de los 3 webhook receivers generadas
// server-side usando NEXTAUTH_URL. Útil para que el admin copie
// las URLs exactas a configurar en Shopify/pasarelas/Mastershop.
//
// También incluye la guía de topics de Shopify webhook a configurar.

import { NextResponse } from 'next/server'
import { getCurrentUserOrFallback } from '@/lib/auth'

export async function GET() {
  const user = await getCurrentUserOrFallback()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

  return NextResponse.json({
    baseUrl,
    webhooks: [
      {
        source: 'SHOPIFY',
        url: `${baseUrl}/api/webhooks/shopify`,
        method: 'POST',
        description: 'Recibe pedidos nuevos y actualizaciones desde Shopify',
        topics: [
          { topic: 'orders/create', description: 'Pedido nuevo creado' },
          { topic: 'orders/updated', description: 'Pedido actualizado' },
          { topic: 'orders/cancelled', description: 'Pedido cancelado' },
          { topic: 'orders/paid', description: 'Pedido pagado (prepaid)' },
          { topic: 'orders/fulfilled', description: 'Pedido cumplido' },
        ],
        headers: ['X-Shopify-Topic', 'X-Shopify-Shop-Domain', 'X-Shopify-Hmac-Sha256', 'X-Shopify-Webhook-Id'],
      },
      {
        source: 'PAYMENTS',
        url: `${baseUrl}/api/webhooks/payments`,
        method: 'POST',
        description: 'Recibe confirmaciones de pago de las 5 pasarelas (Wompi, PayU, MercadoPago, ePayco, Bold)',
        providers: ['WOMPI', 'PAYU', 'MERCADOPAGO', 'EPAYCO', 'BOLD'],
        note: 'Envía el header X-Payment-Provider: {PROVIDER} o el campo "provider" en el body para identificar la pasarela.',
      },
      {
        source: 'MASTERSHOP',
        url: `${baseUrl}/api/webhooks/mastershop`,
        method: 'POST',
        description: 'Recibe callbacks de estado de guía desde Mastershop (IN_TRANSIT, DELIVERED, RETURNED)',
        bodyExample: {
          guide_number: 'SER123456789',
          status: 'DELIVERED',
          message: 'Entregado al cliente',
          city: 'Bogotá',
          occurred_at: '2024-01-15T10:30:00Z',
        },
      },
    ],
    note: 'Configura estas URLs en los paneles de administración de Shopify, las pasarelas de pago y Mastershop respectivamente.',
  })
}
