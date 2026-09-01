import { apiFetch } from './client';

export interface PaginatedResponse<T> {
  current_page: number;
  data: T[];
  first_page_url: string;
  from: number | null;
  last_page: number;
  last_page_url: string;
  next_page_url: string | null;
  path: string;
  per_page: number;
  prev_page_url: string | null;
  to: number | null;
  total: number;
  /** Laravel pagination metadata for endpoints wrapped by the API resource. */
  meta?: {
    current_page: number;
    from: number | null;
    last_page: number;
    to: number | null;
    total: number;
  };
}

export interface DistributionVersionListItem {
  id: number;
  rotation_id: number;
  name: string | null;
  status: 'draft' | 'suggested' | 'manual' | 'published';
  created_at: string;
  updated_at: string;
  is_current_published: boolean;
  is_superseded: boolean;
  total_eligible_students: number;
  assigned_students_count: number;
  unassigned_students_count: number;
  rotation?: {
    id: number;
    code: string;
    name: string;
    academic_level: 'fourth' | 'fifth' | 'sixth';
    academic_year?: {
      id: number;
      name: string;
    };
  };
}

export interface RotationListItem {
  id: number;
  academic_year_id: number;
  code: string;
  name: string;
  academic_level: 'fourth' | 'fifth' | 'sixth';
  status: string;
  academic_year?: { id: number; code: string; name?: string };
}

export interface RotationSetupOptions {
  academic_years: Array<{
    id: number;
    code: string;
    start_date: string;
    end_date: string;
    is_current: boolean;
  }>;
  training_sites: Array<{
    id: number;
    site_code: string;
    name_ar: string;
    name_en?: string | null;
    max_students_per_period?: number | null;
  }>;
}

export interface CreateRotationPayload {
  academic_year_id: number;
  code: string;
  name: string;
  academic_level: 'fourth' | 'fifth' | 'sixth';
  duration_weeks: number;
  start_date?: string | null;
  end_date?: string | null;
  status: 'draft' | 'active';
  blocks: Array<{ block_code: string; from_week: number; to_week: number }>;
  site_capacity_rules: Array<{ site_id: number; max_students: number }>;
}

export interface DistributionSubgroupAllocation {
  rotation_block_id: number;
  training_site_id: number;
  department_id: number | null;
  supervisor_id: number | null;
  student_count: number;
  rotation_block?: { id: number; name?: string; block_code?: string; from_week?: number; to_week?: number; start_week?: number; end_week?: number };
  training_site?: { id: number; name?: string; name_ar?: string; name_en?: string };
  supervisor?: { id: number; full_name_ar?: string; full_name_en?: string; first_name?: string; last_name?: string } | null;
}

export interface DistributionSubgroupItem {
  id: number;
  name: string;
  main_group: { id: number; name: string };
  capacity: number;
  student_count: number;
  students: Array<{ id: number; university_number: string; full_name_ar: string; full_name_en?: string | null }>;
  allocations: DistributionSubgroupAllocation[];
  roster_changed: boolean;
  status: 'assigned' | 'unassigned' | 'attention';
}

export interface TrainingSiteOption {
  id: number;
  site_code: string;
  name_ar: string;
  name_en?: string | null;
  primary_site_id?: number | null;
  is_active: boolean;
}

export interface SupervisorOption {
  id: number;
  full_name_ar: string;
  full_name_en?: string | null;
  primary_site_id?: number | null;
  department_id?: number | null;
  is_active: boolean;
}

export interface DistributionVersionDetail extends DistributionVersionListItem {
  rotation: {
    id: number;
    code: string;
    name: string;
    academic_level: 'fourth' | 'fifth' | 'sixth';
    academic_year?: {
      id: number;
      name: string;
    };
    blocks?: Array<{
      id: number;
      name?: string;
      block_code?: string;
      department_id: number;
      start_week?: number;
      end_week?: number;
      from_week?: number;
      to_week?: number;
    }>;
    site_capacity_rules?: Array<{
      id: number;
      site_id: number;
      max_students: number | null;
      site?: TrainingSiteOption;
    }>;
  };
  summary: {
    total_students: number;
    assigned_students: number;
    unassigned_students: number;
    total_assignments: number;
    conflicts: number;
    sites_used: number;
    blocks_used: number;
    supervisors_assigned: number;
    approval_state: {
      approved_at: string;
      fingerprint: string;
      is_override: boolean;
      override_reason: string | null;
    } | null;
  };
}

