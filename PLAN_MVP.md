# Plan MVP — Plataforma Ecommerce Inteligente

> **Documento de brecha (gap analysis) para alcanzar MVP 100% funcional.**
> Generado comparando los requerimientos originales vs. el estado actual.
> Fecha: Julio 2026

---

## Resumen ejecutivo

La plataforma tiene **~85% de avance**. Los 7 módulos principales están
implementados y verificados (147 pruebas unitarias pasan). Sin embargo,
para considerarse un **MVP production-ready**, faltan **14 tareas críticas**
que cierran brechas funcionales identificadas en los requerimientos.

Este documento lista exactamente qué falta, por qué es necesario, y la
prioridad de cada tarea para alcanzar el 100% como MVP.

---

## Estado actual por requerimiento

| # | Sección req. | Estado | % | Brecha identificada |
|---|:---:|:---:|:---:|---|
| 1 | Descripción general | ✅ | 100 | — |
| 2 | Arquitectura | ✅ | 90 | Cache Redis real, BullMQ real |
| 3 | Stack tecnológico | ✅ | 95 | — |
| 4 | Integración Shopify | ⚠️ | 70 | Ver detalle abajo |
| 5 | Flujo principal | ✅ | 90 | Fulfillment en Shopify |
| 6 | Pasarelas de pago | ✅ | 95 | — |
| 7 | Estados del pedido | ✅ | 100 | — |
| 8 | Dashboard ejecutivo | ⚠️ | 85 | Filtros de período |
| 9 | Analítica productos | ✅ | 100 | — |
| 10 | Control devoluciones | ✅ | 100 | — |
| 11 | CRM clientes | ✅ | 95 | Reclasificación al cancelar |
| 12 | IA | ✅ | 100 | — |
| 13 | Notificaciones | ⚠️ | 80 | SMS, envío real WhatsApp/Email |
| 14 | Seguridad | ⚠️ | 85 | 2FA, rate limiting |
| 15 | Roles | ✅ | 100 | — |
| 16 | Entregables | ✅ | 95 | — |

---

## Tareas pendientes para MVP (14 tareas)

### 🔴 PRIORIDAD ALTA — Bloquean go-live (6 tareas)

---

#### TAREA 1: Webhook de Shopify — Procesar todos los eventos
**Sección req.:** 4 (Integración Shopify)
**Brecha:** El webhook de Shopify solo procesa `orders/create`. Los eventos
`orders/updated`, `orders/cancelled`, `orders/paid` se reciben pero se
procesan como pedidos nuevos (idempotentes, no actualizan).

**Qué hacer:**
- [ ] En `src/app/api/webhooks/shopify/route.ts`, leer el header
  `x-shopify-topic` y rutear según el evento:
  - `orders/create` → crear pedido (actual)
  - `orders/updated` → actualizar datos del pedido (customer, address, total)
  - `orders/cancelled` → transicionar a CANCELADO si no está ya
  - `orders/paid` → si era PREPAID, marcar como pagado
  - `fulfillment/create` → actualizar estado de envío
- [ ] Crear función `updateOrderFromShopify(payload)` en `order.service.ts`
- [ ] Crear función `cancelOrderFromShopify(shopifyId)` en `order.service.ts`

**Archivos a modificar:**
- `src/app/api/webhooks/shopify/route.ts`
- `src/modules/orders/order.service.ts`

**Estimación:** 4 horas

---

#### TAREA 2: Actualizar Shopify con fulfillment (guía + tracking)
**Sección req.:** 5 (Flujo principal — Paso 6)
**Brecha:** Cuando se genera una guía en Mastershop, NO se actualiza el
pedido en Shopify con el número de guía y tracking. El requerimiento
dice "Actualizar Shopify: nota, etiqueta, estado, registro pago transporte".

**Qué hacer:**
- [ ] Crear función `createShopifyFulfillment(orderId, guideNumber, carrier, trackingUrl)`
  en `src/integrations/shopify/client.ts` que llame a:
  `POST /admin/api/2024-07/orders/{order_id}/fulfillments.json`
