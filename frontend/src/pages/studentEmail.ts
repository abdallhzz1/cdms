export function gmailComposeUrl({ to, bcc }: { to?: string; bcc?: string[] } = {}) {
  const params = new URLSearchParams({ view: 'cm', fs: '1' });
  if (to) params.set('to', to);
  if (bcc?.length) params.set('bcc', bcc.join(','));
  return `https://mail.google.com/mail/?${params.toString()}`;
}

// Gmail rejected a ~11,000-character compose link for 336 recipients in production.
// Keep a conservative guard because Gmail does not publish a supported URL length.
export const GMAIL_COMPOSE_URL_LIMIT = 4000;

export function gmailBccNeedsPaste(bcc: string[]): boolean {
  return gmailComposeUrl({ bcc }).length > GMAIL_COMPOSE_URL_LIMIT;
}
