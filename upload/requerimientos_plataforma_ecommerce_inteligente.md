# Requerimientos del Proyecto

# Plataforma Ecommerce Inteligente: Shopify + Automatización Logística + Dashboard BI

## 1. Descripción General

Crear una plataforma web empresarial personalizada para centralizar la
operación de ecommerce, automatización logística, control financiero y
analítica comercial.

La plataforma debe integrar Shopify, n8n, Mastershop, pasarelas de pago
y sistemas de impresión para automatizar el ciclo completo:

Venta → Validación → Pago transporte (contra entrega) → Despacho → Guía
→ Impresión → Seguimiento → Entrega/Devolución.

El objetivo es reducir procesos manuales, controlar riesgos de pedidos
contra entrega y entregar información estratégica del negocio.

------------------------------------------------------------------------

# 2. Arquitectura General

## Componentes principales

-   Frontend web administrativo.
-   Backend API.
-   Base de datos empresarial.
-   Motor de automatización.
-   Integración Shopify.
-   Integración Mastershop.
-   Sistema de pagos.
-   Sistema de notificaciones.
-   Sistema impresión automática.
-   Dashboard analítico.

------------------------------------------------------------------------

# 3. Stack Tecnológico Recomendado

## Frontend

Framework: - Next.js 15 - React 19 - TypeScript

UI: - Tailwind CSS - Shadcn/UI - Radix UI

Gráficos: - Recharts - Chart.js

Gestión estado: - Zustand - React Query / TanStack Query

------------------------------------------------------------------------

## Backend

Framework: - Node.js - NestJS

Lenguaje: - TypeScript

API: - REST API - WebSockets para eventos en tiempo real

Validación: - Zod - Class Validator

------------------------------------------------------------------------

## Base de datos

Motor: - PostgreSQL

ORM: - Prisma ORM

Cache: - Redis

Colas: - BullMQ

Almacenamiento: - AWS S3 o compatible para documentos y guías.

------------------------------------------------------------------------

## Automatización

Motor principal: - n8n

Funciones:

-   Webhooks Shopify.
-   Procesamiento pedidos.
-   Integración Mastershop.
-   Integración pagos.
-   Notificaciones.
-   Impresión automática.
-   Manejo de errores.

------------------------------------------------------------------------

# 4. Integración Shopify

Usar:

-   Shopify Admin API.
-   Shopify Webhooks.

Eventos:

-   Nuevo pedido.
-   Actualización pedido.
-   Cambio estado.
-   Cancelación.
-   Pago confirmado.

Guardar:

-   Cliente.
-   Productos.
-   Inventario.
-   Valores.
-   Estado.
-   Método pago.
-   Guía.
-   Tracking.

------------------------------------------------------------------------

# 5. Flujo Principal del Negocio

## Pedido Shopify recibido

El sistema identifica:

-   Producto.
-   Cliente.
-   Dirección.
-   Método pago.

------------------------------------------------------------------------

# Caso A: Pedido pagado normalmente

Flujo:

Shopify

↓

Validación datos

↓

Mastershop

↓

Generación guía

↓

Actualización Shopify

↓

Envío guía cliente

↓

Impresión automática

↓

Seguimiento

------------------------------------------------------------------------

# Caso B: Pedido contra entrega

## Paso 1

Detectar pedido COD.

Estado:

"PENDIENTE PAGO TRANSPORTE"

------------------------------------------------------------------------

## Paso 2

Calcular costo transporte.

Generar link de pago.

Enviar al cliente:

-   WhatsApp.
-   Email.
-   SMS opcional.

------------------------------------------------------------------------

## Paso 3

Cliente paga transporte.

Validar webhook de pasarela.

Estados:

Pendiente pago transporte

↓

Pago confirmado

------------------------------------------------------------------------

## Paso 4

Actualizar Shopify:

-   Nota pedido.
-   Etiqueta.
-   Estado.
-   Registro pago transporte.

------------------------------------------------------------------------

## Paso 5

Crear despacho Mastershop.

Enviar:

