# Estado del Proyecto — Plataforma Ecommerce Inteligente

> **Documento de contexto para sesiones futuras.**
> Última actualización: Fase 2 completada y verificada.
> Objetivo: permitir que cualquier sesión futura retome el proyecto
> sin pérdida de contexto y lo lleve a 100% funcional.

---

## 0. Cómo retomar el proyecto en una nueva sesión

### 0.1 Pasos obligatorios al iniciar
```bash
cd /home/z/my-project

# 1. Leer este documento completo
cat ESTADO_PROYECTO.md

# 2. Leer el worklog (historial de tareas)
cat worklog.md

# 3. Leer los requerimientos originales
cat upload/requerimientos_plataforma_ecommerce_inteligente.md

# 4. Verificar servicios
ps aux | grep -E "next|realtime" | grep -v grep   # dev server + socket.io
curl -s http://localhost:3003/health                # mini-service realtime

# 5. Si el dev server está caído, reiniciarlo:
#    nohup bun run dev > /dev/null 2>&1 &
#    sleep 5 && tail -10 dev.log

# 6. Si el realtime está caído, reiniciarlo:
#    cd mini-services/realtime && nohup bun run dev > /home/z/my-project/realtime.log 2>&1 &
#    sleep 2 && curl -s http://localhost:3003/health

# 7. Verificar lint
bun run lint
```

### 0.2 Credenciales de acceso (demo seed)
| Rol | Email | Contraseña |
|-----|-------|------------|
| ADMIN | admin@demo.com | admin123 |
| GERENCIA | gerencia@demo.com | gerencia123 |
| BODEGA | bodega@demo.com | bodega123 |
| SERVICIO | servicio@demo.com | servicio123 |

### 0.3 Reglas del entorno (NO negociables)
- **Framework:** Next.js 16 App Router + TypeScript 5 (no cambiar).
- **DB:** Prisma + SQLite (`db/custom.db`). Enums como `String` + validación Zod.
- **Puerto:** solo 3000 para el dev server (auto).
- **Realtime:** mini-service socket.io en puerto 3003, path `/`, conexión frontend `io('/?XTransformPort=3003')`.
- **APIs:** siempre paths relativos; para otros puertos usar `?XTransformPort=NNNN`.
- **z-ai-web-dev-sdk:** solo en backend, nunca en cliente.
- **Footer:** sticky con `min-h-screen flex flex-col` + `mt-auto`.
- **Sin colores indigo/azul** salvo explícito.
- **No ejecutar** `bun run build`.
- **Verificación obligatoria:** usar Agent Browser antes de declarar done.

---

## 1. Descripción del Proyecto

### 1.1 Qué es
Plataforma SaaS empresarial para centralizar la operación de ecommerce,
automatización logística, control financiero y analítica comercial.
Integra Shopify, Mastershop, pasarelas de pago y sistemas de impresión
para automatizar el ciclo completo:

```
Venta → Validación → Pago transporte (contra entrega) → Despacho → Guía
      → Impresión → Seguimiento → Entrega/Devolución
```

### 1.2 Diferencial de negocio
El flujo **COD (contra entrega)** es el corazón: cobra el transporte
*antes* de despachar, reduciendo pérdidas. El motor de estados y la
validación de pago de transporte deben ser robustos, idempotentes y
auditables.

### 1.3 Stack tecnológico (adaptado del requerimiento)
| Requerido | Implementado | Notas |
|-----------|--------------|-------|
| NestJS | Next.js 16 Route Handlers | API REST en `src/app/api/**` |
| PostgreSQL | SQLite (Prisma) | Schema idéntico; migrar = cambiar `datasource` |
| Redis | Cache en memoria (`src/lib/cache.ts`) | Interfaz `CacheStore` intercambiable |
| BullMQ | Cola en memoria (`src/lib/queue.ts`) | Interfaz `Queue` intercambiable |
| n8n | Orchestrator interno (`src/lib/orchestrator/`) | Flujos declarativos |
| AWS S3 | Storage local (`src/lib/storage/`) | Interfaz `StoragePort` |
| Shopify Admin API | `src/integrations/shopify/client.ts` | Mock + real |
| Mastershop | `src/integrations/mastershop/client.ts` | Mock + real |
| 5 pasarelas pago | `src/integrations/payments/` | Interfaz `PaymentProviderPort` |
| WhatsApp/Email | `src/integrations/notifications/` | Mock + real |

