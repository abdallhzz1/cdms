import { describe, expect, it } from 'vitest';
import { isDepartmentScopedHead, visibleDepartmentLevels } from './courseOwnership';

describe('department course ownership', () => {
  it('does not let a cohort or supervisor role expand the department boundary', () => {
    expect(isDepartmentScopedHead(['DEPARTMENT_HEAD', 'RTA', 'CLINICAL_SUPERVISOR'])).toBe(true);
    expect(isDepartmentScopedHead(['DEPARTMENT_HEAD', 'CLINICAL_DIRECTOR'])).toBe(false);
    expect(isDepartmentScopedHead(['SYS_ADMIN', 'DEPARTMENT_HEAD'])).toBe(false);
    expect(isDepartmentScopedHead(['RTA'])).toBe(false);
  });
  it('only shows the levels returned by the scoped directory, in academic order', () => {
    expect(visibleDepartmentLevels(['fifth'])).toEqual(['fifth']);
    expect(visibleDepartmentLevels(['sixth', 'fourth', 'fourth', 'all'])).toEqual(['fourth', 'sixth']);
    expect(visibleDepartmentLevels()).toEqual([]);
  });
});
