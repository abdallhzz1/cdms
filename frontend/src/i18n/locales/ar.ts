import type en from './en';

/**
 * Arabic translation dictionary. Structurally identical to `en.ts` — the
 * `TranslationDictionary` type (see `../types.ts`) enforces this at compile
 * time so a key can never exist in one language and not the other.
 *
 * `roles.*` and `permissions.*` Arabic text is sourced from the approved
 * Clinical_Department_Permission_Matrix_Workflows_v1.xlsx document
 * (`Roles`/`Permissions` sheets) wherever that document supplies it
 * (role names; permission short labels) — not freely invented. Role
 * *descriptions* have no Arabic source column (the sheet's "Purpose"
 * column is English-only), so those are ordinary UI-copy localization,
 * the same category as translating "Loading…" — not a business rule.
 */
const ar: typeof en = {
  common: {
    appName: 'نظام إدارة الدائرة السريرية',
    appShortName: 'CDMS',
    organization: 'جامعة الخليل — كلية الطب',
    loading: 'جارٍ التحميل…',
    retry: 'إعادة المحاولة',
    language: 'اللغة',
  },
  nav: {
    dashboard: 'لوحة التحكم',
  },
  foundation: {
    title: 'الأساس التقني',
    subtitle: 'فحص الأساس التقني — المرحلة الأولى',
    apiStatusHeading: 'حالة واجهة البرمجة الخلفية',
    apiStatusChecking: 'جارٍ التحقق من الاتصال بالخادم…',
    applicationLabel: 'التطبيق',
    databaseLabel: 'قاعدة البيانات',
    statusOk: 'تعمل',
    statusUnreachable: 'غير متاحة',
    apiStatusError: 'تعذّر الوصول إلى واجهة البرمجة الخلفية.',
    apiStatusErrorHint: 'تأكد من تشغيل الخادم الخلفي وصحة قيمة VITE_API_BASE_URL.',
  },
  notFound: {
    title: 'الصفحة غير موجودة',
    body: 'الصفحة التي تبحث عنها غير موجودة.',
    backLink: 'العودة إلى الأساس التقني',
  },
  auth: {
    title: 'تسجيل الدخول',
    subtitle: 'سجّل الدخول باستخدام حساب الدائرة السريرية الخاص بك.',
    emailLabel: 'البريد الإلكتروني',
    passwordLabel: 'كلمة المرور',
    submit: 'تسجيل الدخول',
    submitting: 'جارٍ تسجيل الدخول…',
    invalidCredentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
    unknownError: 'حدث خطأ ما. يرجى المحاولة مرة أخرى.',
    signedInAs: 'مسجَّل الدخول باسم',
    logout: 'تسجيل الخروج',
    loggingOut: 'جارٍ تسجيل الخروج…',
  },
  validation: {
    required: 'هذا الحقل مطلوب.',
    email: 'أدخل بريدًا إلكترونيًا صحيحًا.',
  },
  roles: {
    sys_admin: { name: 'مدير النظام', description: 'الإدارة التقنية للنظام' },
    dean: { name: 'العميد', description: 'قيادة الكلية والاعتمادات النهائية' },
    vice_dean: { name: 'نائب العميد', description: 'المراجعة والاعتمادات الأكاديمية والإدارية' },
    clinical_director: { name: 'مدير الدائرة السريرية', description: 'إدارة الدائرة السريرية واعتماد العمليات' },
    admin_assistant: { name: 'المساعد الإداري', description: 'إدخال البيانات والمراسلات والمستندات والدعم التشغيلي' },
    department_head: { name: 'رئيس القسم', description: 'إدارة طاقم القسم والمشرفين والتقييمات' },
    rta: { name: 'مساعد البحث والتدريس', description: 'الدعم الأكاديمي والبحثي والبيانات المكلَّف بها' },
    clinical_supervisor: { name: 'المشرف السريري', description: 'الإشراف السريري والحضور وتقييم الطلبة' },
    academic_advisor: { name: 'المرشد الأكاديمي', description: 'الإرشاد الأكاديمي ومتابعة الحالات المعرضة للخطر' },
    quality: { name: 'دائرة الجودة', description: 'استبيانات الجودة ومؤشرات الأداء والتقارير والتحسين' },
  },
  permissions: {
    students_view: { description: 'عرض' },
    students_create: { description: 'إضافة' },
    students_update: { description: 'تعديل' },
    students_delete: { description: 'حذف' },
    students_export: { description: 'تصدير' },
    grades_view: { description: 'عرض العلامات' },
    grades_create: { description: 'إدخال العلامات' },
    grades_update: { description: 'تعديل العلامات' },
    grades_lock: { description: 'قفل العلامات' },
    grades_approve: { description: 'اعتماد العلامات' },
    grades_publish: { description: 'نشر العلامات' },
    distribution_view: { description: 'عرض التوزيع' },
    distribution_create: { description: 'إنشاء التوزيع' },
    distribution_generate: { description: 'اقتراح توزيع' },
    distribution_update: { description: 'تعديل التوزيع' },
    distribution_validate: { description: 'فحص التعارضات' },
    distribution_approve: { description: 'اعتماد التوزيع' },
    distribution_publish: { description: 'نشر التوزيع' },
    attendance_view: { description: 'عرض الحضور' },
    attendance_record: { description: 'تسجيل الحضور' },
    attendance_excuse: { description: 'إدارة الأعذار' },
    assessment_view: { description: 'عرض التقييم' },
    assessment_create: { description: 'إنشاء تقييم' },
    assessment_submit: { description: 'إرسال التقييم' },
    assessment_approve: { description: 'اعتماد التقييم' },
    courses_view: { description: 'عرض المساقات' },
    courses_manage: { description: 'إدارة المساقات' },
    course_report_manage: { description: 'إدارة تقرير المساق' },
    course_report_approve: { description: 'اعتماد تقرير المساق' },
    advising_view: { description: 'عرض الإرشاد' },
    advising_manage: { description: 'إدارة الإرشاد' },
    advising_export_pdf: { description: 'طباعة PDF' },
    quality_manage: { description: 'إدارة الجودة' },
    quality_view: { description: 'عرض الجودة' },
    kpi_manage: { description: 'إدارة المؤشرات' },
    performance_view: { description: 'عرض الأداء' },
    correspondence_view: { description: 'عرض المراسلات' },
    correspondence_create: { description: 'إنشاء مراسلة' },
    correspondence_update: { description: 'تعديل المراسلة' },
    correspondence_submit: { description: 'إرسال' },
    correspondence_forward: { description: 'تحويل' },
    correspondence_approve: { description: 'اعتماد' },
    correspondence_close: { description: 'إغلاق' },
    meetings_manage: { description: 'إدارة الاجتماعات' },
    meetings_approve_minutes: { description: 'اعتماد المحضر' },
    tasks_view: { description: 'عرض المهام' },
    tasks_manage: { description: 'إدارة المهام' },
    reports_view: { description: 'عرض التقارير' },
    reports_export: { description: 'تصدير التقارير' },
    users_manage: { description: 'إدارة المستخدمين' },
    roles_manage: { description: 'إدارة الأدوار' },
    audit_view: { description: 'عرض التدقيق' },
    settings_manage: { description: 'إعدادات النظام' },
  },
};

export default ar;
