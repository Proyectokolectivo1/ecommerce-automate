# Task ID: 8 — Orders Management Page

**Agent:** full-stack-developer
**Task:** Página de gestión de pedidos — tabla, filtros, drawer de detalle, timeline de estados y diálogo de transición.

## Work Log

- Leí `worklog.md` (Task 1: schema Prisma 18 modelos; Task 3: libs fundación; Task 4: AppShell+providers+login; Task 5: módulo de pedidos + API routes + webhook; Task 6: seed con 15 pedidos en 8 estados). También leí los exports clave: `state-machine.ts`, `order.service.ts`, `types.ts`, `auth.ts`, `format.ts`, las API routes `/api/orders*` y los componentes shadcn/ui (badge, sheet, table, select, alert-dialog, skeleton, scroll-area, dropdown-menu, card, separator, button, tooltip).
- Verifiqué que `src/components/shared/status-badge.tsx` y `src/components/orders/` NO existían cuando empecé (Task 7 dashboard estaba en progreso). Creé ambos desde cero. **Durante mi trabajo, Task 7 terminó y escribió SU versión de `status-badge.tsx`** (sobrescribiendo la mía). Su versión usaba `cn` de `@/lib/format` y exponía props `{ status, label?, className? }` — sin `size`. Mi código consume `<StatusBadge size="sm" />` en timelines y action buttons. Resolución: **mergeé mi prop `size` (con su className `px-1.5 py-0 text-[10px]` para tamaño 'sm') en la versión de Task 7**, manteniendo su API intacta (backward-compatible). También agregué `border` al className base para que las variantes con bg-amber-100 etc. tengan borde consistente.
- **Edité `src/modules/orders/state-machine.ts`** (ORDER_STATE_COLORS): eliminé los colores azules/cyan que Task 5 había introducido (`bg-sky-600`, `bg-cyan-600`) para cumplir la regla de diseño "NO indigo or blue colors". Nueva paleta: zinc (NUEVO), amber (PENDIENTE_PAGO_TRANSPORTE = warning), emerald (PAGO_TRANSPORTE_CONFIRMADO = success), violet (PREPARANDO), teal (ENVIADO), emerald (ENTREGADO = success), destructive (DEVUELTO/CANCELADO). Todos en variante `secondary` con clases custom bg/text + soporte dark.
- **Creé `src/components/shared/status-badge.tsx`** (client): componente reutilizable. Props `status`, `size?: 'sm' | 'default'`, `className?`. Usa `ORDER_STATE_LABELS` y `ORDER_STATE_COLORS` del módulo. Siempre agrega `border` (las variantes secondary/destructive tienen `border-transparent` por defecto en shadcn, así que override con la clase custom). Tamaño `sm` reduce padding/texto.
- **Creé `src/components/orders/transition-dialog.tsx`** (client): AlertDialog de confirmación + variante `TransitionTrigger` (botón que abre el diálogo). Props `open, onClose, orderId, orderNumber?, currentStatus, targetStatus, onSuccess`. Muestra icono AlertTriangle, badge `from → to` (StatusBadge), label legible `currentLabel → targetLabel`, Textarea opcional para `reason` (max 500 chars). Botón Confirmar → `POST /api/orders/[id]/transition` con `{ toStatus, reason }`. Toast `success` al confirmar, `error` si 409/otro. `onSuccess()` invalida queries en el padre.
- **Creé `src/components/orders/order-detail-sheet.tsx`** (client): Sheet lateral derecho (480px desktop, full-width mobile). Props `orderId, onClose, onTransitioned`. Usa `useQuery(['order', orderId])` con `enabled: !!orderId` para `GET /api/orders/[id]`. Secciones: (1) Header con orderNumber + StatusBadge, (2) caja amber destacada "Pago de transporte pendiente" para COD en PENDIENTE_PAGO_TRANSPORTE con botón "Generar link de pago" **disabled** (placeholder para futura tarea), (3) Cliente (nombre, email, phone, city+address), (4) Resumen (fecha, método, codPaid, subtotal, envío, transporte, total), (5) Items (title, sku, qty, unitPrice, total), (6) Envíos (carrier, guideNumber, status badge, timeline de TrackingEvents ordenados occurredAt DESC), (7) Transacciones (provider, type, amount, status badge con colores emerald/amber/zinc por estado), (8) Bitácora de estados (timeline vertical de OrderStatusLog ordenado createdAt DESC — el más reciente arriba, con badge `from → to`, actor label, reason), (9) Acciones — botones por cada transición permitida (`getAllowedTransitions(currentStatus)`) que abren el TransitionDialog; mensaje "estado terminal" si no hay transiciones. Skeleton mientras carga, mensaje de error si falla. Invalida `['order', orderId]` y `['orders']` al ejecutar transición.
- **Creé `src/components/orders/orders-view.tsx`** (client): componente principal del listado. State: `filters { status, search, paymentMethod }`, `debouncedSearch` (300ms via setTimeout en useEffect), `page`, `selectedOrderId`. React Query: `useQuery(['orders', status, paymentMethod, debouncedSearch, page])` con `initialData` (página 0) y `placeholderData: (prev) => prev` para transición suave entre páginas. Layout: (a) Filters bar (Card p-4): Input search con icono Search + debounce, Select estado (8 opciones + Todos), Select método (Prepagado/Contra entrega/Todos), botón "Limpiar" solo visible si hay filtros activos, (b) Tabla (Card p-0 overflow-hidden): contenedor con `max-h-[600px] overflow-auto orders-scroll` (custom scrollbar), header sticky, columnas Pedido (con icono Package + orderNumber + city), Cliente (nombre + email), Fecha (md+), Método (badge COD amber / Prepagado secondary), Estado (StatusBadge), Total (formatCOP, tabular-nums), Acciones (botón "Ver detalle" ghost + Eye icon). Filas clicables (cursor-pointer, role=button, Enter/Space abre detalle). Skeleton rows durante carga inicial. Empty state con icono Inbox + mensaje contextual. Pagination footer: "Mostrando X-Y de Z" + spinner si isFetching + Anterior/Siguiente + núm. página. Click en fila o botón → `setSelectedOrderId(order.id)` → abre `OrderDetailSheet`.
- **Creé `src/app/(dashboard)/dashboard/pedidos/page.tsx`** (server): `getCurrentUser()` → redirect `/login` si no authed. `Promise.all([listOrders({ limit: 20, offset: 0 }), getOrderStats()])` para primer render server-side. Header con h1 "Pedidos" + Badge "X totales" + subtítulo "Gestión de pedidos…" + caja amber si `codPendingCount > 0` mostrando "N pedidos COD con pago de transporte pendiente". Renderiza `<OrdersView initialOrders={orders} initialTotal={total} user={...} />`. `export const dynamic = 'force-dynamic'`.
- **Edité `src/app/globals.css`**: agregué capa `@layer utilities` con clases `.orders-scroll` y `.thin-scroll` para scrollbar fina (8px, thumb gray 25% opacity, hover 45%, transparent track, soporte dark mode). Aplicada a la tabla de pedidos.

