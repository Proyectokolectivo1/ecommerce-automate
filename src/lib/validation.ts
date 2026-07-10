// ============================================================
// validation.ts — Shared Zod schemas
// ============================================================
// Enums del dominio modelados como Zod enums (en SQLite se guardan
// como String). Se exportan también los arrays de valores para usar
// en dropdowns de UI.

import { z } from 'zod'

// ------------------------------------------------------------
// Order status FSM (8 estados)
// ------------------------------------------------------------

export const ORDER_STATUSES = [
  'NUEVO',
  'PENDIENTE_PAGO_TRANSPORTE',
  'PAGO_TRANSPORTE_CONFIRMADO',
  'PREPARANDO',
  'ENVIADO',
  'ENTREGADO',
  'DEVUELTO',
  'CANCELADO',
] as const

export const orderStatusSchema = z.enum(ORDER_STATUSES)
export type OrderStatus = z.infer<typeof orderStatusSchema>

// ------------------------------------------------------------
// Payment method
// ------------------------------------------------------------

export const PAYMENT_METHODS = ['PREPAID', 'COD'] as const
export const paymentMethodSchema = z.enum(PAYMENT_METHODS)
export type PaymentMethod = z.infer<typeof paymentMethodSchema>

// ------------------------------------------------------------
// Payment providers (pasarelas)
// ------------------------------------------------------------

export const PAYMENT_PROVIDERS = [
  'WOMPI',
  'PAYU',
  'MERCADOPAGO',
  'EPAYCO',
  'BOLD',
] as const

export const paymentProviderSchema = z.enum(PAYMENT_PROVIDERS)
export type PaymentProvider = z.infer<typeof paymentProviderSchema>

// ------------------------------------------------------------
// Customer classification
// ------------------------------------------------------------

export const CUSTOMER_CLASSIFICATIONS = ['VIP', 'FRECUENTE', 'NUEVO', 'INACTIVO'] as const
export const customerClassificationSchema = z.enum(CUSTOMER_CLASSIFICATIONS)
export type CustomerClassification = z.infer<typeof customerClassificationSchema>

// ------------------------------------------------------------
// Roles
// ------------------------------------------------------------

export const ROLES = ['ADMIN', 'GERENCIA', 'BODEGA', 'SERVICIO'] as const
export const roleSchema = z.enum(ROLES)
export type Role = z.infer<typeof roleSchema>

// ------------------------------------------------------------
// Transaction status
// ------------------------------------------------------------

export const TRANSACTION_STATUSES = ['PENDING', 'APPROVED', 'DECLINED', 'REFUNDED'] as const
export const transactionStatusSchema = z.enum(TRANSACTION_STATUSES)
export type TransactionStatus = z.infer<typeof transactionStatusSchema>

// ------------------------------------------------------------
// Shipment status
// ------------------------------------------------------------

export const SHIPMENT_STATUSES = [
  'CREATED',
  'PRINTED',
  'IN_TRANSIT',
  'DELIVERED',
  'RETURNED',
] as const
export const shipmentStatusSchema = z.enum(SHIPMENT_STATUSES)
export type ShipmentStatus = z.infer<typeof shipmentStatusSchema>

// ------------------------------------------------------------
// Print job status
// ------------------------------------------------------------

export const PRINT_JOB_STATUSES = ['QUEUED', 'SENT', 'PRINTED', 'FAILED'] as const
export const printJobStatusSchema = z.enum(PRINT_JOB_STATUSES)
export type PrintJobStatus = z.infer<typeof printJobStatusSchema>

// ------------------------------------------------------------
// Notification channel & type
// ------------------------------------------------------------

export const NOTIFICATION_CHANNELS = ['DASHBOARD', 'WHATSAPP', 'EMAIL'] as const
export const notificationChannelSchema = z.enum(NOTIFICATION_CHANNELS)
export type NotificationChannel = z.infer<typeof notificationChannelSchema>

export const NOTIFICATION_TYPES = ['INFO', 'WARNING', 'ERROR', 'SUCCESS'] as const
export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES)
export type NotificationType = z.infer<typeof notificationTypeSchema>

// ------------------------------------------------------------
// Alert type & severity
// ------------------------------------------------------------

export const ALERT_TYPES = [
  'COD_UNPAID',
  'GUIDE_ERROR',
  'HIGH_RETURN',
  'LOW_INVENTORY',
  'SALES_DROP',
] as const
export const alertTypeSchema = z.enum(ALERT_TYPES)
export type AlertType = z.infer<typeof alertTypeSchema>

export const ALERT_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const
export const alertSeveritySchema = z.enum(ALERT_SEVERITIES)
export type AlertSeverity = z.infer<typeof alertSeveritySchema>

// ------------------------------------------------------------
// Return status
// ------------------------------------------------------------

export const RETURN_STATUSES = ['RECEIVED', 'INSPECTED', 'RESTOCKED', 'DISCARDED'] as const
export const returnStatusSchema = z.enum(RETURN_STATUSES)
export type ReturnStatus = z.infer<typeof returnStatusSchema>

// ------------------------------------------------------------
// Cost category
// ------------------------------------------------------------

export const COST_CATEGORIES = ['PRODUCT', 'SHIPPING', 'ADVERTISING', 'OPERATION'] as const
export const costCategorySchema = z.enum(COST_CATEGORIES)
export type CostCategory = z.infer<typeof costCategorySchema>

// ------------------------------------------------------------
// AI insight type
// ------------------------------------------------------------

export const AI_INSIGHT_TYPES = [
  'SALES_PREDICTION',
  'ANOMALY',
  'MONTHLY_SUMMARY',
  'PRODUCT_ANALYSIS',
] as const
export const aiInsightTypeSchema = z.enum(AI_INSIGHT_TYPES)
export type AiInsightType = z.infer<typeof aiInsightTypeSchema>