export interface StudentClinicalAssignmentItem {
  id: number;
  distribution_version_id: number;
  student_id: number;
  student_subgroup_id: number;
  rotation_block_id: number;
  training_site_id: number;
  department_id: number;
  supervisor_id: number | null;
  created_at: string;
  updated_at: string;
  student?: {
    id: number;
    student_number: string;
    first_name: string;
    last_name: string;
    full_name?: string;
  };
  student_subgroup?: {
    id: number;
    name: string;
  };
  rotation_block?: {
    id: number;
    name: string;
  };
  training_site?: {
    id: number;
    name: string;
  };
  department?: {
    id: number;
    name: string;
  };
  supervisor?: {
    id: number;
    first_name: string;
    last_name: string;
  } | null;
}

export interface AuditLogItem {
  id: number;
  user_id: number;
  action: string;
  entity_type: string;
  entity_id: number;
  distribution_version_id: number;
  student_id: number | null;
  changes: any;
  is_override: boolean;
  override_reason: string | null;
  created_at: string;
  user?: {
    id: number;
    name: string;
    email: string;
  };
  student?: {
    id: number;
    first_name: string;
    last_name: string;
    student_number: string;
  };
}

export interface VersionComparisonResult {
  version_base: number;
  version_compare: number;
  summary: {
    added: number;
    removed: number;
    moved_block: number;
    moved_site: number;
    supervisor_changed: number;
    newly_unassigned: number;
    newly_assigned: number;
  };
  changes: {
    added_students: number[];
    removed_students: number[];
    moved_block: Array<{ student_id: number; from: number; to: number }>;
    moved_site: Array<{ student_id: number; from: number; to: number }>;
    supervisor_changed: Array<{ student_id: number; from: number | null; to: number | null }>;
    newly_unassigned: number[];
    newly_assigned: number[];
  };
}

export function getDistributionVersions(params?: {
  page?: number;
  per_page?: number;
  rotation_id?: number;
  status?: string;
}): Promise<PaginatedResponse<DistributionVersionListItem>> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.per_page) query.set('per_page', String(params.per_page));
  if (params?.rotation_id) query.set('rotation_id', String(params.rotation_id));
  if (params?.status) query.set('status', params.status);

  const url = `/distribution-versions${query.toString() ? `?${query.toString()}` : ''}`;
  return apiFetch<PaginatedResponse<DistributionVersionListItem>>(url);
}

export function getRotations(params?: { academic_level?: string; status?: string }): Promise<RotationListItem[]> {
  const query = new URLSearchParams();
  if (params?.academic_level) query.set('academic_level', params.academic_level);
  if (params?.status) query.set('status', params.status);
  return apiFetch<RotationListItem[]>(`/rotations${query.toString() ? `?${query.toString()}` : ''}`);
}

export function getRotationSetupOptions(): Promise<RotationSetupOptions> {
  return apiFetch<RotationSetupOptions>('/rotations/setup-options');
}

export function createRotation(payload: CreateRotationPayload): Promise<RotationListItem> {
  return apiFetch<RotationListItem>('/rotations', { method: 'POST', body: payload });
}

export function createDistributionVersion(payload: { rotation_id: number; name?: string }): Promise<DistributionVersionListItem> {
  return apiFetch<DistributionVersionListItem>('/distribution-versions', { method: 'POST', body: payload });
}

export function generateDistribution(rotationId: number): Promise<{ distribution_version_id: number }> {
  return apiFetch<{ distribution_version_id: number }>(`/rotations/${rotationId}/distribution/generate`, { method: 'POST', body: {} });
}

export function getDistributionSubgroups(versionId: number): Promise<DistributionSubgroupItem[]> {
  return apiFetch<DistributionSubgroupItem[]>(`/distribution-versions/${versionId}/subgroups`);
}

export function createSubgroupAssignment(
  versionId: number,
  subgroupId: number,
  payload: { rotation_block_id: number; training_site_id: number; supervisor_id?: number | null; force?: boolean; override_reason?: string },
): Promise<DistributionSubgroupAllocation> {
  return apiFetch<DistributionSubgroupAllocation>(`/distribution-versions/${versionId}/subgroups/${subgroupId}/assignment`, { method: 'POST', body: payload });
}