## Issues / decisions

- **Initial lint errors fixed**:
  1. `order-detail-sheet.tsx`: React Compiler (`react-hooks/preserve-manual-memoization`) rechazó mi `useMemo` para `statusLogsDesc` porque la dep `order?.statusLogs` era más específica que la dep inferida `order`. Solución: eliminé ambos `useMemo` (allowedTransitions y statusLogsDesc) e inlineé las computaciones — los datos ya vienen cacheados de React Query, el costo es despreciable.
  2. `orders-view.tsx`: `react-hooks/set-state-in-effect` rechazó `setPage(0)` síncrono en `useEffect` al cambiar `filters.status/paymentMethod`. Solución: eliminé el efecto, moví el `setPage(0)` a los `onValueChange` de los Select y al `clearFilters()`. El `setPage(0)` dentro del `setTimeout` del debounce sigue OK porque es diferido (no síncrono en el cuerpo del efecto).
- **Type cast en page.tsx**: `orders as unknown as React.ComponentProps<typeof OrdersView>['initialOrders']` para evitar acoplar el tipo Prisma `OrderListItem` (con `_count`, Date objects, etc.) con el tipo simple `OrderListRow` que definí en el client. Es un cast seguro porque ambos comparten la misma estructura de red (los Date se serializan a string al pasar de server → client).
- **`Loader2` removido**: importé Loader2 en order-detail-sheet pero no lo usaba — lo dejé fuera en la versión final para mantener clean imports.
- **Color palette sin azul/índigo**: ajusté todos los estados a una paleta coherente (zinc/amber/emerald/violet/teal + destructive) que respeta la regla. El teal-100/teal-800 para ENVIADO es lo más cercano a "info/azul" sin usar azul propiamente — está del lado verde del spectrun.
- **Sheets en mobile**: `SheetContent` con `w-full sm:max-w-[480px]` → full-width en mobile, 480px en desktop.