---

## 2. Arquitectura

### 2.1 Hexagonal (Ports & Adapters)
```
src/
├── app/                    # Next.js App Router (UI + API)
│   ├── (auth)/             # Login
│   ├── (dashboard)/        # App protegida (shell + páginas)
│   └── api/                # REST API + webhooks
├── modules/                # LÓGICA DE DOMINIO (framework-agnostic)
│   ├── orders/             # FSM + order.service + cod-flow
│   ├── payments/           # payment.service (links + confirmación)
│   └── analytics/          # métricas de ventas
├── integrations/           # ADAPTERS externos
│   ├── shopify/
│   ├── mastershop/
│   ├── payments/           # provider.ts (Port) + 5 adapters + registry
│   └── notifications/
├── lib/                    # Infraestructura compartida
│   ├── db.ts auth.ts cache.ts queue.ts storage/ logger.ts
│   ├── audit.ts validation.ts format.ts realtime.ts orchestrator/
├── components/             # UI (shadcn/ui + custom)
│   ├── ui/                 # shadcn (New York)
│   ├── layout/             # app-shell, theme-toggle, user-menu, notifications-bell
│   ├── charts/             # Recharts wrappers
│   ├── orders/             # orders-view, order-detail-sheet, transition-dialog
│   └── shared/             # kpi-card, status-badge
├── hooks/                  # use-mobile, use-toast, use-realtime
├── stores/                 # (pendiente) Zustand
└── providers/              # providers.tsx (QueryClient, Theme, Auth)
mini-services/
└── realtime/               # socket.io puerto 3003
```

### 2.2 Flujo de datos principal (Caso A: prepago)
```
Shopify webhook → createOrderFromShopify (idempotente) → estado NUEVO
  → transitionStatus PREPARANDO → ENVIADO
  → Mastershop createDispatch → guía generada
  → PrintJob encolado → impresión automática
  → Mastershop webhook DELIVERED → transición ENTREGADO
```

### 2.3 Flujo COD (Caso B — diferencial)
```
Shopify webhook (COD) → estado PENDIENTE_PAGO_TRANSPORTE
  → calculateTransportCost → createTransportPaymentLink (pasarela)
  → notificación WhatsApp/Email al cliente con link
  → payments webhook APPROVED → confirmPaymentFromWebhook
    → transición automática PAGO_TRANSPORTE_CONFIRMADO
  → continuar flujo Caso A (despacho → guía → impresión → entrega)
```

---

## 3. Modelo de Datos (Prisma — 17 modelos)

```
User, Customer, Product, Order, OrderItem, OrderStatusLog,
Transaction, Shipment, TrackingEvent, PrintJob, Return,
CostEntry, Notification, Alert, AuditLog, IntegrationSetting, AiInsight
```

**FSM de Order (8 estados):**
```
NUEVO → PENDIENTE_PAGO_TRANSPORTE → PAGO_TRANSPORTE_CONFIRMADO
     → PREPARANDO → ENVIADO → ENTREGADO (terminal)
                          ↘ DEVUELTO (terminal)
NUEVO/PENDIENTE/CONFIRMADO/PREPARANDO → CANCELADO (terminal)
```

Transiciones válidas definidas en `src/modules/orders/state-machine.ts`
(`ORDER_TRANSITIONS`). Toda transición se audita en `OrderStatusLog`.