export function updateSubgroupAssignment(
  versionId: number,
  subgroupId: number,
  payload: { rotation_block_id: number; training_site_id: number; supervisor_id?: number | null; force?: boolean; override_reason?: string },
): Promise<DistributionSubgroupAllocation> {
  return apiFetch<DistributionSubgroupAllocation>(`/distribution-versions/${versionId}/subgroups/${subgroupId}/assignment`, { method: 'PUT', body: payload });
}

export function deleteSubgroupAssignment(versionId: number, subgroupId: number): Promise<void> {
  return apiFetch<void>(`/distribution-versions/${versionId}/subgroups/${subgroupId}/assignment`, { method: 'DELETE' });
}

export function getTrainingSiteOptions(): Promise<TrainingSiteOption[]> {
  return apiFetch<TrainingSiteOption[]>('/training-sites?active=1&per_page=200');
}

export function getSupervisorOptions(): Promise<SupervisorOption[]> {
  return apiFetch<SupervisorOption[]>('/people?active=1&per_page=200');
}

export function getDistributionOptions(versionId: number): Promise<{ sites: TrainingSiteOption[]; supervisors: SupervisorOption[] }> {
  return apiFetch<{ sites: TrainingSiteOption[]; supervisors: SupervisorOption[] }>(`/distribution-versions/${versionId}/options`);
}

export function getDistributionVersion(id: number): Promise<DistributionVersionDetail> {
  return apiFetch<DistributionVersionDetail>(`/distribution-versions/${id}`);
}

export function getAssignments(
  versionId: number,
  params?: {
    page?: number;
    per_page?: number;
    search?: string;
    block_id?: number;
    site_id?: number;
    department_id?: number;
    supervisor_id?: number;
    subgroup_id?: number;
  }
): Promise<PaginatedResponse<StudentClinicalAssignmentItem>> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.per_page) query.set('per_page', String(params.per_page));
  if (params?.search) query.set('search', params.search);
  if (params?.block_id) query.set('block_id', String(params.block_id));
  if (params?.site_id) query.set('site_id', String(params.site_id));
  if (params?.department_id) query.set('department_id', String(params.department_id));
  if (params?.supervisor_id) query.set('supervisor_id', String(params.supervisor_id));
  if (params?.subgroup_id) query.set('subgroup_id', String(params.subgroup_id));

  const url = `/distribution-versions/${versionId}/assignments${query.toString() ? `?${query.toString()}` : ''}`;
  return apiFetch<PaginatedResponse<StudentClinicalAssignmentItem>>(url);
}

export function createAssignment(
  versionId: number,
  payload: {
    student_id: number;
    student_subgroup_id?: number;
    rotation_block_id: number;
    training_site_id: number;
    supervisor_id?: number | null;
    force?: boolean;
    override_reason?: string;
  }
): Promise<StudentClinicalAssignmentItem> {
  return apiFetch<StudentClinicalAssignmentItem>(`/distribution-versions/${versionId}/assignments`, {
    method: 'POST',
    body: payload,
  });
}

export function updateAssignment(
  versionId: number,
  assignmentId: number,
  payload: {
    rotation_block_id?: number;
    training_site_id?: number;
    supervisor_id?: number | null;
    force?: boolean;
    override_reason?: string;
  }
): Promise<StudentClinicalAssignmentItem> {
  return apiFetch<StudentClinicalAssignmentItem>(`/distribution-versions/${versionId}/assignments/${assignmentId}`, {
    method: 'PUT',
    body: payload,
  });
}

export function deleteAssignment(versionId: number, assignmentId: number): Promise<void> {
  return apiFetch<void>(`/distribution-versions/${versionId}/assignments/${assignmentId}`, {
    method: 'DELETE',
  });
}

export function getUnassignedStudents(versionId: number): Promise<any[]> {
  return apiFetch<any[]>(`/distribution-versions/${versionId}/unassigned`);
}

export function getConflicts(versionId: number): Promise<any[]> {
  return apiFetch<any[]>(`/distribution-versions/${versionId}/conflicts`);
}

export function getAuditLogs(versionId: number, page: number = 1): Promise<PaginatedResponse<AuditLogItem>> {
  return apiFetch<PaginatedResponse<AuditLogItem>>(`/distribution-versions/${versionId}/audit-logs?page=${page}`);
}

export function approveVersion(
  versionId: number,
  payload?: { force?: boolean; override_reason?: string }
): Promise<any> {
  return apiFetch<any>(`/distribution-versions/${versionId}/approve`, {
    method: 'POST',
    body: payload ?? {},
  });
}