-   Cliente.
-   Dirección.
-   Producto.
-   Peso.
-   Valor declarado.

------------------------------------------------------------------------

## Paso 6

Recibir guía.

Actualizar:

-   Shopify.
-   Plataforma interna.
-   Cliente.

Enviar:

-   Número guía.
-   Transportadora.
-   Tracking.

------------------------------------------------------------------------

## Paso 7

Enviar guía automáticamente a impresión.

------------------------------------------------------------------------

# 6. Pasarelas de Pago

La plataforma debe ser compatible con:

## Colombia

Opciones:

-   Wompi
-   PayU
-   Mercado Pago
-   ePayco
-   Bold

Funciones:

-   Crear link de pago.
-   Consultar estado.
-   Webhooks.
-   Confirmación automática.
-   Registro transacción.

------------------------------------------------------------------------

# 7. Estados del Pedido

Estados internos:

1.  Nuevo pedido

2.  Pendiente pago transporte

3.  Pago transporte confirmado

4.  Preparando

5.  Enviado

6.  Entregado

7.  Devuelto

8.  Cancelado

------------------------------------------------------------------------

# 8. Dashboard Ejecutivo

Crear panel con:

## Ventas

-   Ventas día.
-   Semana.
-   Mes.
-   Año.
-   Ticket promedio.

## Pedidos

-   Total pedidos.
-   Pendientes.
-   Enviados.
-   Entregados.
-   Devueltos.
-   Cancelados.

## Rentabilidad

Calcular:

Ingresos: - Ventas. - Transporte cobrado.

Costos: - Producto. - Envío. - Publicidad. - Operación.

Mostrar:

-   Utilidad bruta.
-   Utilidad neta.
-   Margen porcentaje.

------------------------------------------------------------------------

# 9. Analítica Productos

Mostrar:

Producto estrella:

-   Más vendido.
-   Mayor facturación.
-   Mayor utilidad.

Ranking:

Producto Cantidad Ventas Utilidad Margen

------------------------------------------------------------------------

# 10. Control Devoluciones

Métricas:

-   Cantidad devoluciones.
-   Tasa devolución.
-   Valor perdido.
-   Producto más devuelto.
-   Ciudad con más devoluciones.

Formula:

(Devoluciones / Total pedidos) x 100

------------------------------------------------------------------------

# 11. CRM Clientes

Guardar:

-   Nombre.
-   Teléfono.
-   Email.
-   Historial compra.
-   Total comprado.

Clasificación:

-   VIP.
-   Frecuente.
-   Nuevo.
-   Inactivo.

------------------------------------------------------------------------

# 12. Inteligencia Artificial

Implementar módulo IA para:

-   Predicción ventas.
-   Alertas.
-   Análisis productos.
-   Resumen ejecutivo mensual.
-   Detección anomalías.

------------------------------------------------------------------------

# 13. Notificaciones

Canales:

-   WhatsApp API.
-   Email.
-   Dashboard.

Alertas:

-   Pedido sin pago transporte.
-   Error generación guía.
-   Alta devolución.
-   Bajo inventario.
-   Caída ventas.

------------------------------------------------------------------------

# 14. Seguridad

Implementar:

-   JWT.
-   Roles usuarios.
-   Control permisos.
-   Variables entorno.
-   Logs.
-   Auditoría.

------------------------------------------------------------------------

# 15. Roles

Administrador: Acceso total.

Gerencia: Finanzas y métricas.

Bodega: Pedidos e impresión.

Servicio cliente: Seguimiento pedidos.

------------------------------------------------------------------------

# 16. Entregables

-   Plataforma funcional.
-   Código fuente.
-   Base datos.
-   Integraciones.
-   Dashboard.
-   Documentación.
-   Manual usuario.
-   Manual técnico.

------------------------------------------------------------------------

# Objetivo final

Construir una plataforma SaaS ecommerce que permita automatizar
completamente ventas, logística y análisis empresarial, reduciendo
pérdidas por contraentrega y entregando control total del negocio
mediante datos en tiempo real.