**Estado actual de la DB (seed):**
4 usuarios, 9 clientes, 7 productos, 16 pedidos, 51 logs de estado,
11 transacciones, 6 envíos, 24 tracking events, 6 print jobs,
1 devolución, 4 costos, 5 notificaciones, 4 alertas, 9 audit logs,
9 integraciones configuradas, 2 AI insights.

---

## 4. Estado de Implementación por Requerimiento

### Mapa de cobertura (16 secciones del requerimiento)

| # | Sección | Estado | % | Detalle |
|---|---------|--------|---|---------|
| 1 | Descripción general | ✅ | 100 | Arquitectura hexagonal implementada |
| 2 | Arquitectura general | ✅ | 90 | Faltan: colas Bull reales, S3 real (hay interfaz) |
| 3 | Stack tecnológico | ✅ | 95 | Todo adaptado al sandbox |
| 4 | Integración Shopify | ✅ | 90 | Webhook + Admin API client + HMAC. Falta: sincronización inventario periódica |
| 5 | Flujo principal negocio | ⚠️ | 70 | Caso A y B definidos. Falta: orquestación automática completa (orchestrator steps), impresión real |
| 6 | Pasarelas de pago | ✅ | 95 | 5 adapters (Wompi/PayU/MP/ePayco/Bold) con Port común. Mock + real. Webhook receiver |
| 7 | Estados del pedido | ✅ | 100 | FSM de 8 estados + auditoría de transiciones |
| 8 | Dashboard ejecutivo | ✅ | 90 | KPIs ventas/pedidos/rentabilidad. Falta: filtros de período, exportar |
| 9 | Analítica productos | ⚠️ | 60 | Top productos en dashboard. Falta: página dedicada con ranking completo |
| 10 | Control devoluciones | ⚠️ | 40 | Modelo + 1 seed. Falta: página de gestión + métricas (tasa, valor perdido, ciudad) |
| 11 | CRM clientes | ⚠️ | 30 | Modelo + clasificación. Falta: página CRM con historial, total comprado, filtros |
| 12 | Inteligencia artificial | ⚠️ | 25 | Modelo + 2 insights seed. Falta: módulo IA con z-ai-web-dev-sdk (predicción, anomalías, resumen) |
| 13 | Notificaciones | ⚠️ | 50 | NotificationsBell UI + adapters WhatsApp/Email. Falta: página alertas, 5 tipos de alerta operativas, envío real |
| 14 | Seguridad | ✅ | 90 | JWT + RBAC 4 roles + auditoría. Falta: 2FA, rate limiting |
| 15 | Roles | ✅ | 95 | 4 roles con permisos. Falta: página gestión usuarios |
| 16 | Entregables | ⚠️ | 60 | Plataforma + código + DB + integraciones + dashboard. Falta: documentación, manuales |

**Progreso global estimado: ~70%**

---

## 5. Lo que YA está implementado y verificado

### 5.1 Fundaciones (Fase 1) ✅
- **Schema Prisma** completo con 17 modelos y relaciones.
- **Auth** NextAuth v4 + JWT + CredentialsProvider + RBAC de 4 roles.
- **Libs**: `db`, `auth`/`auth-utils`, `logger`, `cache`, `queue`,
  `storage`, `audit`, `validation` (Zod), `format`, `orchestrator`.
- **AppShell**: sidebar (desktop + Sheet móvil), topbar sticky,
  theme toggle (light/dark), notifications bell, user menu, footer sticky.
- **Login** funcional con 4 usuarios seed.
- **Seed** con datos realistas (16 pedidos en todos los estados FSM).

### 5.2 Dashboard ejecutivo ✅
- KPIs: ventas día/semana/mes/año, ticket promedio.
- Tendencia de ventas 14 días (Recharts area chart).
- Pedidos por estado (bar chart).
- Rentabilidad: utilidad bruta/neta/margen.
- Top 5 productos por ingresos.
- Métricas de devoluciones.
- Pedidos recientes.
- API `/api/analytics` con cálculos reales desde DB.

