'use client'

// ============================================================
// /dashboard/documentacion — Documentation page
// ============================================================
// Client component. Pestañas con dos manuales: Usuario (9
// secciones) y Técnico (11 secciones). Cada sección es
// colapsable.

import { useState } from 'react'
import {
  BookOpen,
  Code2,
  ChevronDown,
  Rocket,
  ShieldCheck,
  Compass,
  ShoppingCart,
  Truck,
  LayoutDashboard,
  Sparkles,
  Bell,
  HelpCircle,
  Layers,
  Boxes,
  Database,
  GitBranch,
  Plug,
  Webhook,
  Radio,
  Lock,
  Cpu,
  AlertTriangle,
  Terminal,
  type LucideIcon,
} from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/format'

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

interface DocSection {
  id: string
  title: string
  icon: LucideIcon
  summary: string
  content: React.ReactNode
}

// ------------------------------------------------------------
// Manual de Usuario (9 secciones)
// ------------------------------------------------------------

const USER_MANUAL: DocSection[] = [
  {
    id: 'intro',
    title: '1. Introducción',
    icon: Rocket,
    summary: 'Bienvenida a la plataforma de ecommerce inteligente.',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
        <p>
          La plataforma <strong>Ecommerce Inteligente</strong> centraliza la
          operación completa de tu tienda online: pedidos, clientes, productos,
          envíos, devoluciones, finanzas, alertas e insights generados por IA.
        </p>
        <p>
          Está diseñada para equipos pequeños y medianos que necesitan
          automatizar el ciclo de vida del pedido, desde la recepción en
          Shopify/Mastershop hasta la entrega al cliente final, con auditoría
          completa y reportes ejecutivos en tiempo real.
        </p>
        <p>
          Esta documentación te guía por las funcionalidades disponibles según
          tu rol y muestra cómo ejecutar las tareas más comunes.
        </p>
      </div>
    ),
  },
  {
    id: 'roles',
    title: '2. Roles y permisos',
    icon: ShieldCheck,
    summary: 'ADMIN, GERENCIA, BODEGA y SERVICIO con accesos diferenciados.',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
        <p>El sistema define 4 roles con permisos accumulativos:</p>
        <ul className="space-y-2 ml-4 list-disc">
          <li>
            <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">ADMIN</Badge>{' '}
            <strong>Administrador</strong> — acceso total, gestión de usuarios,
            integraciones y configuración.
          </li>
          <li>
            <Badge variant="outline" className="border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">GERENCIA</Badge>{' '}
            <strong>Gerencia</strong> — acceso a dashboards, finanzas,
            inteligencia IA y exportaciones.
          </li>
          <li>
            <Badge variant="outline" className="border-teal-300 bg-teal-100 text-teal-700 dark:border-teal-700 dark:bg-teal-900/30 dark:text-teal-300">BODEGA</Badge>{' '}
            <strong>Bodega</strong> — preparación de pedidos, guías, impresión
            y transiciones de estado.
          </li>
          <li>
            <Badge variant="outline" className="border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-200">SERVICIO</Badge>{' '}
            <strong>Servicio al cliente</strong> — consulta de pedidos,
            clientes y descarga de guías PDF.
          </li>
        </ul>
        <p className="text-xs text-muted-foreground">
          Nota: el rol ADMIN es super-usuario y siempre tiene acceso a todas
          las secciones, sin importar los permisos asignados a otros roles.
        </p>
      </div>
    ),
  },
  {
    id: 'navegacion',
    title: '3. Navegación',
    icon: Compass,
    summary: 'Barra lateral organizada por secciones operativas.',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
        <p>
          La barra lateral (izquierda en desktop, menú hamburguesa en móvil)
          agrupa las secciones en 4 categorías:
        </p>
        <ul className="space-y-1.5 ml-4 list-disc">
          <li><strong>Operación</strong> — Dashboard, Pedidos, Clientes, Productos.</li>
          <li><strong>Logística</strong> — Guías, Impresión, Devoluciones.</li>
          <li><strong>Análisis</strong> — Finanzas, Inteligencia IA, Alertas.</li>
          <li><strong>Configuración</strong> — Integraciones, Usuarios, Auditoría.</li>
        </ul>
        <p>
          El topbar superior tiene el toggle de tema claro/oscuro, el botón de
          notificaciones en tiempo real y el menú de usuario con opción de
          cerrar sesión.
        </p>
      </div>
    ),
  },
  {
    id: 'pedidos',
    title: '4. Gestión de pedidos',
    icon: ShoppingCart,
    summary: 'FSM de 8 estados, transiciones validadas y filtros avanzados.',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
        <p>
          La página <strong>Pedidos</strong> muestra el listado completo con
          filtros por estado, método de pago y búsqueda libre. Al hacer clic
          en una fila se abre el detalle lateral con:
        </p>
        <ul className="space-y-1.5 ml-4 list-disc">
          <li>Datos del cliente, dirección y método de pago.</li>
          <li>Items del pedido con cantidades y precios.</li>
          <li>Línea de tiempo de transiciones de estado.</li>
          <li>Botón <strong>Transicionar</strong> para avanzar el estado.</li>
        </ul>
        <p>La máquina de estados finita (FSM) define 8 estados:</p>
        <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-[11px] font-mono leading-relaxed">
{`NUEVO → PENDIENTE_PAGO_TRANSPORTE → PAGO_TRANSPORTE_CONFIRMADO
     ↓                                ↓
  PREPARANDO ←────────────────────────┘
     ↓
  ENVIADO → ENTREGADO  ✓ terminal
        ↘ → DEVUELTO   ✓ terminal
        ↘ → CANCELADO  ✓ terminal`}
        </pre>
        <p>
          Las transiciones inválidas se rechazan y se registran en el log de
          auditoría junto con el usuario que las intentó.
        </p>
      </div>
    ),
  },
  {
    id: 'cod',
    title: '5. Flujo COD (Contra Entrega)',
    icon: Truck,
    summary: 'Confirmación de pago de transporte y link de pago Bold.',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
        <p>
          Los pedidos <strong>COD (Contra Entrega)</strong> siguen un flujo
          especial donde el cliente paga el transporte antes del despacho:
        </p>
        <ol className="space-y-1.5 ml-4 list-decimal">
          <li>El pedido llega como <code>NUEVO</code> con método COD.</li>
          <li>Transiciona a <code>PENDIENTE_PAGO_TRANSPORTE</code>.</li>
          <li>Se genera un link de pago (Bold/Wompi) y se envía al cliente.</li>
          <li>Al confirmarse el pago (webhook), pasa a <code>PAGO_TRANSPORTE_CONFIRMADO</code>.</li>
          <li>Luego <code>PREPARANDO</code> → <code>ENVIADO</code> → <code>ENTREGADO</code>.</li>
        </ol>
        <p>
          El dashboard muestra una alerta amarilla cuando hay pedidos COD con
          pago de transporte pendiente, para que el equipo de servicio al
          cliente haga seguimiento.
        </p>
      </div>
    ),
  },
  {
    id: 'dashboard',
    title: '6. Dashboard ejecutivo',
    icon: LayoutDashboard,
    summary: 'KPIs en tiempo real, tendencias y top productos.',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
        <p>
          El <strong>Dashboard</strong> es la pantalla principal con KPIs de
          ventas del día, semana, mes y año, junto a:
        </p>
        <ul className="space-y-1.5 ml-4 list-disc">
          <li>Tendencia de ventas de 14 días (área + línea de pedidos).</li>
          <li>Distribución de pedidos por estado (gráfico de barras).</li>
          <li>Desglose por método de pago (prepagado vs COD).</li>
          <li>Rentabilidad: ingresos, costos y utilidad neta.</li>
          <li>Top 5 productos por ingreso.</li>
          <li>Resumen de devoluciones con tasa y valor perdido.</li>
          <li>Últimos 5 pedidos recibidos.</li>
        </ul>
        <p>
          Los datos se cachean 60 segundos en servidor y se actualizan al
          refrescar la página.
        </p>
      </div>
    ),
  },
  {
    id: 'ia',
    title: '7. Inteligencia IA',
    icon: Sparkles,
    summary: 'Predicciones, anomalías y resúmenes generados por IA.',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
        <p>
          La sección <strong>Inteligencia IA</strong> permite generar 4 tipos
          de insight:
        </p>
        <ul className="space-y-1.5 ml-4 list-disc">
          <li><strong>Predicción de ventas</strong> — proyección 7 días.</li>
          <li><strong>Detección de anomalías</strong> — patrones inusuales.</li>
          <li><strong>Resumen mensual</strong> — executive summary.</li>
          <li><strong>Análisis de productos</strong> — oportunidades de catálogo.</li>
        </ul>
        <p>
          Cada insight se guarda con su tipo, contenido en markdown y marca
          de tiempo. Los insights generados por IA real llevan el badge{' '}
          <em>"Generado por IA"</em>; cuando el modelo no está disponible se
          usa un <em>fallback</em> predefinido con datos históricos.
        </p>
        <p className="text-xs text-muted-foreground">
          Los insights se listan en orden cronológico y se pueden expandir
          para ver el contenido markdown renderizado.
        </p>
      </div>
    ),
  },
  {
    id: 'alertas',
    title: '8. Alertas operativas',
    icon: Bell,
    summary: 'Centro de alertas con auto-refresh y resolución.',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
        <p>El sistema genera 5 tipos de alertas automáticamente:</p>
        <ul className="space-y-1.5 ml-4 list-disc">
          <li><strong>COD_UNPAID</strong> — pedidos COD con pago pendiente &gt; 24h.</li>
          <li><strong>GUIDE_ERROR</strong> — fallos al crear guías con Mastershop.</li>
          <li><strong>HIGH_RETURN</strong> — tasa de devolución superior al 5%.</li>
          <li><strong>LOW_INVENTORY</strong> — productos con stock bajo.</li>
          <li><strong>SALES_DROP</strong> — caída de ventas vs promedio.</li>
        </ul>
        <p>
          Cada alerta tiene severidad <code>INFO</code>, <code>WARNING</code> o{' '}
          <code>CRITICAL</code> y se puede resolver manualmente con el botón
          "Resolver". El switch de auto-actualizar refresca cada 10 segundos.
        </p>
      </div>
    ),
  },
  {
    id: 'faq',
    title: '9. Preguntas frecuentes',
    icon: HelpCircle,
    summary: 'Respuestas a las dudas más comunes del equipo.',
    content: (
      <div className="space-y-4 text-sm leading-relaxed text-foreground/90">
        <FaqItem
          q="¿Cómo cambio el estado de un pedido?"
          a="En Pedidos → clic en la fila → botón 'Transicionar' → selecciona el estado destino → confirma."
        />
        <FaqItem
          q="¿Puedo descargar la guía PDF?"
          a="Sí. En Guías, busca la fila y haz clic en el enlace PDF junto al número de guía. Requiere rol ADMIN, BODEGA o SERVICIO."
        />
        <FaqItem
          q="¿Cómo se calcula la rentabilidad?"
          a="Ingresos = sum(total) de pedidos no cancelados/devueltos. Costos = CostEntry del último mes (producto, envío, publicidad, operación). Utilidad neta = ingresos − costos totales."
        />
        <FaqItem
          q="¿Las alertas se generan automáticamente?"
          a="Sí, los workers del sistema las crean cuando se detecta la condición. También pueden resolverse manualmente."
        />
        <FaqItem
          q="¿Puedo crear un usuario con rol ADMIN?"
          a="Solo un ADMIN existente puede crear nuevos usuarios y asignar cualquier rol, incluido ADMIN."
        />
        <FaqItem
          q="¿Dónde veo el historial de cambios de un pedido?"
          a="En el detalle del pedido, sección 'Línea de tiempo'. También en Auditoría filtrando por entidad ORDER."
        />
      </div>
    ),
  },
]

