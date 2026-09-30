/** Keep the signed short-lived token, but encode the URL of the site actually open on the lecturer's screen. */
export function basicQrScanLink(apiUrl: string, browserOrigin: string): string | null {
  try {
    const token = new URL(apiUrl, browserOrigin).searchParams.get('qr');
    if (!token) return null;
    const link = new URL('/lecture-attendance', browserOrigin);
    link.searchParams.set('qr', token);
    return link.toString();
  } catch {
    return null;
  }
}