export function publishVersion(
  versionId: number,
  payload: { last_updated_at: string; force?: boolean; override_reason?: string }
): Promise<any> {
  return apiFetch<any>(`/distribution-versions/${versionId}/publish`, {
    method: 'POST',
    body: payload,
  });
}

export function compareVersions(versionId: number, otherVersionId: number): Promise<VersionComparisonResult> {
  return apiFetch<VersionComparisonResult>(`/distribution-versions/${versionId}/compare/${otherVersionId}`);
}

export interface ClinicalScheduleItem {
  assignment_id: number;
  distribution_version_id: number;
  student: {
    id: number;
    university_number: string;
    full_name_ar: string;
    full_name_en?: string;
    full_name: string;
    registration_status: string;
  } | null;
  group: {
    id: number;
    name: string;
  } | null;
  subgroup: {
    id: number;
    name: string;
    group: {
      id: number;
      name: string;
    } | null;
  } | null;
  rotation: {
    id: number;
    code: string;
    name: string;
    academic_year_id: number;
    academic_level: string;
    start_date: string | null;
    end_date: string | null;
    schedule_scope?: 'period' | 'annual';
  } | null;
  clinical_period: {
    id: number;
    code: string;
    name_ar: string;
    name_en?: string | null;
    sequence: number;
  } | null;
  course: {
    id: number;
    code: string;
    name_ar: string;
    name_en?: string;
  } | null;
  block: {
    id: number;
    block_code: string;
    from_week: number;
    to_week: number;
    start_date: string | null;
    end_date: string | null;
  } | null;
  training_site: {
    id: number;
    name: string;
    name_en?: string;
    name_ar?: string;
  } | null;
  department: {
    id: number;
    name: string;
    name_en?: string;
    name_ar?: string;
  } | null;
  supervisor: {
    id: number;
    full_name_ar: string;
    full_name_en?: string;
    name: string;
    email?: string;
  } | null;
}

export function getClinicalSchedule(params?: {
  page?: number;
  per_page?: number;
  rotation_id?: number;
  rotation_block_id?: number;
  training_site_id?: number;
  department_id?: number;
  supervisor_id?: number;
  student_id?: number;
  search?: string;
}): Promise<PaginatedResponse<ClinicalScheduleItem>> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.per_page) query.set('per_page', String(params.per_page));
  if (params?.rotation_id) query.set('rotation_id', String(params.rotation_id));
  if (params?.rotation_block_id) query.set('rotation_block_id', String(params.rotation_block_id));
  if (params?.training_site_id) query.set('training_site_id', String(params.training_site_id));
  if (params?.department_id) query.set('department_id', String(params.department_id));
  if (params?.supervisor_id) query.set('supervisor_id', String(params.supervisor_id));
  if (params?.student_id) query.set('student_id', String(params.student_id));
  if (params?.search) query.set('search', params.search);

  const url = `/operational/clinical-schedule${query.toString() ? `?${query.toString()}` : ''}`;
  return apiFetch<PaginatedResponse<ClinicalScheduleItem>>(url);
}

export function getStudentClinicalSchedule(studentId: number): Promise<ClinicalScheduleItem[]> {
  return apiFetch<ClinicalScheduleItem[]>(`/students/${studentId}/current-clinical-schedule`);
}

// ============================================================================
// Phase 5C — Supervisor Portal & Post-Publication Supervisor Management
// ============================================================================

export interface SupervisorAssignment {
  id: number;
  distribution_version_id: number;
  student_id: number;
  student_subgroup_id: number | null;
  rotation_block_id: number;
  training_site_id: number;
  department_id: number;
  supervisor_id: number | null;
  created_at: string;
  updated_at: string;
  student: {
    id: number;
    university_number: string;
    full_name_ar: string;
    full_name_en: string | null;
  } | null;
  rotation_block: {
    id: number;
    block_code: string;
    from_week: number;
    to_week: number;
    rotation: {
      id: number;
      name: string;
      start_date: string | null;
      academic_year?: { id: number; name: string };
    };
  } | null;
  training_site: {
    id: number;
    name_en: string;
    name_ar: string;
  } | null;
  department: {
    id: number;
    name_en: string;
    name_ar: string;
  } | null;
}

export interface MySupervisorAssignmentsResponse {
  success: boolean;
  message: string;
  data: SupervisorAssignment[];
  meta?: {
    person_id: number | null;
    full_name_ar?: string;
    full_name_en?: string;
    total: number;
    is_supervisor: boolean;
  };
}

