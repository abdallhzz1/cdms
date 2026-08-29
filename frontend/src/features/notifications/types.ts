export type NotificationSeverity = 'info' | 'action' | 'urgent';

export type LocalNotification = {
  id: string;
  event_key: string;
  category: string;
  severity: NotificationSeverity;
  title_ar: string;
  title_en: string;
  message_ar: string;
  message_en: string;
  action_url?: string | null;
  entity_type?: string | null;
  entity_id?: number | string | null;
  actor_name?: string | null;
  read_at?: string | null;
  created_at: string;
};

export function notificationText(item: LocalNotification, locale: 'ar' | 'en') {
  return locale === 'ar'
    ? { title: item.title_ar || item.title_en, message: item.message_ar || item.message_en }
    : { title: item.title_en || item.title_ar, message: item.message_en || item.message_ar };
}

export function relativeNotificationTime(value: string, locale: 'ar' | 'en'): string {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000], ['month', 2_592_000], ['week', 604_800],
    ['day', 86_400], ['hour', 3_600], ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return formatter.format(seconds, 'second');
}
