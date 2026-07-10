// ============================================================
// notifications-bell.tsx — Bell icon with popover (placeholder)
// ============================================================
// Muestra 3 notificaciones dummy estáticas. En una tarea posterior
// se conectará a la tabla Notification + WebSocket en tiempo real.

'use client'

import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'

interface DummyNotification {
  id: string
  title: string
  description: string
  time: string
}

const NOTIFICATIONS: DummyNotification[] = [
  {
    id: '1',
    title: 'Nuevo pedido #1042',
    description: 'Pedido pagado por $ 189.000 — listo para preparar.',
    time: 'hace 5 min',
  },
  {
    id: '2',
    title: 'Guía impresa',
    description: 'Guía ENVIA-784120 generada para el pedido #1041.',
    time: 'hace 22 min',
  },
  {
    id: '3',
    title: 'Alerta de inventario',
    description: 'Producto "Camiseta Negra M" por debajo del mínimo (3 uds).',
    time: 'hace 1 h',
  },
]

export function NotificationsBell() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Notificaciones"
        >
          <Bell className="size-4" />
          <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
            3
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">Notificaciones</span>
          <span className="text-xs text-muted-foreground">3 nuevas</span>
        </div>
        <ScrollArea className="max-h-80">
          <ul className="divide-y">
            {NOTIFICATIONS.map((n) => (
              <li
                key={n.id}
                className="flex flex-col gap-0.5 px-4 py-3 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium leading-tight">
                    {n.title}
                  </span>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {n.time}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground leading-snug">
                  {n.description}
                </span>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