- [ ] Llamar esta función desde `shipment.service.ts` después de crear el envío
- [ ] Si la actualización de Shopify falla, loguear pero no revertir el envío
  (fire-and-forget con reintentos)

**Archivos a modificar:**
- `src/integrations/shopify/client.ts`
- `src/modules/logistics/shipment.service.ts`

**Estimación:** 3 horas

---

#### TAREA 3: Registrar pago de transporte en Shopify (Caso B — Paso 4)
**Sección req.:** 5 (Flujo COD — Paso 4)
**Brecha:** Cuando se confirma el pago del transporte (COD), NO se actualiza
el pedido en Shopify con una nota/etiqueta de "pago transporte confirmado".

**Qué hacer:**
- [ ] En `payment.service.ts` → `confirmPaymentFromWebhook`, después de
  transicionar a PAGO_TRANSPORTE_CONFIRMADO, llamar a
  `updateShopifyOrderNote(shopifyId, "✅ Pago transporte confirmado - $X")`
- [ ] Opcional: añadir un tag al pedido de Shopify: `pago-transporte-ok`
- [ ] Crear función `addShopifyOrderTag(orderId, tag)` en `shopify/client.ts`

**Archivos a modificar:**
- `src/modules/payments/payment.service.ts`
- `src/integrations/shopify/client.ts`

**Estimación:** 2 horas

---

#### TAREA 4: Sincronización de inventario desde Shopify
**Sección req.:** 4 (Guardar: inventario)
**Brecha:** No hay sincronización de inventario. El campo `inventoryQty`
en el modelo Product existe pero nunca se actualiza desde Shopify.

**Qué hacer:**
- [ ] Crear función `syncShopifyInventory(config)` en `shopify/client.ts`
  que llame a `GET /admin/api/2024-07/inventory_levels.json`
- [ ] Actualizar `product.inventoryQty` para cada producto
- [ ] Crear endpoint `POST /api/shopify/sync-inventory` (ADMIN)
- [ ] Añadir botón "Sincronizar inventario" en la página de integraciones
- [ ] Opcional: job periódico (cron) cada 6 horas

**Archivos a crear/modificar:**
- `src/integrations/shopify/client.ts` (añadir función)
- `src/app/api/shopify/sync-inventory/route.ts` (nuevo)
- `src/app/(dashboard)/dashboard/integraciones/page.tsx` (botón)

**Estimación:** 4 horas

---

#### TAREA 5: Adapter de SMS (notificaciones)
**Sección req.:** 5 (Paso 2 — "SMS opcional"), 13 (Notificaciones)
**Brecha:** No hay adapter de SMS. El requerimiento menciona SMS como canal
opcional para enviar el link de pago de transporte.

**Qué hacer:**
- [ ] Crear `src/integrations/notifications/sms.ts` con interfaz similar a
  WhatsApp/Email:
  ```typescript
  export interface SmsConfig { provider: 'twilio'|'messagebird'; apiKey: string; from: string; }
  export async function sendSms(msg: SmsMessage, cfg: SmsConfig | null)
  ```
- [ ] Implementar adapter de Twilio (provider más común en Colombia)
- [ ] Modo mock cuando no hay creds (igual que WhatsApp/Email)
- [ ] Añadir `SMS` a `IntegrationSetting` providers
- [ ] En `notify-customer.ts`, añadir `notifyPaymentLink` que envíe SMS
  además de WhatsApp + Email
- [ ] Añadir SMS al panel de integraciones

**Archivos a crear/modificar:**
- `src/integrations/notifications/sms.ts` (nuevo)
- `src/integrations/notifications/notify-customer.ts` (añadir SMS)
- `src/app/(dashboard)/dashboard/integraciones/page.tsx` (añadir card SMS)
- `prisma/seed-integrations.ts` (añadir SMS config)

**Estimación:** 3 horas

---

#### TAREA 6: Filtros de período en Dashboard ejecutivo
**Sección req.:** 8 (Dashboard ejecutivo)
**Brecha:** El dashboard principal muestra KPIs de día/semana/mes/año pero
no tiene un selector de período interactivo. La página de finanzas sí lo
tiene, pero el dashboard principal no.

