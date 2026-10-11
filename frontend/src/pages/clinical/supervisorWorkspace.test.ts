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

describe('clinical assessment continuity in the supervisor workspace', () => {
  it('shows a submitted mark from the previous distribution version', () => {
    const [group] = groupSupervisorAssignments([currentAssignment], true);
    expect(group.rotationId).toBe(19);
    expect(assessmentForGroup([oldAssessment], group, 7, 5)?.id).toBe(10);
    expect(assessmentForGroup([oldAssessment], group, 7, 6)).toBeUndefined();
    expect(assessmentForGroup([{ ...oldAssessment, assessment_rotation_id: 20 }], group, 7, 5)).toBeUndefined();
  });

  it('prefers the first official submission when a later revision already contains a duplicate', () => {
    const [group] = groupSupervisorAssignments([currentAssignment], true);
    const duplicate = { ...oldAssessment, id: 11, student_clinical_assignment_id: 31, score: 2 };
    expect(assessmentForGroup([duplicate, oldAssessment], group, 7, 5)?.id).toBe(10);
  });

  it('finds a mini OSCE from the previous distribution block', () => {
    const [group] = groupSupervisorAssignments([currentAssignment], true);
    expect(miniOsceForGroup([{ student_id: 7, rotation_block_id: 8, rotation_id: 19, from_week: 5, to_week: 5, score: 4, max_score: 5 }], group, 7)?.score).toBe(4);
    expect(miniOsceForGroup([{ student_id: 7, rotation_block_id: 8, rotation_id: 20, from_week: 5, to_week: 5, score: 4, max_score: 5 }], group, 7)).toBeUndefined();
  });
});
