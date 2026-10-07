/** Laravel date casts are serialized as ISO timestamps; date inputs need YYYY-MM-DD. */
export function dateOnly(value?: string | null): string {
  return value?.slice(0, 10) || '';
}

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