// ------------------------------------------------------------
// Manual Técnico (11 secciones)
// ------------------------------------------------------------

const TECH_MANUAL: DocSection[] = [
  {
    id: 'arquitectura',
    title: '1. Arquitectura',
    icon: Layers,
    summary: 'Arquitectura hexagonal con dominio en src/modules/.',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
        <p>Capas principales del sistema:</p>
        <ul className="space-y-1.5 ml-4 list-disc">
          <li><strong>src/modules/</strong> — dominio (orders, logistics, payments, analytics).</li>
          <li><strong>src/integrations/</strong> — adapters externos (Shopify, Mastershop, pagos, notificaciones).</li>
          <li><strong>src/app/api/</strong> — API REST con route handlers de Next.js.</li>
          <li><strong>src/lib/</strong> — fundaciones (auth, db, cache, queue, audit, logger).</li>
          <li><strong>src/components/</strong> — UI components (shadcn/ui + shared + charts).</li>
          <li><strong>mini-services/realtime</strong> — socket.io en puerto 3003 para notificaciones.</li>
        </ul>
        <p>
          El mapeo del stack requerido (NestJS/Postgres/Redis/n8n) al disponible
          usa Next.js 16 + SQLite/Prisma + in-memory cache/queue + orchestrator
          interno, manteniendo la separación de responsabilidades.
        </p>
      </div>
    ),
  },
  {
    id: 'stack',
    title: '2. Stack tecnológico',
    icon: Boxes,
    summary: 'Next.js 16, TypeScript, Prisma, TanStack Query, Recharts.',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
        <ul className="space-y-1.5 ml-4 list-disc">
          <li><strong>Framework</strong> — Next.js 16 con App Router y server/client components.</li>
          <li><strong>Lenguaje</strong> — TypeScript 5 estricto.</li>
          <li><strong>Base de datos</strong> — SQLite + Prisma ORM (client en src/lib/db.ts).</li>
          <li><strong>Autenticación</strong> — NextAuth.js v4 con CredentialsProvider y JWT.</li>
          <li><strong>State</strong> — TanStack Query (server) + Zustand (cliente).</li>
          <li><strong>UI</strong> — Tailwind CSS 4 + shadcn/ui (New York) + Lucide icons.</li>
          <li><strong>Charts</strong> — Recharts con CSS variables.</li>
          <li><strong>Realtime</strong> — Socket.io (mini-service en puerto 3003).</li>
          <li><strong>Validación</strong> — Zod en capa de aplicación.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'modelos',
    title: '3. Modelos de datos',
    icon: Database,
    summary: '18 modelos Prisma con enums como String (limitación SQLite).',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
        <p>Modelos principales definidos en <code>prisma/schema.prisma</code>:</p>
        <ul className="space-y-1.5 ml-4 list-disc">
          <li><strong>User</strong> — cuentas con rol y estado activo.</li>
          <li><strong>Customer</strong> — CRM con clasificación (VIP/FRECUENTE/NUEVO/INACTIVO).</li>
          <li><strong>Product</strong> — catálogo sincronizado desde Shopify.</li>
          <li><strong>Order + OrderItem</strong> — pedidos con FSM de 8 estados.</li>
          <li><strong>OrderStatusLog</strong> — auditoría de transiciones.</li>
          <li><strong>Transaction</strong> — pagos (Bold, Wompi, PayU, etc.).</li>
          <li><strong>Shipment + TrackingEvent</strong> — envíos y seguimiento.</li>
          <li><strong>PrintJob</strong> — cola de impresión de guías.</li>
          <li><strong>Return</strong> — devoluciones con estado (RECEIVED/INSPECTED/RESTOCKED/DISCARDED).</li>
          <li><strong>CostEntry</strong> — costos por categoría (PRODUCT/SHIPPING/ADVERTISING/OPERATION).</li>
          <li><strong>Notification, Alert, AuditLog</strong> — operativos.</li>
          <li><strong>IntegrationSetting, AiInsight</strong> — configuración e insights IA.</li>
        </ul>
        <p className="text-xs text-muted-foreground">
          SQLite no soporta enums ni arrays nativos; se usan String con
          validación Zod. Al migrar a Postgres se pueden convertir a enums sin
          cambiar la lógica de aplicación.
        </p>
      </div>
    ),
  },
  {
    id: 'fsm',
    title: '4. FSM de pedidos',
    icon: GitBranch,
    summary: 'Máquina de estados finita con transiciones validadas.',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
        <p>
          Implementada en <code>src/modules/orders/state-machine.ts</code>.
          Define 8 estados y las transiciones permitidas:
        </p>
        <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-[11px] font-mono leading-relaxed">
{`ORDER_TRANSITIONS = {
  NUEVO: [PENDIENTE_PAGO_TRANSPORTE, PREPARANDO, CANCELADO],
  PENDIENTE_PAGO_TRANSPORTE: [PAGO_TRANSPORTE_CONFIRMADO, CANCELADO],
  PAGO_TRANSPORTE_CONFIRMADO: [PREPARANDO, ENVIADO, CANCELADO],
  PREPARANDO: [ENVIADO, CANCELADO],
  ENVIADO: [ENTREGADO, DEVUELTO],
  ENTREGADO: [],  // terminal
  DEVUELTO: [],   // terminal
  CANCELADO: [],  // terminal
}`}
        </pre>
        <p>Helpers principales:</p>
        <ul className="space-y-1.5 ml-4 list-disc">
          <li><code>canTransition(from, to)</code> — valida si la transición es permitida.</li>
          <li><code>getAllowedTransitions(from)</code> — lista de estados siguientes.</li>
          <li><code>isTerminal(state)</code> — true para ENTREGADO/DEVUELTO/CANCELADO.</li>
          <li><code>ORDER_STATE_LABELS</code> y <code>ORDER_STATE_COLORS</code> — para UI.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'integraciones',
    title: '5. Integraciones',
    icon: Plug,
    summary: '9 proveedores en 4 secciones con credenciales cifradas.',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
        <p>Proveedores soportados (configurables en Integraciones):</p>
        <ul className="space-y-1.5 ml-4 list-disc">
          <li><strong>Ecommerce</strong> — Shopify.</li>
          <li><strong>Logística</strong> — Mastershop (con transportadoras: Servientrega, Envía, Inter Rapidísimo, Coordinadora, TCC).</li>
          <li><strong>Pasarelas de pago</strong> — Wompi, PayU, MercadoPago, ePayco, Bold.</li>
          <li><strong>Notificaciones</strong> — WhatsApp, Email (Resend/SendGrid/SES/SMTP).</li>
        </ul>
        <p>
          Las credenciales se guardan en <code>IntegrationSetting</code> como
          JSON en el campo <code>config</code>. Los secretos se enmascaran al
          mostrarlos en la UI y solo se envían al backend si el usuario los
          modifica.
        </p>
        <p>
          Cada proveedor tiene un botón <strong>Probar</strong> que ejecuta
          una verificación de conexión y devuelve un mensaje de éxito o error.
        </p>
      </div>
    ),
  },
  {
    id: 'webhooks',
    title: '6. Webhooks',
    icon: Webhook,
    summary: '3 endpoints: Shopify, Mastershop y Payments.',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
        <p>Endpoints disponibles (todos <code>POST</code>):</p>
        <ul className="space-y-1.5 ml-4 list-disc">
          <li><code>/api/webhooks/shopify</code> — pedidos creados/pagados/cancelados.</li>
          <li><code>/api/webhooks/mastershop</code> — estado de guías y tracking events.</li>
          <li><code>/api/webhooks/payments</code> — confirmación de pagos Bold/Wompi/etc.</li>
        </ul>
        <p>
          Los webhooks son idempotentes: si reciben el mismo evento dos veces,
          no duplican pedidos ni transiciones. Cada evento se registra en el
          log de auditoría con el payload completo.
        </p>
        <p className="text-xs text-muted-foreground">
          En Integraciones se muestran las URLs de webhook que debes configurar
          en cada proveedor externo.
        </p>
      </div>
    ),
  },
  {
    id: 'realtime',
    title: '7. Tiempo real',
    icon: Radio,
    summary: 'Mini-service Socket.io en puerto 3003 vía Caddy.',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
        <p>
          El mini-service <code>mini-services/realtime/index.ts</code> corre
          socket.io en el puerto 3003 y emite eventos a los clientes
          conectados: nuevas notificaciones, alertas, cambios de estado de
          pedidos y actualizaciones de tracking.
        </p>
        <p>Conexión desde el cliente:</p>
        <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-[11px] font-mono leading-relaxed">
{`import { io } from 'socket.io-client'
const socket = io('/?XTransformPort=3003')
socket.on('notification', (data) => { ... })`}
        </pre>
        <p className="text-xs text-muted-foreground">
          El gateway Caddy enruta las peticiones al puerto correcto usando el
          query param <code>XTransformPort</code>. Nunca usar URLs absolutas
          como <code>http://localhost:3003</code>.
        </p>
      </div>
    ),
  },
  {
    id: 'seguridad',
    title: '8. Seguridad',
    icon: Lock,
    summary: 'NextAuth + JWT + roles + auditoría completa.',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
        <ul className="space-y-1.5 ml-4 list-disc">
          <li>Autenticación con NextAuth v4 y CredentialsProvider.</li>
          <li>Sesión JWT con expiración de 8 horas.</li>
          <li>4 roles (ADMIN/GERENCIA/BODEGA/SERVICIO) con permisos accumulativos.</li>
          <li><code>requireRole()</code> en APIs server-side; <code>canAccess()</code> en cliente.</li>
          <li>Hash de passwords: sha256 + salt (cambiar a bcrypt/argon2 en producción).</li>
          <li>Auditoría completa: toda mutación se registra en <code>AuditLog</code>.</li>
          <li>Validación Zod en cada endpoint antes de tocar la BD.</li>
          <li>Secretos en variables de entorno, nunca en código.</li>
        </ul>
        <p className="text-xs text-muted-foreground">
          El <code>NEXTAUTH_SECRET</code> debe configurarse en producción con
          un valor aleatorio seguro.
        </p>
      </div>
    ),
  },
  {
    id: 'workers',
    title: '9. Workers y procesos',
    icon: Cpu,
    summary: 'Print worker, alert checker y orchestrator interno.',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
        <p>Procesos asíncronos que corren en el servidor:</p>
        <ul className="space-y-1.5 ml-4 list-disc">
          <li><strong>Print worker</strong> — procesa la cola de <code>PrintJob</code> cada N segundos, reintenta fallidos hasta 3 veces.</li>
          <li><strong>Alert checker</strong> — evalúa condiciones (COD sin pagar, guías con error, devolución alta, inventario bajo, caída de ventas) y crea alertas.</li>
          <li><strong>Orchestrator</strong> — coordina el flujo de despacho: crear guía → imprimir → notificar cliente.</li>
          <li><strong>Cache TTL</strong> — invalidación automática cada 60s para endpoints de analítica.</li>
        </ul>
        <p>
          Implementados en <code>src/lib/</code> usando <code>setInterval</code>
          e in-memory queue. En producción deberían migrarse a un job queue
          persistente (BullMQ + Redis).
        </p>
      </div>
    ),
  },
  {
    id: 'limitaciones',
    title: '10. Limitaciones conocidas',
    icon: AlertTriangle,
    summary: 'SQLite, in-memory cache y hash de passwords.',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
        <ul className="space-y-1.5 ml-4 list-disc">
          <li>
            <strong>SQLite</strong> — no soporta enums ni arrays nativos.
            Limita concurrencia de escritura. Migrar a Postgres para producción.
          </li>
          <li>
            <strong>In-memory cache/queue</strong> — se pierde al reiniciar el
            proceso. No apto para multi-instancia.
          </li>
          <li>
            <strong>Password hashing</strong> — sha256 + salt fijo. Cambiar a
            bcrypt o argon2 antes de producción.
          </li>
          <li>
            <strong>Realtime</strong> — socket.io en proceso separado. No
            persiste mensajes si el cliente se desconecta.
          </li>
          <li>
            <strong>Webhooks</strong> — sin retry queue. Si el webhook falla,
            se pierde (debería integrarse con un DLQ).
          </li>
          <li>
            <strong>IA insights</strong> — dependen del servicio z-ai-web-dev-sdk.
            Si no está disponible, se usa fallback predefinido.
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: 'comandos',
    title: '11. Comandos',
    icon: Terminal,
    summary: 'Scripts disponibles en package.json.',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
        <p>Comandos para desarrollo y mantenimiento:</p>
        <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-[11px] font-mono leading-relaxed">
{`bun run dev          # servidor de desarrollo (puerto 3000)
bun run lint         # ESLint
bun run db:push      # aplicar schema a SQLite
bun run db:generate  # regenerar Prisma Client
bun run db:migrate   # crear migración
bun run db:reset     # reset completo (cuidado!)
bun run db:seed      # cargar datos de prueba`}
        </pre>
        <p>Para el mini-service de realtime:</p>
        <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-[11px] font-mono leading-relaxed">
{`cd mini-services/realtime
bun install
bun run dev          # puerto 3003 con auto-reload`}
        </pre>
      </div>
    ),
  },
]