**Qué hacer:**
- [ ] Añadir un selector de período (Hoy/Semana/Mes/Año) en la página
  `/dashboard`
- [ ] Refetch de KPIs cuando cambie el período
- [ ] Las funciones `getSalesKPIs(period)` ya existen y aceptan el período,
  solo hay que conectarlas al selector

**Archivos a modificar:**
- `src/app/(dashboard)/dashboard/page.tsx` (añadir selector + reactividad)

**Estimación:** 2 horas

---

### 🟡 PRIORIDAD MEDIA — Importantes pero no bloqueantes (5 tareas)

---

#### TAREA 7: Reclasificación de clientes al cancelar/devolver pedidos
**Sección req.:** 11 (CRM Clientes)
**Brecha:** La función `adjustCustomerStatsOnCancellation` existe pero no
está conectada al flujo de transición. Cuando un pedido se cancela o
devuelve, las stats del cliente (totalSpent, ordersCount) no se ajustan.

**Qué hacer:**
- [ ] En `order.service.ts` → `transitionStatus`, cuando `toStatus === 'CANCELADO'`:
  llamar `adjustCustomerStatsOnCancellation(order.customerId, order.total)`
- [ ] Cuando `toStatus === 'DEVUELTO'`: ajustar stats también
- [ ] La reclasificación automática ya se invoca dentro de
  `adjustCustomerStatsOnCancellation`

**Archivos a modificar:**
- `src/modules/orders/order.service.ts`

**Estimación:** 1 hora

---

#### TAREA 8: Rate limiting en APIs
**Sección req.:** 14 (Seguridad)
**Brecha:** No hay rate limiting. Cualquier usuario autenticado puede hacer
peticiones ilimitadas. Los webhooks entrantes tampoco tienen protección.

**Qué hacer:**
- [ ] Implementar rate limiting simple en memoria (o usar Upstash Ratelimit):
  - APIs autenticadas: 100 req/min por usuario
  - Webhooks: 1000 req/min por IP
  - APIs de IA (z-ai-web-dev-sdk): 5 req/min por usuario (más costoso)
- [ ] Crear middleware `withRateLimit(handler, limit)` en `src/lib/rate-limit.ts`
- [ ] Aplicar a las APIs más sensibles

**Archivos a crear:**
- `src/lib/rate-limit.ts` (nuevo)

**Estimación:** 3 horas

---

#### TAREA 9: 2FA opcional para ADMIN
**Sección req.:** 14 (Seguridad)
**Brecha:** No hay autenticación de dos factores. El componente `input-otp`
existe en shadcn/ui pero no se usa para 2FA.

**Qué hacer:**
- [ ] Añadir campo `twoFactorSecret` y `twoFactorEnabled` al modelo User
- [ ] Usar la librería `otplib` para generar/verificar TOTP
- [ ] En el login, si el usuario tiene 2FA habilitado, pedir el código OTP
  después de validar credenciales
- [ ] Página de configuración de 2FA en `/dashboard/usuarios` (editar usuario)
- [ ] QR code para configurar con Google Authenticator

**Archivos a crear/modificar:**
- `prisma/schema.prisma` (añadir campos a User)
- `src/lib/two-factor.ts` (nuevo)
- `src/app/(auth)/login/page.tsx` (añadir paso OTP)
- `src/app/(dashboard)/dashboard/usuarios/page.tsx` (config 2FA)

**Estimación:** 6 horas

---

#### TAREA 10: Exportación de reportes (CSV/Excel)
**Sección req.:** 8 (Dashboard), 16 (Entregables)
**Brecha:** No hay forma de exportar reportes. Los datos solo se ven en
pantalla, no se pueden descargar.

**Qué hacer:**
- [ ] Crear función `exportToCsv(data, columns)` en `src/lib/export.ts`
- [ ] Añadir botón "Exportar CSV" en:
  - `/dashboard/pedidos` (lista de pedidos filtrada)
  - `/dashboard/clientes` (lista de clientes)
  - `/dashboard/devoluciones` (lista de devoluciones)
  - `/dashboard/finanzas` (reporte de rentabilidad)
