// ============================================================
// notify-customer.ts — Customer notification orchestrator
// ============================================================
// Envía notificaciones al cliente en los momentos clave del flujo:
//   - notifyGuideCreated: guía generada (WhatsApp + Email con tracking).
//   - notifyPaymentLink: link de pago de transporte (COD).
//
// Lee las configs de WhatsApp/Email desde IntegrationSetting y
// delega a los adapters. Fire-and-forget desde el caller: los
// errores se loguean pero no rompen el flujo principal.

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { sendWhatsApp, type WhatsAppConfig } from './whatsapp'
import { sendEmail, type EmailConfig } from './email'

// ------------------------------------------------------------
// Config loaders
// ------------------------------------------------------------

async function getWhatsAppConfig(): Promise<WhatsAppConfig | null> {
  const setting = await db.integrationSetting.findUnique({
    where: { provider: 'WHATSAPP' },
  })
  if (!setting || !setting.active) return null
  try {
    return JSON.parse(setting.config) as WhatsAppConfig
  } catch {
    return null
  }
}

async function getEmailConfig(): Promise<EmailConfig | null> {
  const setting = await db.integrationSetting.findUnique({
    where: { provider: 'EMAIL' },
  })
  if (!setting || !setting.active) return null
  try {
    return JSON.parse(setting.config) as EmailConfig
  } catch {
    return null
  }
}

/** Normaliza un teléfono colombiano a E.164 (sin espacios/guiones). */
function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  let p = phone.replace(/[\s\-()]/g, '')
  if (p.startsWith('+')) p = p.slice(1)
  if (p.startsWith('57')) return p
  if (p.startsWith('0')) p = p.slice(1)
  if (p.length === 10) return `57${p}`
  return p
}

// ------------------------------------------------------------
// notifyGuideCreated
// ------------------------------------------------------------

export interface GuideNotificationInput {
  orderNumber: string
  customerName: string
  customerPhone?: string | null
  customerEmail?: string | null
  guideNumber: string
  carrier: string
  city?: string | null
}

/**
 * Notifica al cliente que su guía fue generada.
 * Envía WhatsApp (si está configurado) + Email (si está configurado).
 * También crea un registro Notification en la DB para el historial.
 */
export async function notifyGuideCreated(
  input: GuideNotificationInput,
): Promise<{ whatsapp: boolean; email: boolean }> {
  const [waCfg, emailCfg] = await Promise.all([getWhatsAppConfig(), getEmailConfig()])
  const phone = normalizePhone(input.customerPhone)

  let whatsappSent = false
  let emailSent = false

  // WhatsApp
  if (phone) {
    const result = await sendWhatsApp(
      {
        to: phone,
        template: 'guia_generada',
        variables: [
          input.customerName,
          input.orderNumber,
          input.guideNumber,
          input.carrier,
        ],
      },
      waCfg,
    )
    whatsappSent = result.sent
    logger.info('notify.guide whatsapp', {
      orderNumber: input.orderNumber,
      to: phone,
      sent: whatsappSent,
      error: result.error,
    })
  }

  // Email
  if (input.customerEmail) {
    const html = buildGuideEmailHtml(input)
    const result = await sendEmail(
      {
        to: input.customerEmail,
        subject: `Tu guía ${input.guideNumber} ha sido generada - Pedido ${input.orderNumber}`,
        html,
        text: `Hola ${input.customerName}, tu pedido ${input.orderNumber} fue enviado por ${input.carrier}. ` +
          `Número de guía: ${input.guideNumber}. Puedes hacer seguimiento con este número.`,
      },
      emailCfg,
    )
    emailSent = result.sent
    logger.info('notify.guide email', {
      orderNumber: input.orderNumber,
      to: input.customerEmail,
      sent: emailSent,
      error: result.error,
    })
  }

  // Guarda notificación en DB (para el historial del cliente).
  await db.notification
    .create({
      data: {
        channel: 'WHATSAPP',
        type: 'SUCCESS',
        title: `Guía generada - ${input.orderNumber}`,
        message: `Guía ${input.guideNumber} enviada por ${input.carrier}. WhatsApp: ${whatsappSent ? 'enviado' : 'no enviado'}.`,
      },
    })
    .catch(() => undefined)

  return { whatsapp: whatsappSent, email: emailSent }
}

