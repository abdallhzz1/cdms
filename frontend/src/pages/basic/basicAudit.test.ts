import { beforeEach, describe, expect, it } from 'vitest';
import { basicAuditSummary } from './basicAudit';

beforeEach(() => localStorage.setItem('cdms.locale', 'ar'));

describe('basic attendance audit descriptions', () => {
  it('replaces machine events and JSON with readable Arabic details', () => {
    const result = basicAuditSummary({ event: 'session.finalize', details: '{"previous_state":"paused","state":"finalized"}' }, []);
    expect(result.title).toBe('اعتماد المحاضرة');
    expect(result.details.join(' ')).toContain('الحالة');
    expect(result.details.join(' ')).not.toContain('previous_state');
  });

  it('identifies the student without printing raw identifiers', () => {
    const result = basicAuditSummary({ event: 'student.check_in', details: '{"student_id":47}' }, [{ student_id: 47, name: 'سارة' }]);
    expect(result.title).toBe('تسجيل دخول طالب');
    expect(result.details).toContain('الطالب: سارة');
  });

  it('does not expose malformed legacy payloads', () => {
    const result = basicAuditSummary({ event: 'unknown.code', details: '{broken' }, []);
    expect(result.title).toBe('تحديث على المحاضرة');
    expect(result.details).toEqual([]);
  });
});
