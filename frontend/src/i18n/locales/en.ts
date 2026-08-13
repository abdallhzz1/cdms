/**
 * English translation dictionary. Keys are namespaced as
 * `<area>.<key>` (e.g. `common.appName`) — see PROJECT_RULES.md §7:
 * every user-facing string goes through a translation key, never
 * hardcoded text inside a component.
 *
 * Deliberately NOT `as const`: that would infer each value as its exact
 * string literal, which would then force `ar.ts` (typed as `typeof en`) to
 * contain the identical English text instead of just the same *shape*.
 * Object literal keys are already literal types without `as const`, which
 * is all `DotPaths` (see I18nContext.tsx) needs — so leaving values as
 * plain `string` here is both simpler and correct.
 */
const en = {
  common: {
    appName: 'Clinical Department Management System',
    appShortName: 'CDMS',
    organization: 'Hebron University — Faculty of Medicine',
    loading: 'Loading…',
    retry: 'Retry',
    language: 'Language',
  },
  nav: {
    dashboard: 'Dashboard',
  },
  foundation: {
    title: 'Foundation',
    subtitle: 'Technical foundation check — Phase 1',
    apiStatusHeading: 'Backend API status',
    apiStatusChecking: 'Checking backend connection…',
    applicationLabel: 'Application',
    databaseLabel: 'Database',
    statusOk: 'OK',
    statusUnreachable: 'Unreachable',
    apiStatusError: 'Could not reach the backend API.',
    apiStatusErrorHint: 'Confirm the backend is running and VITE_API_BASE_URL is set correctly.',
  },
  notFound: {
    title: 'Page not found',
    body: 'The page you are looking for does not exist.',
    backLink: 'Back to Foundation',
  },
  auth: {
    title: 'Sign in',
    subtitle: 'Sign in with your Clinical Department account.',
    emailLabel: 'Email address',
    passwordLabel: 'Password',
    submit: 'Sign in',
    submitting: 'Signing in…',
    invalidCredentials: 'The email or password you entered is incorrect.',
    unknownError: 'Something went wrong. Please try again.',
    signedInAs: 'Signed in as',
    logout: 'Log out',
    loggingOut: 'Logging out…',
  },
  validation: {
    required: 'This field is required.',
    email: 'Enter a valid email address.',
  },
  roles: {
    sys_admin: { name: 'System Administrator', description: 'Technical administration' },
    dean: { name: 'Dean', description: 'College leadership and final approvals' },
    vice_dean: { name: 'Vice Dean', description: 'Academic/administrative review and approvals' },
    clinical_director: { name: 'Clinical Department Director', description: 'Manage clinical department and approve processes' },
    admin_assistant: { name: 'Administrative Assistant', description: 'Data entry, correspondence, documents, operational support' },
    department_head: { name: 'Department Head', description: 'Manage department staff, supervisors and evaluations' },
    rta: { name: 'Research & Teaching Assistant', description: 'Academic/research support and assigned data' },
    clinical_supervisor: { name: 'Clinical Supervisor', description: 'Clinical supervision, attendance and student evaluation' },
    academic_advisor: { name: 'Academic Advisor', description: 'Advising and at-risk cases' },
    quality: { name: 'Quality Unit', description: 'Quality surveys, KPIs, reports and improvement' },
  },
  permissions: {
    students_view: { description: 'View student records within scope' },
    students_create: { description: 'Create student record' },
    students_update: { description: 'Update permitted student data' },
    students_delete: { description: 'Archive/remove according to policy' },
    students_export: { description: 'Export permitted student data' },
    grades_view: { description: 'View grades' },
    grades_create: { description: 'Enter grades' },
    grades_update: { description: 'Modify grades before lock' },
    grades_lock: { description: 'Lock grade period' },
    grades_approve: { description: 'Approve grades' },
    grades_publish: { description: 'Publish approved grades' },
    distribution_view: { description: 'View distributions' },
    distribution_create: { description: 'Create draft distribution' },
    distribution_generate: { description: 'Run suggested distribution' },
    distribution_update: { description: 'Manual adjustment' },
    distribution_validate: { description: 'Validate capacity/conflicts' },
    distribution_approve: { description: 'Approve distribution' },
    distribution_publish: { description: 'Publish immutable version' },
    attendance_view: { description: 'View attendance within scope' },
    attendance_record: { description: 'Record attendance' },
    attendance_excuse: { description: 'Submit/review excuses' },
    assessment_view: { description: 'View evaluations' },
    assessment_create: { description: 'Create evaluation' },
    assessment_submit: { description: 'Submit completed evaluation' },
    assessment_approve: { description: 'Approve when applicable' },
    courses_view: { description: 'View course data' },
    courses_manage: { description: 'Create/update course data' },
    course_report_manage: { description: 'Create/update report' },
    course_report_approve: { description: 'Approve report' },
    advising_view: { description: 'View advising within scope' },
    advising_manage: { description: 'Create/update advising' },
    advising_export_pdf: { description: 'Generate official advising PDF' },
    quality_manage: { description: 'Manage surveys/KPIs/improvement' },
    quality_view: { description: 'View quality data' },
    kpi_manage: { description: 'Manage KPI definitions/results' },
    performance_view: { description: 'View performance scores' },
    correspondence_view: { description: 'View correspondence in scope' },
    correspondence_create: { description: 'Create incoming/outgoing' },
    correspondence_update: { description: 'Edit before submission' },
    correspondence_submit: { description: 'Submit into workflow' },
    correspondence_forward: { description: 'Forward/assign' },
    correspondence_approve: { description: 'Approve/review correspondence' },
    correspondence_close: { description: 'Close completed correspondence' },
    meetings_manage: { description: 'Create meeting/minutes' },
    meetings_approve_minutes: { description: 'Finalize minutes' },
    tasks_view: { description: 'View assigned/in-scope tasks' },
    tasks_manage: { description: 'Create/update tasks' },
    reports_view: { description: 'View reports' },
    reports_export: { description: 'Export PDF/Excel' },
    users_manage: { description: 'Manage accounts' },
    roles_manage: { description: 'Manage roles/permissions' },
    audit_view: { description: 'View audit log' },
    settings_manage: { description: 'Manage configuration' },
  },
};

export default en;