// ------------------------------------------------------------
// notifyPaymentLink (COD)
// ------------------------------------------------------------

export interface PaymentLinkNotificationInput {
  orderNumber: string
  customerName: string
  customerPhone?: string | null
  customerEmail?: string | null
  amount: number
  paymentUrl: string
  provider: string
}

/**
 * Notifica al cliente el link de pago del transporte (COD).
 * WhatsApp + Email con el link de pago.
 */
export async function notifyPaymentLink(
  input: PaymentLinkNotificationInput,
): Promise<{ whatsapp: boolean; email: boolean }> {
  const [waCfg, emailCfg] = await Promise.all([getWhatsAppConfig(), getEmailConfig()])
  const phone = normalizePhone(input.customerPhone)

  let whatsappSent = false
  let emailSent = false

  if (phone) {
    const result = await sendWhatsApp(
      {
        to: phone,
        template: 'pago_transporte',
        variables: [
          input.customerName,
          input.orderNumber,
          `$${input.amount.toLocaleString('es-CO')}`,
          input.paymentUrl,
        ],
      },
      waCfg,
    )
    whatsappSent = result.sent
  }

  if (input.customerEmail) {
    const html = buildPaymentLinkEmailHtml(input)
    const result = await sendEmail(
      {
        to: input.customerEmail,
        subject: `Pago de transporte - Pedido ${input.orderNumber}`,
        html,
        text: `Hola ${input.customerName}, para despachar tu pedido ${input.orderNumber} ` +
          `necesitamos el pago del transporte ($${input.amount.toLocaleString('es-CO')}). ` +
          `Paga aquí: ${input.paymentUrl}`,
      },
      emailCfg,
    )
    emailSent = result.sent
  }

  logger.info('notify.payment-link', {
    orderNumber: input.orderNumber,
    whatsapp: whatsappSent,
    email: emailSent,
    provider: input.provider,
  })

  return { whatsapp: whatsappSent, email: emailSent }
}

// ------------------------------------------------------------
// Email HTML builders
// ------------------------------------------------------------

function buildGuideEmailHtml(d: GuideNotificationInput): string {
  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
  <div style="background: #059669; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 20px;">¡Tu pedido fue enviado!</h1>
  </div>
  <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
    <p style="margin: 0 0 16px;">Hola <strong>${escapeHtml(d.customerName)}</strong>,</p>
    <p style="margin: 0 0 16px;">Tu pedido <strong>${escapeHtml(d.orderNumber)}</strong> fue despachado exitosamente.</p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr><td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: bold;">Transportadora</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(d.carrier)}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: bold;">Número de guía</td><td style="padding: 8px; border: 1px solid #e5e7eb; font-family: monospace; font-size: 16px;">${escapeHtml(d.guideNumber)}</td></tr>
      ${d.city ? `<tr><td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: bold;">Ciudad destino</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(d.city)}</td></tr>` : ''}
    </table>
    <p style="margin: 16px 0 0; color: #6b7280; font-size: 14px;">Guarda el número de guía para hacer seguimiento de tu envío.</p>
  </div>
  <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 16px;">Ecommerce Inteligente</p>
</div>
`
}

function buildPaymentLinkEmailHtml(d: PaymentLinkNotificationInput): string {
  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
  <div style="background: #d97706; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 20px;">Pago de transporte requerido</h1>
  </div>
  <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
    <p style="margin: 0 0 16px;">Hola <strong>${escapeHtml(d.customerName)}</strong>,</p>
    <p style="margin: 0 0 16px;">Para despachar tu pedido <strong>${escapeHtml(d.orderNumber)}</strong> necesitamos el pago del transporte.</p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr><td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: bold;">Monto</td><td style="padding: 8px; border: 1px solid #e5e7eb; font-size: 18px; font-weight: bold;">$${d.amount.toLocaleString('es-CO')} COP</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: bold;">Pasarela</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(d.provider)}</td></tr>
    </table>
    <a href="${escapeHtml(d.paymentUrl)}" style="display: inline-block; background: #d97706; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; margin: 16px 0;">Pagar transporte</a>
    <p style="margin: 16px 0 0; color: #6b7280; font-size: 14px;">Si no puedes hacer clic, copia y pega este enlace: ${escapeHtml(d.paymentUrl)}</p>
  </div>
  <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 16px;">Ecommerce Inteligente</p>
</div>
`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
