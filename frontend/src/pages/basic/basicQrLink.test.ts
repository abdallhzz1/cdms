import { describe, expect, it } from 'vitest';
import { basicQrScanLink } from './basicQrLink';

describe('basic lecture camera QR', () => {
  it('encodes an ordinary site URL even if the API uses a different base host', () => {
    const link = basicQrScanLink('http://localhost/lecture-attendance?qr=signed.token', 'https://cdms.four7.ps');
    expect(link).toBe('https://cdms.four7.ps/lecture-attendance?qr=signed.token');
  });

  it('never displays a token-only or malformed QR', () => {
    expect(basicQrScanLink('12345678', 'https://cdms.four7.ps')).toBeNull();
    expect(basicQrScanLink('https://example.edu/lecture-attendance', 'https://cdms.four7.ps')).toBeNull();
  });
});
