// ============================================================
// sms.ts — SMS notification adapter (Twilio)
// ============================================================
// Envía SMS vía Twilio.
// Modo mock: solo loguea el mensaje (no envía).
// Modo real: POST a Twilio REST API.

import { logger } from '@/lib/logger'

export interface SmsConfig {
  provider?: 'twilio' | 'messagebird'
  accountSid?: string // Twilio
  authToken?: string // Twilio
  apiKey?: string // MessageBird
  from: string // número remitente
}

export interface SmsMessage {
  to: string // número E.164 (ej: "573001234567")
  body: string // contenido del SMS (máx 160 chars)
}

export async function sendSms(
  msg: SmsMessage,
  cfg: SmsConfig | null,
): Promise<{ sent: boolean; messageId?: string; error?: string }> {
  if (!cfg || (!cfg.authToken && !cfg.apiKey)) {
    logger.info('sms.send (mock/no-config)', { to: msg.to, body: msg.body.slice(0, 50) })
    return { sent: false, error: 'SMS no configurado (modo mock)' }
  }

  // Twilio
  if (cfg.provider === 'twilio' && cfg.accountSid && cfg.authToken) {
    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`
      const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64')
      const body = new URLSearchParams({
        From: cfg.from,
        To: msg.to,
        Body: msg.body,
      })

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      })

      if (!res.ok) {
        const errText = await res.text()
        logger.error('sms.send twilio failed', { status: res.status, errText: errText.slice(0, 200) })
        return { sent: false, error: `HTTP ${res.status}` }
      }

      const json = (await res.json()) as { sid: string }
      return { sent: true, messageId: json.sid }
    } catch (err) {
      return { sent: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  // MessageBird
  if (cfg.provider === 'messagebird' && cfg.apiKey) {
    try {
      const res = await fetch('https://rest.messagebird.com/messages', {
        method: 'POST',
        headers: {
          Authorization: `AccessKey ${cfg.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          originator: cfg.from,
          recipients: [msg.to],
          body: msg.body,
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        logger.error('sms.send messagebird failed', { status: res.status, errText: errText.slice(0, 200) })
        return { sent: false, error: `HTTP ${res.status}` }
      }

      const json = (await res.json()) as { id: string }
      return { sent: true, messageId: json.id }
    } catch (err) {
      return { sent: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  logger.warn('sms.send provider-not-implemented', { provider: cfg.provider })
  return { sent: false, error: `Proveedor ${cfg.provider} no implementado` }
}

/** Lee la config de SMS desde IntegrationSetting. */
export async function getSmsConfig(): Promise<SmsConfig | null> {
  const { db } = await import('@/lib/db')
  const setting = await db.integrationSetting.findUnique({
    where: { provider: 'SMS' },
  })
  if (!setting || !setting.active) return null
  try {
    return JSON.parse(setting.config) as SmsConfig
  } catch {
    logger.warn('sms.config parse-error')
    return null
  }
}
