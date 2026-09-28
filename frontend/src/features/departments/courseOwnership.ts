export type CourseDepartment = { id: number; code: string; name_ar: string; name_en: string | null; is_active?: boolean };
export type CourseDepartmentOptions = { departments: CourseDepartment[]; can_assign_departments: boolean; department_scoped: boolean; academic_levels: string[] };

export function isDepartmentScopedHead(roles: string[] = []): boolean {
  const codes = roles.map(role => role.toUpperCase());
  return codes.includes('DEPARTMENT_HEAD') && !codes.some(role => ['SYS_ADMIN', 'DEAN', 'VICE_DEAN', 'CLINICAL_DIRECTOR'].includes(role));
}

export function visibleDepartmentLevels(levels: string[] = []): string[] {
  return ['fourth', 'fifth', 'sixth'].filter(level => levels.includes(level));
}