### 5.3 Módulo de Pedidos + FSM ✅
- **FSM** de 8 estados con transiciones validadas (`state-machine.ts`).
- **order.service**: list, getById, transitionStatus, createOrderFromShopify
  (idempotente por shopifyId), getOrderStats, getRecentOrders.
- **cod-flow**: isCodOrder, requiresTransportPayment, calculateTransportCost.
- **API**: `/api/orders` (list+filtros), `/api/orders/[id]` (detail),
  `/api/orders/[id]/transition` (FSM), `/api/orders/stats`.
- **UI**: tabla con filtros (estado/método/búsqueda/paginación),
  drawer de detalle, timeline de estados, diálogo de transición.
- **Webhook Shopify** con verificación HMAC.

### 5.4 Capa de Integraciones (Fase 2) ✅
- **`src/integrations/payments/provider.ts`**: interfaz `PaymentProviderPort`
  (createPaymentLink, getTransactionStatus, parseWebhook) + tipos neutralizados.
- **5 adapters**: Wompi, PayU, Mercado Pago, ePayco, Bold.
  Cada uno: modo sandbox mock (sin creds) + modo real (fetch a API) +
  validación de firma HMAC en webhooks.
- **`registry.ts`**: factory `getPaymentProvider(name)`.
- **`shopify/client.ts`**: getShopifyConfig, getShopifyOrder, updateShopifyOrderNote,
  verifyShopifyWebhook (HMAC SHA256).
- **`mastershop/client.ts`**: getMastershopConfig, createDispatch (mock+real),
  tipos CreateDispatchRequest/Response/GuideStatusCallback.
- **`notifications/`**: sendWhatsApp (Cloud API Meta), sendEmail (Resend),
  modo mock cuando no hay creds.

### 5.5 Módulo de Pagos ✅
- **`payment.service.ts`**:
  - `createTransportPaymentLink`: genera reference, llama adapter, guarda
    Transaction, marca `codPaymentLink` en Order.
  - `confirmPaymentFromWebhook`: idempotente, busca por providerTxId/reference,
    actualiza status, si TRANSPORT+APPROVED transiciona FSM automáticamente
    (`PENDIENTE_PAGO_TRANSPORTE → PAGO_TRANSPORTE_CONFIRMADO`).
  - `refreshTransactionStatus`: poll manual.

### 5.6 Webhook receivers ✅
- **`/api/webhooks/shopify`**: importa pedido, valida HMAC si hay config.
- **`/api/webhooks/payments`**: multi-provider, identifica por header
  `X-Payment-Provider` o campo `provider` del body, valida firma, confirma idempotente.
- **`/api/webhooks/mastershop`**: callback de estado de guía, actualiza Shipment,
  crea TrackingEvent, transiciona Order si DELIVERED/RETURNED.

### 5.7 API de Integraciones ✅
- **`GET /api/integrations`**: lista 9 proveedores con estado (secrets enmascarados).
- **`PUT /api/integrations`**: upsert config (ADMIN only).
- **`PATCH /api/integrations/[provider]`**: activar/desactivar (ADMIN).
- **`POST /api/integrations/[provider]`**: test de conexión (ADMIN).

### 5.8 Realtime (socket.io) ✅
- **Mini-service** en `mini-services/realtime/` (puerto 3003).
- Path `/` + listeners HTTP reordenados para `/emit` y `/health`.
- Bridge HTTP→WS con secret para que la API emita eventos.
- **`src/lib/realtime.ts`**: helpers `emitOrderCreated`, `emitOrderTransition`,
  `emitPaymentConfirmed`, `emitGuideStatus`, `emitAlert` (fire-and-forget).
- **`src/hooks/use-realtime.ts`**: hook cliente con callbacks.

