import { describe, expect, it } from 'vitest';
import { assessmentForGroup, groupSupervisorAssignments, miniOsceForGroup, type Assessment, type Assignment } from './supervisorWorkspace';

const currentAssignment: Assignment = {
  id: 31,
  distribution_version_id: 28,
  rotation_block_id: 9,
  evaluation_weeks: [{ number: 5, start_date: '2026-09-27', end_date: '2026-10-03' }],
  training_site_id: 3,
  student_subgroup_id: 5,
  student: { id: 7, university_number: '123', full_name_ar: 'طالب' },
  rotation_block: { block_code: 'W5', from_week: 5, to_week: 5, rotation: { id: 19, course: { id: 4 } } },
};

const oldAssessment: Assessment = {
  id: 10,
  student_id: 7,
  student_clinical_assignment_id: 21,
  assessment_rotation_id: 19,
  assessment_kind: 'weekly',
  evaluation_week: 5,
  score: 8,
  max_score: 10,
  status: 'submitted',
  created_at: '2026-10-01T12:00:00Z',
  session: { rotation_block_id: 9, session_date: '2026-10-01' },
};

describe('current clinical assessment selection in the supervisor workspace', () => {
  it('keeps an old-version mark hidden until the assigned supervisor records a current one', () => {
    const [group] = groupSupervisorAssignments([currentAssignment], true);
    expect(group.distributionVersionId).toBe(28);
    expect(assessmentForGroup([oldAssessment], group, 7, 5)).toBeUndefined();
    const current = { ...oldAssessment, id: 11, student_clinical_assignment_id: 31, score: 6 };
    expect(assessmentForGroup([oldAssessment, current], group, 7, 5)?.id).toBe(11);
    expect(assessmentForGroup([oldAssessment], group, 7, 6)).toBeUndefined();
  });

  it('prefers the latest official current-version mark if one slot already contains duplicates', () => {
    const [group] = groupSupervisorAssignments([currentAssignment], true);
    const first = { ...oldAssessment, id: 11, student_clinical_assignment_id: 31, score: 8 };
    const latest = { ...first, id: 12, score: 6 };
    expect(assessmentForGroup([first, latest], group, 7, 5)?.id).toBe(12);
  });

  it('requires the same distribution version and block for mini OSCE', () => {
    const [group] = groupSupervisorAssignments([currentAssignment], true);
    const old = { student_id: 7, rotation_block_id: 9, distribution_version_id: 27, score: 4, max_score: 5 };
    const current = { ...old, distribution_version_id: 28, score: 3 };
    expect(miniOsceForGroup([old], group, 7)).toBeUndefined();
    expect(miniOsceForGroup([old, current], group, 7)?.score).toBe(3);
    expect(miniOsceForGroup([{ ...current, rotation_block_id: 8 }], group, 7)).toBeUndefined();
  });
});
