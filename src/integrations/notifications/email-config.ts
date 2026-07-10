// ============================================================
// email-config.ts — Load email config from IntegrationSetting
// ============================================================

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import type { EmailConfig } from './email'

export async function getEmailConfig(): Promise<EmailConfig | null> {
  const setting = await db.integrationSetting.findUnique({
    where: { provider: 'EMAIL' },
  })
  if (!setting || !setting.active) return null
  try {
    return JSON.parse(setting.config) as EmailConfig
  } catch {
    logger.warn('email.config parse-error')
    return null
  }
}