### 5.9 Página de Integraciones ✅
- 4 secciones (Ecommerce, Logística, Pasarelas, Notificaciones).
- 9 cards con switch activar/desactivar, botones Configurar/Probar.
- Dialog de configuración con campos dinámicos por proveedor
  (text, secret con toggle mostrar, boolean switch, select).
- Webhook URLs con botón copiar.
- Enmascaramiento de secretos, auditoría, toasts.

---

## 6. Lo que FALTA por implementar

### 6.1 Fase 3 — Logística & Impresión (Prioridad ALTA)
**Objetivo:** completar el flujo operativo después del pago.

- [ ] **Módulo logistics** (`src/modules/logistics/`):
  - `shipment.service.ts`: createShipment (llama Mastershop createDispatch),
    getShipmentByGuide, updateTracking.
  - `printing.service.ts`: enqueuePrintJob, processPrintQueue (worker periódico),
    markPrinted.
- [ ] **Orchestrator steps** (`src/lib/orchestrator/steps/`):
  - `create-dispatch.step.ts`: valida orden lista → llama Mastershop → guarda Shipment.
  - `generate-guide.step.ts`: recibe guía → actualiza Order + Shopify.
  - `print-guide.step.ts`: encola PrintJob.
  - `notify-customer.step.ts`: envía WhatsApp/Email con número de guía + tracking.
- [ ] **API**: `/api/guides` (list, getById, download PDF), `/api/print` (spooler status, retry).
- [ ] **UI**: página `/dashboard/guias` (lista de guías + tracking),
  página `/dashboard/impresion` (cola de impresión + reprint).
- [ ] **Worker de impresión**: `setInterval` que procesa PrintJobs en QUEUED.
- [ ] **Notificación al cliente**: WhatsApp/Email con guía + tracking al despachar.

### 6.2 Fase 4 — CRM Clientes (Prioridad MEDIA)
- [ ] **Módulo customers** (`src/modules/customers/`):
  - `customer.service.ts`: list, getById, classify (VIP/Frecuente/Nuevo/Inactivo
    según totalSpent + ordersCount + recencia).
  - Clasificación automática al importar pedidos.
- [ ] **API**: `/api/customers` (list+filtros), `/api/customers/[id]` (detail con historial).
- [ ] **UI**: página `/dashboard/clientes` (tabla + filtros por clasificación,
  drawer con historial de compras, total comprado, tickets).

### 6.3 Fase 5 — Analítica avanzada (Prioridad MEDIA)
- [ ] **Módulo analytics completo**:
  - `product.analytics.ts`: producto estrella (más vendido, mayor facturación,
    mayor utilidad), ranking completo con margen.
  - `returns.metrics.ts`: cantidad devoluciones, tasa, valor perdido,
    producto más devuelto, ciudad con más devoluciones.
  - `profitability.metrics.ts`: ingresos (ventas + transporte cobrado),
    costos (producto + envío + publicidad + operación), utilidad bruta/neta/margen.
- [ ] **UI**: página `/dashboard/productos` (ranking + producto estrella),
  página `/dashboard/devoluciones` (métricas + tabla),
  página `/dashboard/finanzas` (rentabilidad detallada con filtros de período).

### 6.4 Fase 6 — IA & Alertas (Prioridad MEDIA)
- [ ] **Módulo IA** (`src/modules/ai/`):
  - Usa `z-ai-web-dev-sdk` (servidor únicamente).
  - `predict-sales.ts`: predicción de ventas (SALES_PREDICTION).
  - `detect-anomalies.ts`: detección de anomalías (ANOMALY).
  - `monthly-summary.ts`: resumen ejecutivo mensual (MONTHLY_SUMMARY).
  - `product-analysis.ts`: análisis de productos (PRODUCT_ANALYSIS).
