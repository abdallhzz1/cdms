/**
 * English translation dictionary. Keys are namespaced as
 * `<area>.<key>` (e.g. `common.appName`) — see PROJECT_RULES.md A 7:
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

  calendar: {
    title: 'Academic Calendar',
    description: 'Manage academic semesters and important dates.',
    create: 'Add Semester',
  },
  quality: {
    title: 'Quality Surveys',
    description: 'Manage evaluation surveys and continuous improvement plans.',
    create: 'Create Survey',
    improvementPlans: 'Improvement Plans',
    questions: 'Questions',
    targetGroup: 'Target Group',
    surveyTitle: 'Survey Title',
    code: 'Code',

    save: 'Save Survey',
    purpose: 'Purpose',
    frequency: 'Frequency',
    responsible: 'Responsible',
    mandatory: 'Mandatory',
    noSurveys: 'No surveys recorded.',

  },
  meetings: {
    title: 'Meetings',
    description: 'Manage and document clinical and academic meeting minutes.',
    create: 'Record New Meeting',
    actions: 'Actions',
    date: 'Meeting Date',
    type: 'Meeting Type',
    minutes: 'Minutes ID',
  },
  assessments: {
    title: 'Clinical Assessments',
    description: 'Forms and records for evaluating student performance in clinical training.',
    create: 'Create Assessment',
    noAssessments: 'No assessments recorded currently.',
  },
  attendance: {
    title: 'Attendance',
    description: 'Student attendance records in hospitals and clinical rounds.',
    createSession: 'Record Attendance Session',
    site: 'Training Site',
    session: 'Session Type',
    date: 'Date',
  },

    supervisorPortal: {
      title: 'Supervisor Portal',
      description: 'Manage your assigned students for the current rotation block.',
      current: 'Current Block',
      noProfile: 'Supervisor Profile Not Found',
      noProfileHint: 'Your account is not linked to a clinical supervisor profile. Please contact administration.',
      loading: 'Loading portal...',
      loadError: 'Error loading portal',
      none: 'No Students',
      noneHint: 'No students are assigned to you for the current block.',
      assignedCount: 'assigned student(s)'
    },
  state: {
    empty: {
      title: 'No Data',
      message: 'No data was found at this time.'
    },
    error: {
      title: 'Error Occurred',
      message: 'Failed to load data, please try again later.'
    },
    not_found: {
      title: 'Not Found',
      message: 'The requested item could not be found.'
    },
    forbidden: {
      title: 'Access Denied',
      message: 'You do not have permission to view this page.'
    },
  },
  common: {
    appName: 'Clinical Department Management System',
    appShortName: 'CDMS',
    organization: 'Hebron University — Faculty of Medicine',
    loading: 'Loading...',
    retry: 'Retry',
    language: 'Language',
  },
  nav: {
    dashboard: 'Dashboard',
    study_plans: 'Study Plans',
    grades: 'Grades',
    inbox: 'Inbox',
    outbox: 'Outbox',
    tasks: 'Tasks',
    meetings: 'Meetings',
    reports: 'Reports',
    directory: 'Directory',
    section: {
      academic: 'Academic',
      reports: 'Reports',
    },
  },
  studyPlans: {
    title: 'Study Plans',
    description: 'Manage study plans and course offerings',
    newPlan: 'New Plan',
    searchPlaceholder: 'Search by code or name...',
    active: 'Active',
    coursesIncluded: 'courses',
  },
  correspondence: {
    inbox: 'Inbox',
    outbox: 'Outbox',
    new: 'New Request',
    approve: 'Approve',
    forward: 'Forward',
    return: 'Return',
  },
  grades: {
    title: 'Grades',
    description: 'Manage course grades',
  },
  directory: {
    title: 'Directory',
    description: 'System directory',
  },
  foundation: {
    title: 'Foundation',
    subtitle: 'Technical foundation check — Phase 1',
    apiStatusHeading: 'Backend API status',
    apiStatusChecking: 'Checking backend connection...',
    applicationLabel: 'Application',
    databaseLabel: 'Database',
    statusOk: 'OK',
    statusUnreachable: 'Unreachable',
    apiStatusError: 'Could not connect to the backend API.',
    apiStatusErrorHint: 'Ensure the backend server is running and VITE_API_BASE_URL is correct.',
  },
  notFound: {
    title: 'Page not found',
    body: 'The page you are looking for does not exist.',
    backLink: 'Return to Foundation',
  },
  auth: {
    title: 'Sign in',
    subtitle: 'Sign in with your clinical university account.',
    emailLabel: 'Email address',
    passwordLabel: 'Password',
    submit: 'Sign in',
    submitting: 'Signing in...',
    invalidCredentials: 'Email or password is incorrect.',
    unknownError: 'An unexpected error occurred. Please try again.',
    signedInAs: 'Signed in as',
    logout: 'Log out',
    loggingOut: 'Logging out...',
  },
  validation: {
    required: 'This field is required.',
    email: 'Enter a valid email address.',
  },
  roles: {
    sys_admin: { name: 'System Admin', description: 'System technical administration' },
    dean: { name: 'Dean', description: 'Faculty leadership and final approvals' },
    vice_dean: { name: 'Vice Dean', description: 'Academic and administrative oversight' },
    clinical_director: { name: 'Clinical Director', description: 'Clinical department management' },
    admin_assistant: { name: 'Administrative Assistant', description: 'Data and schedule management' },
    department_head: { name: 'Department Head', description: 'Department and physician management' },
    rta: { name: 'RTA', description: 'Academic and data support' },
    clinical_supervisor: { name: 'Clinical Supervisor', description: 'Student supervision' },
    academic_advisor: { name: 'Academic Advisor', description: 'Academic guidance' },
    quality: { name: 'Quality Department', description: 'Surveys and quality assurance' },
  },
  permissions: {
    students_view: { description: 'View' },
    students_create: { description: 'Create' },
    students_update: { description: 'Update' },
    students_delete: { description: 'Delete' },
    students_export: { description: 'Export' },
    grades_view: { description: 'View grades' },
    grades_create: { description: 'Enter grades' },
    grades_update: { description: 'Update grades' },
    grades_lock: { description: 'Lock grades' },
    grades_approve: { description: 'Approve grades' },
    grades_publish: { description: 'Publish grades' },
    distribution_view: { description: 'View distribution' },
    distribution_create: { description: 'Create distribution' },
    distribution_generate: { description: 'Auto-generate' },
    distribution_update: { description: 'Update distribution' },
    distribution_validate: { description: 'Check conflicts' },
    distribution_approve: { description: 'Approve distribution' },
    distribution_publish: { description: 'Publish distribution' },
    attendance_view: { description: 'View attendance' },
    attendance_record: { description: 'Record attendance' },
    attendance_excuse: { description: 'Manage excuses' },
    assessment_view: { description: 'View assessment' },
    assessment_create: { description: 'Create assessment' },
    assessment_submit: { description: 'Submit assessment' },
    assessment_approve: { description: 'Approve assessment' },
    courses_view: { description: 'View courses' },
    courses_manage: { description: 'Manage courses' },
    course_report_manage: { description: 'Manage course reports' },
    course_report_approve: { description: 'Approve course reports' },
    advising_view: { description: 'View advising' },
    advising_manage: { description: 'Manage advising' },
    advising_export_pdf: { description: 'Export PDF' },
    quality_manage: { description: 'Manage quality' },
    quality_view: { description: 'View quality' },
    kpi_manage: { description: 'Manage KPIs' },
    performance_view: { description: 'View performance' },
    correspondence_view: { description: 'View correspondence' },
    correspondence_create: { description: 'Create correspondence' },
    correspondence_update: { description: 'Update correspondence' },
    correspondence_submit: { description: 'Submit' },
    correspondence_forward: { description: 'Forward' },
    correspondence_approve: { description: 'Approve' },
    correspondence_close: { description: 'Close' },
    meetings_manage: { description: 'Manage meetings' },
    meetings_approve_minutes: { description: 'Approve minutes' },
    tasks_view: { description: 'View tasks' },
    tasks_manage: { description: 'Manage tasks' },
    reports_view: { description: 'View reports' },
    reports_export: { description: 'Export reports' },
    users_manage: { description: 'Manage users' },
    roles_manage: { description: 'Manage roles' },
    audit_view: { description: 'View audit logs' },
    settings_manage: { description: 'System settings' },
  },
};

export default en;
