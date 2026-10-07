export function gmailComposeUrl({ to, bcc }: { to?: string; bcc?: string[] } = {}) {
  const params = new URLSearchParams({ view: 'cm', fs: '1' });
  if (to) params.set('to', to);
  if (bcc?.length) params.set('bcc', bcc.join(','));
  return `https://mail.google.com/mail/?${params.toString()}`;
}
