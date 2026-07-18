# PROJECT STATUS — Plataforma Ecommerce Inteligente

## Fase actual: MVP listo para deploy

## Resumen
- **14 páginas** del dashboard operativas
- **36 APIs** REST
- **25 módulos** de dominio
- **3 webhooks** receivers (Shopify multi-evento, payments, Mastershop)
- **5 pasarelas** de pago con interfaz común
- **4 generadores IA** con z-ai-web-dev-sdk
- **5 evaluadores** de alertas + worker
- **2 workers** (print + alert) con BullMQ/memoria
- **Storage** Oracle Cloud (S3-compatible) + fallback local
- **2FA** TOTP con otplib
- **Rate limiting** en memoria
- **Exportación CSV**

## Tareas completadas
- [x] Fase 1: Fundaciones (auth, shell, dashboard)
- [x] Fase 2: Núcleo operacional (pedidos + FSM + integraciones + webhooks + realtime)
- [x] Fase 3: Logística & impresión (guías, tracking, impresión automática)
- [x] Fase 4: CRM clientes (clasificación automática)
- [x] Fase 5: Analítica avanzada (productos, devoluciones, finanzas)
- [x] Fase 6: IA & alertas (z-ai-web-dev-sdk, 5 tipos de alerta)
- [x] Fase 7: Admin (usuarios, auditoría, documentación)
- [x] Sprint 1: Shopify multi-evento, fulfillment, sync inventario, SMS, filtros
- [x] Sprint 2: Rate limiting, 2FA, CSV, reintentos webhooks
- [x] Sprint 3: PostgreSQL, BullMQ/Redis, Oracle Cloud storage
- [x] Docker + docker-compose para deploy

## Tareas en curso
- Ninguna

## Bloqueos
- Ninguno

## Riesgos
- Las integraciones reales (Shopify, Wompi, Mastershop, WhatsApp) requieren credenciales reales para pruebas end-to-end
- SQLite en desarrollo; PostgreSQL en producción (schema.postgres.prisma listo)

## Deuda técnica
- `formatDate` usa UTC para evitar hydration mismatch (no zona horaria local)
- `getCurrentUserOrFallback` permite acceso anónimo a APIs GET detrás de proxy
- Los workers corren en el proceso del server (no en proceso separado como recomienda la especificación)

## Siguiente paso
1. Configurar VM en Oracle Cloud
2. `docker-compose -f docker-compose.prod.yml up -d`
3. Configurar credenciales reales en `.env`
4. Configurar webhooks en Shopify/Wompi/Mastershop
5. Pruebas end-to-end con datos reales