/**
 * GET /api/v1/operational/my-supervisor-assignments
 * Authenticated supervisor's portal view — their assigned students in current published distribution.
 */
export function getMySupervisorAssignments(): Promise<MySupervisorAssignmentsResponse> {
  return apiFetch<MySupervisorAssignmentsResponse>('/operational/my-supervisor-assignments');
}

/**
 * GET /api/v1/operational/supervisors/{personId}/assignments
 * Admin view of any supervisor's current published assignments.
 */
export function getSupervisorAssignments(personId: number): Promise<MySupervisorAssignmentsResponse> {
  return apiFetch<MySupervisorAssignmentsResponse>(`/operational/supervisors/${personId}/assignments`);
}

/**
 * PUT /api/v1/operational/assignments/{assignmentId}/supervisor
 * Post-publication supervisor reassignment. Only supervisor_id changes; placement is immutable.
 */
export function reassignSupervisor(
  assignmentId: number,
  supervisorId: number | null
): Promise<{ success: boolean; message: string; data: SupervisorAssignment; warning?: string }> {
  return apiFetch<{ success: boolean; message: string; data: SupervisorAssignment; warning?: string }>(
    `/operational/assignments/${assignmentId}/supervisor`,
    {
      method: 'PUT',
      body: { supervisor_id: supervisorId },
    }
  );
}

// ============================================================================
// Phase 5D — Department & Training Site Rosters
// ============================================================================

export interface SupervisorWorkloadItem {
  supervisor_id: number;
  full_name_en: string;
  full_name_ar: string;
  assigned_count: number;
  max_students: number | null;
  is_active: boolean;
  workload_warning: boolean;
}

export interface DepartmentSummary {
  department: {
    id: number;
    code: string;
    name_ar: string;
    name_en: string;
    dept_type: string;
    is_active: boolean;
  };
  summary: {
    total_assigned_students: number;
    total_rotation_blocks: number;
    total_training_sites: number;
    total_supervisors_assigned: number;
    unsupervised_assignments: number;
  };
  supervisor_workload: SupervisorWorkloadItem[];
  no_current_distribution: boolean;
}

export interface TrainingSiteCapacityItem {
  rotation_id: number;
  rotation_name: string;
  rotation_code: string;
  capacity_limit: number | null;
  assigned_count: number;
  available_capacity: number | null;
  utilization_percentage: number | null;
  utilization_status: 'AVAILABLE' | 'NEAR_CAPACITY' | 'FULL' | 'OVER_CAPACITY' | 'NO_RULE' | 'NO_CAPACITY';
  over_capacity: boolean;
}

export interface TrainingSiteSummary {
  training_site: {
    id: number;
    site_code: string;
    name_ar: string;
    name_en: string;
    site_type: string;
    city: string;
    is_active: boolean;
    coordinator_name: string | null;
    coordinator_phone: string | null;
    coordinator_email: string | null;
  };
  capacity_by_rotation: TrainingSiteCapacityItem[];
  summary: {
    total_assigned_students: number;
    total_departments: number;
    total_supervisors_assigned: number;
    unsupervised_assignments: number;
    has_over_capacity: boolean;
  };
  supervisor_workload: SupervisorWorkloadItem[];
  no_current_distribution: boolean;
}

export interface BaseRosterParams {
  page?: number;
  per_page?: number;
  rotation_id?: number;
  rotation_block_id?: number;
  supervisor_id?: number;
  academic_level?: string;
  student_id?: number;
  search?: string;
}

export interface DepartmentRosterParams extends BaseRosterParams {
  training_site_id?: number;
}

export interface TrainingSiteRosterParams extends BaseRosterParams {
  department_id?: number;
}

export function getDepartmentRoster(
  departmentId: number,
  params?: DepartmentRosterParams
): Promise<PaginatedResponse<ClinicalScheduleItem>> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.per_page) query.set('per_page', String(params.per_page));
  if (params?.rotation_id) query.set('rotation_id', String(params.rotation_id));
  if (params?.rotation_block_id) query.set('rotation_block_id', String(params.rotation_block_id));
  if (params?.training_site_id) query.set('training_site_id', String(params.training_site_id));
  if (params?.supervisor_id) query.set('supervisor_id', String(params.supervisor_id));
  if (params?.academic_level) query.set('academic_level', params.academic_level);
  if (params?.student_id) query.set('student_id', String(params.student_id));
  if (params?.search) query.set('search', params.search);

  const qs = query.toString();
  return apiFetch<PaginatedResponse<ClinicalScheduleItem>>(
    `/departments/${departmentId}/current-distribution/roster${qs ? `?${qs}` : ''}`
  );
}