// ------------------------------------------------------------
// Page
// ------------------------------------------------------------

export default function DocumentacionPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <BookOpen className="size-6 text-muted-foreground" aria-hidden />
          Documentación
        </h1>
        <p className="text-sm text-muted-foreground">
          Manuales de usuario y técnico · todo lo que necesitas para operar y
          mantener la plataforma.
        </p>
      </header>

      {/* Tabs */}
      <Tabs defaultValue="user" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="user" className="gap-2">
            <BookOpen className="size-4" />
            <span>Manual de Usuario</span>
          </TabsTrigger>
          <TabsTrigger value="tech" className="gap-2">
            <Code2 className="size-4" />
            <span>Manual Técnico</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="user" className="mt-4 space-y-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                Guía para usuarios finales: cómo operar la plataforma, gestionar
                pedidos y entender el dashboard.{' '}
                <span className="font-medium text-foreground">
                  {USER_MANUAL.length} secciones.
                </span>
              </p>
            </CardContent>
          </Card>
          {USER_MANUAL.map((section) => (
            <DocSectionItem key={section.id} section={section} />
          ))}
        </TabsContent>

        <TabsContent value="tech" className="mt-4 space-y-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                Documentación técnica para desarrolladores: arquitectura, stack,
                modelos, FSM, integraciones y limitaciones.{' '}
                <span className="font-medium text-foreground">
                  {TECH_MANUAL.length} secciones.
                </span>
              </p>
            </CardContent>
          </Card>
          {TECH_MANUAL.map((section) => (
            <DocSectionItem key={section.id} section={section} />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ------------------------------------------------------------
// Section (collapsible)
// ------------------------------------------------------------

function DocSectionItem({ section }: { section: DocSection }) {
  const [open, setOpen] = useState(false)
  const Icon = section.icon

  return (
    <Card className="overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/40"
            aria-expanded={open}
          >
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <h3 className="text-sm font-semibold text-foreground">
                  {section.title}
                </h3>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {section.summary}
                </p>
              </div>
            </div>
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform',
                open && 'rotate-180',
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Separator />
          <div className="p-4">{section.content}</div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

// ------------------------------------------------------------
// FAQ item
// ------------------------------------------------------------

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          className="flex w-full items-center justify-between gap-2 text-left"
          aria-expanded={open}
        >
          <span className="text-sm font-medium text-foreground">
            <HelpCircle className="mr-2 inline size-3.5 text-muted-foreground" />
            {q}
          </span>
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="mt-2 pl-6 text-sm text-muted-foreground">{a}</p>
      </CollapsibleContent>
    </Collapsible>
  )
}
