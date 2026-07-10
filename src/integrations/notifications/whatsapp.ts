// ============================================================
// whatsapp.ts — WhatsApp Business API notification adapter
// ============================================================
// Envía mensajes por WhatsApp Cloud API (Meta).
// Modo mock: solo loguea el mensaje (no envía).
// Modo real: POST https://graph.facebook.com/v18.0/{phone_id}/messages

import { logger } from '@/lib/logger'

export interface WhatsAppConfig {
  apiUrl?: string
  phoneNumberId: string
  accessToken: string
  templateName?: string
}

export interface WhatsAppMessage {
  to: string          // número E.164 (e.g. "573001234567")
  template: string    // nombre del template aprobado por Meta
  variables: string[] // variables del template, en orden
}

export async function sendWhatsApp(
  msg: WhatsAppMessage,
  cfg: WhatsAppConfig | null,
): Promise<{ sent: boolean; messageId?: string; error?: string }> {
  if (!cfg || !cfg.phoneNumberId || !cfg.accessToken) {
    logger.info('whatsapp.send (mock/no-config)', { to: msg.to, template: msg.template })
    return { sent: false, error: 'WhatsApp no configurado (modo mock)' }
  }

  try {
    const url = `https://graph.facebook.com/v18.0/${cfg.phoneNumberId}/messages`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: msg.to,
        type: 'template',
        template: {
          name: msg.template,
          language: { code: 'es_CO' },
          components: [
            {
              type: 'body',
              parameters: msg.variables.map((v) => ({ type: 'text', text: v })),
            },
          ],
        },
      }),
    })
    if (!res.ok) {
      const errText = await res.text()
      logger.error('whatsapp.send failed', { status: res.status, errText })
      return { sent: false, error: `HTTP ${res.status}` }
    }
    const json = (await res.json()) as { message_id: string }
    return { sent: true, messageId: json.message_id }
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) }
  }
}