- [ ] **API**: `/api/ai/predict`, `/api/ai/anomalies`, `/api/ai/summary`, `/api/ai/products`.
- [ ] **UI**: página `/dashboard/inteligencia-ia` (insights + generar nuevo análisis).
- [ ] **Módulo alerts** (`src/modules/alerts/`):
  - Evaluadores de alertas: COD_UNPAID, GUIDE_ERROR, HIGH_RETURN,
    LOW_INVENTORY, SALES_DROP.
  - Cron/scheduler que evalúa periódicamente y crea Alert + Notification.
  - Emisión realtime vía `emitAlert`.
- [ ] **API**: `/api/alerts` (list, resolve).
- [ ] **UI**: página `/dashboard/alertas` (centro de alertas + resolver).

### 6.5 Fase 7 — Configuración & Admin (Prioridad BAJA)
- [ ] **Página `/dashboard/usuarios`**: CRUD de usuarios + asignación de roles (ADMIN).
- [ ] **Página `/dashboard/auditoría`**: visor de AuditLog con filtros.
- [ ] **Sincronización Shopify**: job periódico de inventario + productos.

### 6.6 Mejoras técnicas (Prioridad BAJA)
- [ ] **Cola persistente**: reemplazar `queue.ts` en memoria por BullMQ cuando
  se migre a Postgres/Redis.
- [ ] **Storage S3 real**: implementar `S3StorageAdapter` además del local.
- [ ] **Rate limiting** en APIs.
- [ ] **2FA** opcional para ADMIN.
- [ ] **Tests** (no requerido por las reglas, pero recomendado para producción).
- [ ] **Documentación**: manual de usuario + manual técnico (sección 16).

---

## 7. Roadmap sugerido (próximas sesiones)

| Sesión | Fase | Entregable | Verificación |
|--------|------|------------|--------------|
| Próxima | **Fase 3** | Logística + impresión + notificación al cliente | Orden ENVIADO genera guía, encola impresión, notifica WhatsApp |
| +1 | **Fase 4** | CRM clientes + clasificación automática | Página /clientes con historial y clasificación |
| +2 | **Fase 5** | Analítica productos + devoluciones + finanzas | 3 páginas con métricas reales |
| +3 | **Fase 6** | IA (z-ai-web-dev-sdk) + alertas operativas | Resumen mensual generado, alertas push realtime |
| +4 | **Fase 7** | Usuarios + auditoría + documentación | Proyecto 100% funcional |

---

## 8. Servicios y comandos

### 8.1 Servicios que deben estar corriendo
1. **Dev server** (puerto 3000): `bun run dev` — siempre en background.
2. **Mini-service realtime** (puerto 3003): `cd mini-services/realtime && bun run dev`.

### 8.2 Comandos útiles
```bash
bun run dev          # dev server (puerto 3000, always background)
bun run lint         # ESLint
bun run db:push      # aplicar schema Prisma a SQLite
bun run db:generate  # regenerar Prisma Client
bun run db:reset     # reset DB (borra datos)
bun run prisma/seed.ts           # seed principal (pedidos, usuarios, etc.)
bun run prisma/seed-integrations.ts  # seed de IntegrationSetting
```

### 8.3 Logs
- `dev.log` — log del dev server (leer solo las líneas recientes).
- `realtime.log` — log del mini-service socket.io.
- `worklog.md` — historial de tareas de cada agente (append, no overwrite).

---

## 9. Verificación end-to-end (ya confirmada)

### 9.1 Login y dashboard
- ✅ `/` redirige a `/login` si no hay sesión, a `/dashboard` si la hay.
- ✅ Login con 4 roles funciona.
- ✅ Dashboard renderiza KPIs reales desde DB.

### 9.2 Pedidos + FSM
- ✅ Tabla con 16 pedidos en todos los estados.
- ✅ Filtros, búsqueda, paginación.
- ✅ Timeline de estados con actor y reason.
- ✅ Diálogo de transición valida FSM.