## Verification

- `bun run lint` → limpio (0 errores).
- `GET /api/orders` sin auth → HTTP 401 (esperado, auth requerida).
- `GET /dashboard/pedidos` sin auth → HTTP 307 → /login (esperado).
- Login admin@demo.com/admin123 → HTTP 200 + cookie session.
- `GET /api/orders?limit=3` con auth → HTTP 200, total: 15, primeros pedidos #1001 (NUEVO PREPAID), #1004 (PENDIENTE_PAGO_TRANSPORTE COD), #1005 (PENDIENTE_PAGO_TRANSPORTE COD).
- `GET /api/orders/[id]` con auth → HTTP 200, devuelve orden con todas las relaciones (customer, items, shipments.trackingEvents, transactions, statusLogs).
- `GET /dashboard/pedidos` con auth → HTTP 200, renderiza los 15 pedidos seedeados (#1001-#1015), headers "Pedidos"/"Gestión de pedidos", botones "Ver detalle", nombres de clientes (Carlos, Andrés), y todos los labels de estado (Nuevo pedido, Pendiente pago transporte, Pago transporte confirmado, Preparando, Enviado, Entregado, Devuelto).
- `dev.log`: sin errores de runtime, solo `auth.login success` info logs y requests 200/401 esperados.

## Files created / modified

**Created:**
- `src/components/shared/status-badge.tsx`
- `src/components/orders/transition-dialog.tsx`
- `src/components/orders/order-detail-sheet.tsx`
- `src/components/orders/orders-view.tsx`
- `src/app/(dashboard)/dashboard/pedidos/page.tsx`

**Modified:**
- `src/modules/orders/state-machine.ts` (ORDER_STATE_COLORS — removed blue/cyan)
- `src/app/globals.css` (added `.orders-scroll` / `.thin-scroll` custom scrollbar)

## Stage Summary

Página de gestión de pedidos completa y funcional. Cumple todos los requisitos del brief:
- Server component con fetch inicial + cliente interactivo con React Query.
- Tabla con filtros (search debounced 300ms, status, paymentMethod), paginación prev/next, scroll vertical con custom scrollbar, skeleton loading, empty state.
- Drawer lateral derecho (480px desktop / full-width mobile) con todas las secciones: cliente, items, envíos+tracking timeline, transacciones, bitácora de estados (timeline vertical), acciones (transiciones permitidas por FSM con diálogo de confirmación + reason opcional).
- Caja amber destacada "Pago de transporte pendiente" para COD en PENDIENTE_PAGO_TRANSPORTE con botón "Generar link de pago" disabled (placeholder futuro).
- StatusBadge reutilizable en `src/components/shared/` (disponible para Task 7 dashboard y otros consumidores).
- Cumple reglas de diseño: sin azul/índigo, responsive mobile-first, sticky footer via AppShell, hover states en filas/botones, semantic HTML (header/section/ol/li), accesibilidad (aria-label, role=button, Enter/Space en filas, sr-only), loading states con Skeleton, error states con mensajes amigables, toasts via sonner, iconos lucide-react.

Próximo agente puede: (a) implementar el botón "Generar link de pago" integrando WOMPI/PAYU/BOLD, (b) conectar el notifications-bell del AppShell a la tabla Notification + WebSocket (Task 4 dejó placeholder), (c) agregar export CSV/PDF del listado, (d) agregar columnas customizables / ordenamiento por columna.
