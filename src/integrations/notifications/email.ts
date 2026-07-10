// ============================================================
// email.ts — Email notification adapter
// ============================================================
// Envía correos. En ausencia de SMTP configurado, loguea el
// mensaje (modo mock). La integración real puede usar Resend,
// SendGrid, SES, etc. — el port `sendEmail` es agnóstico.

import { logger } from '@/lib/logger'

export interface EmailConfig {
  provider?: 'resend' | 'sendgrid' | 'ses' | 'smtp'
  apiKey?: string
  fromAddress: string
  fromName?: string
}

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text?: string
}

export async function sendEmail(
  msg: EmailMessage,
  cfg: EmailConfig | null,
): Promise<{ sent: boolean; messageId?: string; error?: string }> {
  if (!cfg || !cfg.apiKey) {
    logger.info('email.send (mock/no-config)', { to: msg.to, subject: msg.subject })
    return { sent: false, error: 'Email no configurado (modo mock)' }
  }

  // Resend
  if (cfg.provider === 'resend' && cfg.apiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          from: `${cfg.fromName ?? 'Ecommerce'} <${cfg.fromAddress}>`,
          to: msg.to,
          subject: msg.subject,
          html: msg.html,
          text: msg.text,
        }),
      })
      if (!res.ok) {
        const errText = await res.text()
        logger.error('email.send resend failed', { status: res.status, errText })
        return { sent: false, error: `HTTP ${res.status}` }
      }
      const json = (await res.json()) as { id: string }
      return { sent: true, messageId: json.id }
    } catch (err) {
      return { sent: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  // Otros proveedores: implementar de forma análoga.
  logger.warn('email.send provider-not-implemented', { provider: cfg.provider })
  return { sent: false, error: `Proveedor ${cfg.provider} no implementado` }
}

/** Lee la config de email desde IntegrationSetting. */
export { getEmailConfig } from './email-config'
