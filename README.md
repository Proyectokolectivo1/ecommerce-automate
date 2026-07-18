# Plataforma Ecommerce Inteligente

Plataforma SaaS empresarial para centralizar la operación de ecommerce, automatización logística, control financiero y analítica comercial. Integra Shopify, Mastershop, pasarelas de pago y sistemas de impresión para automatizar el ciclo completo: Venta → Validación → Pago transporte (contra entrega) → Despacho → Guía → Impresión → Seguimiento → Entrega/Devolución.

## Stack Tecnológico

- **Framework**: Next.js 16 (App Router) + TypeScript 5
- **Base de datos**: Prisma ORM + SQLite
- **UI**: Tailwind CSS 4 + shadcn/ui (New York) + Recharts
- **Estado**: TanStack Query + Zustand
- **Auth**: NextAuth.js v4 (JWT + RBAC 4 roles)
- **IA**: z-ai-web-dev-sdk (LLM para predicción, anomalías, resumen)
- **Realtime**: socket.io (mini-service puerto 3003)
- **Validación**: Zod

## Funcionalidades principales

- **Pedidos**: FSM de 8 estados, importación idempotente desde Shopify webhook
- **Flujo COD (contra entrega)**: cobro de transporte antes de despachar
- **Logística**: integración Mastershop, generación de guías, impresión automática (CUPS/spool)
- **Pagos**: 5 pasarelas (Wompi, PayU, Mercado Pago, ePayco, Bold) con interfaz común
- **CRM**: clasificación automática de clientes (VIP/Frecuente/Nuevo/Inactivo)
- **Analítica**: productos estrella, devoluciones, rentabilidad con filtros de período
- **IA**: predicción de ventas, detección de anomalías, resumen mensual, análisis de productos
- **Alertas**: 5 tipos operativas (COD sin pago, error guía, alta devolución, bajo inventario, caída ventas)
- **Dashboard ejecutivo**: KPIs en tiempo real, gráficos, tendencia
- **Auditoría**: registro de todas las acciones críticas
- **RBAC**: 4 roles (ADMIN, GERENCIA, BODEGA, SERVICIO)

## Instalación

```bash
# 1. Instalar dependencias
bun install

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores

# 3. Crear base de datos
bun run db:push

# 4. Sembrar datos demo
bun run prisma/seed.ts
bun run prisma/seed-integrations.ts

# 5. Iniciar servidor de desarrollo
bun run dev

# 6. (Opcional) Iniciar mini-service realtime
cd mini-services/realtime
bun install
bun run dev
```

## Credenciales demo

| Rol | Email | Contraseña |
|-----|-------|------------|
| ADMIN | admin@demo.com | admin123 |
| GERENCIA | gerencia@demo.com | gerencia123 |
| BODEGA | bodega@demo.com | bodega123 |
| SERVICIO | servicio@demo.com | servicio123 |

## Estructura del proyecto

```
src/
├── app/                    # Next.js App Router (UI + API)
│   ├── (auth)/             # Login
│   ├── (dashboard)/        # App protegida (15+ páginas)
│   └── api/                # REST API + webhooks
├── modules/                # Lógica de dominio (framework-agnostic)
│   ├── orders/             # FSM + order.service + cod-flow
│   ├── payments/           # payment.service
│   ├── logistics/          # shipment + printing
│   ├── customers/          # CRM + clasificación
│   ├── analytics/          # productos, devoluciones, rentabilidad
│   ├── ai/                 # 4 generadores IA + fallback
│   ├── alerts/             # 5 evaluadores + worker
│   └── admin/              # usuarios + auditoría
├── integrations/           # Adapters externos (Ports & Adapters)
│   ├── shopify/
│   ├── mastershop/
│   ├── payments/           # 5 pasarelas con interfaz común
│   ├── notifications/      # WhatsApp + Email
│   └── printing/           # CUPS + spool-fallback
├── lib/                    # Infraestructura compartida
├── components/             # UI (shadcn/ui + custom)
└── hooks/                  # use-realtime, use-mobile, use-toast
mini-services/
└── realtime/               # socket.io puerto 3003
tests/                      # 147 pruebas unitarias
```

## Pruebas

```bash
# Ejecutar 147 pruebas unitarias
bun run tests/run-all-tests.ts
```

## Lint

```bash
bun run lint
```

## Licencia

MIT
