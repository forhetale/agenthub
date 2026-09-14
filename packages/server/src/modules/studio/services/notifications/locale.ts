/** Languages the Bark notification text can be written in. */
export const NOTIFICATION_LOCALES = ['zh', 'zh-TW', 'en', 'ja', 'ko', 'fr', 'es', 'de', 'pt', 'ru', 'ar'] as const
export type NotificationLocale = (typeof NOTIFICATION_LOCALES)[number]

export function normalizeNotificationLocale(value: unknown): NotificationLocale {
  const locale = typeof value === 'string' ? value.trim() : ''
  return (NOTIFICATION_LOCALES as readonly string[]).includes(locale)
    ? locale as NotificationLocale
    : 'zh'
}

