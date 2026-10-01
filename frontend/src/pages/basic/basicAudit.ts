import { basicText as bt } from '@/i18n/basicAttendance';

type AuditItem = { event: string; details: string | null };
const titles: Record<string, Parameters<typeof bt>[0]> = {
  'session.opened': 'auditSessionOpened',
  'session.close': 'auditSessionClosed',
  'session.open_exit': 'auditExitOpened',
  'session.reopen_entry': 'auditEntryReopened',
  'session.finalize': 'auditFinalized',
  'student.check_in': 'auditStudentIn',
  'student.check_out': 'auditStudentOut',
  'record.corrected': 'auditCorrection',
  'session.archived': 'auditSessionArchived',
};

export function basicAuditSummary(item: AuditItem, students: { student_id: number; name: string }[]): { title: string; details: string[] } {
  let data: Record<string, unknown> = {};
  try { const parsed: unknown = JSON.parse(item.details ?? '{}'); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed as Record<string, unknown>; } catch { /* Legacy audit payloads stay hidden, not rendered as code. */ }
  const details: string[] = [];
  if (typeof data.roster_count === 'number') details.push(bt('auditRosterCount', { count: data.roster_count }));
  if (typeof data.previous_state === 'string' && typeof data.state === 'string') details.push(bt('auditStateChange', { before: stateLabel(data.previous_state), after: stateLabel(data.state) }));
  if (typeof data.student_id === 'number') {
    const student = students.find(row => row.student_id === data.student_id);
    if (student) details.push(bt('auditStudent', { name: student.name }));
  }
  if (typeof data.reason === 'string' && data.reason.trim()) details.push(bt('auditReason', { reason: data.reason }));
  if (item.event === 'record.corrected' && data.new && typeof data.new === 'object') {
    const status = (data.new as Record<string, unknown>).status;
    if (typeof status === 'string') details.push(statusLabel(status));
  }
  return { title: bt(titles[item.event] ?? 'auditUnknown'), details };
}

function stateLabel(value: string) { return ({ check_in: bt('text001'), paused: bt('text002'), check_out: bt('text003'), finalized: bt('text004') } as Record<string, string>)[value] ?? bt('auditUnknown'); }
function statusLabel(value: string) { return ({ present: bt('text005'), absent: bt('text006'), incomplete: bt('text007'), excused: bt('text008'), pending: bt('text009') } as Record<string, string>)[value] ?? bt('auditUnknown'); }