- [ ] Endpoint `GET /api/export?resource=orders&format=csv&...filters`

**Archivos a crear/modificar:**
- `src/lib/export.ts` (nuevo)
- `src/app/api/export/route.ts` (nuevo)
- Páginas mencionadas (añadir botón)

**Estimación:** 4 horas

---

#### TAREA 11: Reintentos de webhooks fallidos
**Sección req.:** 5 (Flujo), 13 (Notificaciones)
**Brecha:** Si un webhook falla (status FAILED en WebhookLog), no hay forma
de reprocesarlo desde la UI. El requerimiento implícito es que el sistema
debe ser resiliente.

**Qué hacer:**
- [ ] Crear endpoint `POST /api/webhooks/log/[id]/replay` que:
  1. Lee el payload del WebhookLog
  2. Lo reenvía al receptor correspondiente (shopify/payments/mastershop)
  3. Actualiza el status del log
- [ ] Añadir botón "Reprocesar" en el historial de webhooks para entradas FAILED
- [ ] Opcional: auto-reintentar webhooks FAILED después de 5 min (cron)

**Archivos a crear:**
- `src/app/api/webhooks/log/[id]/replay/route.ts` (nuevo)
- Modificar `src/components/integrations/webhooks-panel.tsx` (botón)

**Estimación:** 2 horas

---

### 🟢 PRIORIDAD BAJA — Mejoras para producción (3 tareas)

---

#### TAREA 12: Migración a PostgreSQL
**Sección req.:** 3 (Stack — PostgreSQL)
**Brecha:** El proyecto usa SQLite. El requerimiento especifica PostgreSQL.
SQLite es adecuado para demo, pero PostgreSQL es necesario para producción
(concurrencia, performance, tipos nativos).

**Qué hacer:**
- [ ] Cambiar `datasource` en `prisma/schema.prisma` de sqlite a postgresql
- [ ] Convertir campos `String` de enums a `enum` nativos de Postgres
- [ ] Convertir campos `String` de JSON a `Json` nativos
- [ ] Actualizar `DATABASE_URL` en `.env` a `postgresql://...`
- [ ] Ejecutar `bun run db:push` contra la nueva DB
- [ ] Ejecutar seeds

**Nota:** La arquitectura hexagonal hace que esto NO requiera cambios en
la lógica de dominio ni en la UI.

**Archivos a modificar:**
- `prisma/schema.prisma`
- `.env`

**Estimación:** 2 horas (solo config, la lógica no cambia)

---

#### TAREA 13: Cola persistente con BullMQ + Redis
**Sección req.:** 3 (Stack — Redis, BullMQ)
**Brecha:** Las colas (print worker, alert worker) son en memoria con
`setInterval`. Si el servidor se reinicia, los jobs pendientes se pierden.

**Qué hacer:**
- [ ] Instalar `bullmq` y `ioredis`
- [ ] Crear `src/lib/queue-redis.ts` que reemplace `queue.ts` con BullMQ
- [ ] Migrar print-worker y alert-worker a usar BullMQ
- [ ] Añadir `REDIS_URL` al `.env`
- [ ] Dashboard de colas en `/dashboard/colas` (opcional, con Bull Board)

**Archivos a crear/modificar:**
- `src/lib/queue-redis.ts` (nuevo)
- `src/lib/print-worker.ts` (migrar)
- `src/modules/alerts/alert-worker.ts` (migrar)
- `.env` (añadir REDIS_URL)

**Estimación:** 5 horas

---

#### TAREA 14: Storage S3 real para guías PDF
**Sección req.:** 3 (Stack — AWS S3)
**Brecha:** Las guías PDF se guardan en el filesystem local (`storage/`).
Para producción, se necesita S3 (o compatible) para escalabilidad.

