// ============================================================
// /dashboard/pedidos — Pedidos management page (server)
// ============================================================
// Página de gestión de pedidos. Server component que:
//  1) Verifica la sesión (layout ya redirige si no la hay).
//  2) Fetch inicial server-side de 20 pedidos para primer
//     render rápido (sin flaquear el cliente).
//  3) Renderiza <OrdersView> con los datos iniciales.

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import {
  listOrders,
  getOrderStats,
} from '@/modules/orders/order.service'
import { OrdersView } from '@/components/orders/orders-view'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

export default async function PedidosPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  // Fetch inicial server-side (primer render rápido).
  const [{ orders, total }, stats] = await Promise.all([
    listOrders({ limit: 20, offset: 0 }),
    getOrderStats(),
  ])

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight">
            Pedidos
            <Badge variant="secondary" className="text-sm">
              {total} totales
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            Gestión de pedidos · sigue el ciclo de vida de cada orden y ejecuta
            transiciones de estado.
          </p>
        </div>
        {stats.codPendingCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            <span className="font-semibold">{stats.codPendingCount}</span>
            pedidos COD con pago de transporte pendiente.
          </div>
        )}
      </header>

      <OrdersView
        initialOrders={orders as unknown as React.ComponentProps<typeof OrdersView>['initialOrders']}
        initialTotal={total}
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        }}
      />
    </div>
  )
}