export function getDepartmentSummary(departmentId: number): Promise<{ success: boolean; data: DepartmentSummary }> {
  return apiFetch<{ success: boolean; data: DepartmentSummary }>(`/departments/${departmentId}/current-distribution/summary`);
}

export function getTrainingSiteRoster(
  siteId: number,
  params?: TrainingSiteRosterParams
): Promise<PaginatedResponse<ClinicalScheduleItem>> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.per_page) query.set('per_page', String(params.per_page));
  if (params?.rotation_id) query.set('rotation_id', String(params.rotation_id));
  if (params?.rotation_block_id) query.set('rotation_block_id', String(params.rotation_block_id));
  if (params?.department_id) query.set('department_id', String(params.department_id));
  if (params?.supervisor_id) query.set('supervisor_id', String(params.supervisor_id));
  if (params?.academic_level) query.set('academic_level', params.academic_level);
  if (params?.student_id) query.set('student_id', String(params.student_id));
  if (params?.search) query.set('search', params.search);

  const qs = query.toString();
  return apiFetch<PaginatedResponse<ClinicalScheduleItem>>(
    `/training-sites/${siteId}/current-distribution/roster${qs ? `?${qs}` : ''}`
  );
}

export function getTrainingSiteSummary(siteId: number): Promise<{ success: boolean; data: TrainingSiteSummary }> {
  return apiFetch<{ success: boolean; data: TrainingSiteSummary }>(`/training-sites/${siteId}/current-distribution/summary`);
}

/**
 * Phase 5E — Operational Reports Helper
 */
export function getReportDownloadUrl(
  reportType: 'students' | 'departments' | 'sites' | 'supervisors' | 'unassigned',
  entityId?: number,
  params?: { rotation_id: number; format: 'excel' | 'csv' | 'pdf'; [key: string]: any }
): string {
  const query = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        query.set(key, String(val));
      }
    });
  }
  
  let path = `/operational/reports/${reportType}`;
  if (reportType === 'departments' && entityId) path = `/operational/reports/departments/${entityId}`;
  if (reportType === 'supervisors' && entityId) path = `/operational/reports/supervisors/${entityId}`;

  return `/api/v1${path}?${query.toString()}`;
}

/**
 * Phase 6B — Clinical Operations Dashboard Types & API Client
 */
export interface DashboardSummary {
  student_coverage: {
    total_active_students: number;
    assigned_students: number;
    unassigned_students: number;
    coverage_percentage: number;
  };
  distribution_overview: {
    active_rotations_count: number;
    active_blocks_count: number;
    total_placements_count: number;
    published_at: string | null;
  };
  alerts: {
    unassigned_students_count: number;
    sites_near_capacity_count: number;
    sites_over_capacity_count: number;
    unsupervised_assignments_count: number;
    inactive_supervisor_assignments_count: number;
  };
  department_distribution: Array<{
    department_id: number;
    name_ar: string;
    name_en: string;
    assigned_count: number;
    share_percentage: number;
  }>;
  site_capacity_utilization: Array<{
    site_id: number;
    name_ar: string;
    name_en: string;
    capacity_limit: number | null;
    assigned_count: number;
    available_capacity: number | null;
    utilization_percentage: number | null;
    status: 'AVAILABLE' | 'NEAR_CAPACITY' | 'FULL' | 'OVER_CAPACITY' | 'NO_RULE' | 'NO_CAPACITY';
  }>;
  supervisor_workload_summary: Array<{
    supervisor_id: number;
    full_name_ar: string;
    full_name_en: string;
    assigned_count: number;
    max_students: number | null;
    workload_warning: boolean;
  }>;
}

export interface DashboardFilters {
  academic_year_id?: number;
  rotation_id?: number;
  rotation_block_id?: number;
  department_id?: number;
  training_site_id?: number;
  supervisor_id?: number;
  academic_level?: string;
}

export function getDashboardSummary(filters?: DashboardFilters): Promise<{ success: boolean; data: DashboardSummary; meta?: { generated_at: string } }> {
  const query = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        query.set(key, String(val));
      }
    });
  }
  const qs = query.toString();
  return apiFetch<{ success: boolean; data: DashboardSummary; meta?: { generated_at: string } }>(
    `/operational/dashboard/summary${qs ? `?${qs}` : ''}`
  );
}
