import { describe, expect, it } from 'vitest';
import { gmailComposeUrl } from './studentEmail';

describe('Gmail student compose links', () => {
  it('opens one student in Gmail without delegating to the operating-system mail app', () => {
    const url = new URL(gmailComposeUrl({ to: '22310001@students.hebron.edu' }));
    expect(url.origin).toBe('https://mail.google.com');
    expect(url.searchParams.get('to')).toBe('22310001@students.hebron.edu');
  });

  it('puts group recipients in Bcc rather than To', () => {
    const url = new URL(gmailComposeUrl({ bcc: ['first@students.hebron.edu', 'second@students.hebron.edu'] }));
    expect(url.searchParams.get('to')).toBeNull();
    expect(url.searchParams.get('bcc')).toBe('first@students.hebron.edu,second@students.hebron.edu');
  });
});