### 9.3 Flujo COD completo (verificado con script)
- ✅ Shopify webhook crea pedido COD → estado `PENDIENTE_PAGO_TRANSPORTE`.
- ✅ `createTransportPaymentLink` (Wompi sandbox) → Transaction + link.
- ✅ Payments webhook `APPROVED` → transición automática a `PAGO_TRANSPORTE_CONFIRMADO`.
- ✅ `codPaid = true`, auditoría registrada.

### 9.4 Integraciones
- ✅ Página `/dashboard/integraciones` con 9 proveedores.
- ✅ Dialog de configuración funcional.
- ✅ Test de conexión (Wompi → `ok: true`).
- ✅ Toggle activar/desactivar.
- ✅ Webhook URLs copiables.

### 9.5 Webhooks
- ✅ `/api/webhooks/shopify` — importa pedido (200, `created: true`).
- ✅ `/api/webhooks/payments` — procesa multi-provider (200).
- ✅ `/api/webhooks/mastershop` — procesa callback de guía (200).

### 9.6 Realtime
- ✅ Mini-service health: `{"ok":true,...}`.
- ✅ Emit bridge: POST `/emit` con secret → `{"ok":true,"emitted":"..."}`.

### 9.7 Lint
- ✅ `bun run lint` → 0 errores.

---

## 10. Notas técnicas importantes

### 10.1 SQLite limitations
- No soporta enums nativos ni arrays → se modelan como `String` + validación Zod.
- JSONs complejos se serializan como `String` (ej: `metadata`, `config`, `rawResponse`).
- Al migrar a Postgres: cambiar `datasource` + convertir `String` a `enum` (sin tocar lógica).

### 10.2 Idempotencia
- **Shopify webhook**: busca por `shopifyId`, si existe no duplica.
- **Payments webhook**: si la Transaction ya está `APPROVED`, no re-procesa.
- **Mastershop webhook**: busca Shipment por `guideNumber`.

### 10.3 Arquitectura hexagonal
- **Dominio** (`src/modules/`): no importa Next.js ni adapters externos.
- **Adapters** (`src/integrations/`): implementan ports, intercambiables mock↔real.
- **API** (`src/app/api/`): orquesta dominio + adapters, valida auth + Zod.
- Para migrar a Postgres/Redis/n8n reales: solo se cambian adapters, 0 cambios en dominio.

### 10.4 Realtime via Caddy gateway
- Frontend: `io('/?XTransformPort=3003')` (NUNCA `io('http://localhost:3003')`).
- API→WS: POST a `http://localhost:3003/emit` con header `x-realtime-secret`.
- El mini-service reordena listeners HTTP antes que engine.io (path `/` intercepta todo).

### 10.5 Worklog obligation
- Cada agente (incluido subagents) DEBE leer `worklog.md` antes de trabajar.
- Después de terminar, DEBE appendear su sección con `---` separator.
- Formato: Task ID, Agent, Task, Work Log, Stage Summary.

---

## 11. Checklist para "Proyecto 100% funcional"

- [x] Fase 1: Fundaciones (auth, shell, dashboard)
- [x] Fase 2: Núcleo operacional (pedidos + FSM + integraciones + webhooks + realtime)
- [ ] Fase 3: Logística & impresión (guías, tracking, impresión automática, notificación cliente)
- [ ] Fase 4: CRM clientes (clasificación, historial, página)
- [ ] Fase 5: Analítica avanzada (productos, devoluciones, finanzas)
- [ ] Fase 6: IA & alertas (z-ai-web-dev-sdk, 5 tipos de alerta, realtime push)
- [ ] Fase 7: Admin (usuarios, auditoría, documentación)

**Cuando las 7 fases estén completas + verificación Agent Browser
en cada una → proyecto 100% funcional.**

---

*Documento generado para persistencia de contexto entre sesiones.
Mantener actualizado al finalizar cada fase.*