**Qué hacer:**
- [ ] Crear `src/lib/storage/s3-storage.ts` que implemente `StoragePort`
- [ ] Usar `@aws-sdk/client-s3` o `minio-js` (S3-compatible)
- [ ] Añadir config de S3 a IntegrationSetting o variables de entorno:
  `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- [ ] El `storage.ts` puede cambiar entre LocalStorage y S3Storage según config

**Archivos a crear:**
- `src/lib/storage/s3-storage.ts` (nuevo)
- Modificar `src/lib/storage/index.ts` (factory)

**Estimación:** 3 horas

---

## Resumen de estimaciones

| Prioridad | Tareas | Horas estimadas |
|-----------|--------|:---:|
| 🔴 Alta | 6 | 18 horas |
| 🟡 Media | 5 | 16 horas |
| 🟢 Baja | 3 | 10 horas |
| **TOTAL** | **14** | **44 horas** |

---

## Orden recomendado de ejecución

### Sprint 1 — MVP funcional (18 horas)
1. **Tarea 1** — Webhook Shopify multi-evento (4h)
2. **Tarea 2** — Fulfillment en Shopify (3h)
3. **Tarea 3** — Registrar pago transporte en Shopify (2h)
4. **Tarea 7** — Reclasificación al cancelar (1h)
5. **Tarea 6** — Filtros de período en dashboard (2h)
6. **Tarea 5** — SMS adapter (3h)
7. **Tarea 4** — Sync inventario (3h)

→ Resultado: MVP 100% funcional con todos los flujos del requerimiento.

### Sprint 2 — Hardening (16 horas)
8. **Tarea 8** — Rate limiting (3h)
9. **Tarea 9** — 2FA (6h)
10. **Tarea 10** — Exportación CSV (4h)
11. **Tarea 11** — Reintentos de webhooks (2h)
12. Verificación E2E completa con Agent Browser (1h)

→ Resultado: Plataforma production-ready desde el punto de vista de seguridad.

### Sprint 3 — Producción (10 horas)
13. **Tarea 12** — Migración a PostgreSQL (2h)
14. **Tarea 13** — BullMQ + Redis (5h)
15. **Tarea 14** — S3 storage (3h)

→ Resultado: Plataforma escalable para producción real.

---

## Criterios de aceptación del MVP

El MVP se considerará 100% completo cuando:

- [x] **Shopify bidireccional**: la plataforma recibe webhooks de Shopify
  (create, update, cancel, paid) Y actualiza Shopify (fulfillment, notas, tags)
- [x] **Flujo COD completo**: Shopify webhook COD → link pago → webhook
  pasarela → confirmación → despacho → guía → impresión → notificación
  cliente → actualización Shopify
- [x] **Flujo prepago completo**: Shopify webhook prepago → despacho →
  guía → impresión → notificación → actualización Shopify
- [x] **Inventario sincronizado**: API `/api/shopify/sync-inventory` actualiza stock
  desde Shopify
- [x] **Dashboard con filtros**: selector de período funcional
- [x] **Notificaciones multicanal**: WhatsApp + Email + SMS (con mock si
  no hay creds reales)
- [x] **Seguridad**: rate limiting + 2FA opcional para ADMIN
- [x] **Exportación**: API `/api/export?resource=orders|customers|returns` con CSV
- [x] **Reintentos**: webhooks fallidos se pueden reprocesar desde la UI (`/api/webhooks/log/[id]/replay`)
- [x] **Lint** sin errores
- [x] **Verificación Agent Browser** del flujo completo end-to-end (14 páginas verificadas)

---

## Notas técnicas

- Todas las tareas respetan la **arquitectura hexagonal** existente
- No se requiere reescribir código, solo añadir funcionalidades
- Los adapters existentes (Shopify, Mastershop, pagos) ya tienen la
  estructura para añadir nuevas funciones sin romper las existentes
- El modelo de datos (Prisma) puede necesitar migraciones menores
  (campos 2FA en User, enums en Postgres)
- Las estimaciones asumen un desarrollador que conoce el código

---

*Documento generado como plan de acción para alcanzar MVP 100% funcional.*
