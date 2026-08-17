# Phase 3A — Data Analysis Document
# Clinical Department Management System — Hebron University Faculty of Medicine

**Date:** 2026-08-14  
**Analyst:** Phase 3A Implementation  
**Source:** `docs/reference/بيانات_الدائرة_السريرية_الشاملة (1).xlsx` — 46 worksheets  

---

## 1. Relevant Worksheets Used by Phase 3A

| Sheet # | Arabic Name | English Translation | Phase 3A Use |
|---|---|---|---|
| 1 | 00_الفهرس | Index | Reference only |
| 2 | 01_الطلاب | Master Student List (all years) | **Primary student entity** |
| 3 | 02_طلاب_السنة_الرابعة | Year 4 Students | Filtered sub-view of sheet 2 — NOT a separate entity |
| 4 | 03_طلاب_السنة_الخامسة | Year 5 Students | Filtered sub-view of sheet 2 — NOT a separate entity |
| 5 | 04_طلاب_السنة_السادسة | Year 6 Students | Filtered sub-view of sheet 2 — NOT a separate entity |
| 6 | 05_الدفعات_والمجموعات | Batches & Groups | **Group structure + cohorts** |
| 7 | 06_الطلبة_المتعثرون | At-Risk Students | Status field foundation |
| 8 | 07_تكليفات_الطلاب_بالمجموعات | Student Group Assignments | **Student ↔ group membership** |
| 9 | 08_الطاقم_والمشرفون | Staff & Clinical Supervisors | **People/staff foundation** |
| 14 | 13_الأقسام | Departments | **Department entity** |
| 15 | 14_مواقع_التدريب_وطاقتها | Training Sites & Capacity | **Training site entity** |
| 16 | 15_الاتفاقيات_والشراكات | Agreements & Partnerships | **Partnership entity** |
| 44 | 43_التقويم_الأكاديمي | Academic Calendar | Calendar events foundation |
| 45 | 44_السنوات_الأكاديمية | Academic Years | **Academic year entity** |

**Sheets NOT used in Phase 3A (future phases):**
- Sheets 10–13: Staff activity logs, assignments history, supervision load, availability → Phase 3B/4
- Sheets 17–43: Courses, ILOs, PLOs, plans, rotations, distribution, sessions, attendance, grades, assessment, advising, quality, correspondence, meetings, calendar events, annual report → future phases

---

## 2. Important Fields From Each Worksheet

### Sheet 2: Master Student List (01_الطلاب)
All 27 columns identical across sheets 2, 3, 4, 5:

| Column (Arabic) | English | DB Mapping |
|---|---|---|
| الرقم الجامعي | University number | `university_number` UNIQUE |
| الاسم الرباعي (عربي) | Full name Arabic | `full_name_ar` |
| الاسم (إنجليزي) | Full name English | `full_name_en` nullable |
| رقم الهوية | National ID | `national_id` nullable |
| الجنس | Gender | `gender` enum: `male`/`female` |
| تاريخ الميلاد | Date of birth | `date_of_birth` date nullable |
| المدينة/مكان السكن | City / residence | `city` nullable |
| هاتف الطالب | Student phone | `phone` nullable |
| هاتف ولي الأمر | Guardian phone | `guardian_phone` nullable |
| البريد الجامعي | University email | `university_email` nullable unique |
| رابط الصورة | Photo URL | `photo_url` nullable |
| الدفعة (سنة القبول) | Batch / admission year | `batch_year` smallint nullable |
| المستوى الحالي | Current academic level | `academic_level` enum |
| رقم الخطة الدراسية | Study plan number | `study_plan_code` nullable |
| حالة التسجيل | Registration status | `registration_status` enum |
| المعدل التراكمي | GPA / cumulative average | `gpa` decimal(4,2) nullable |
| الساعات المجتازة | Credit hours passed | `credit_hours_passed` smallint nullable |
| عدد الإنذارات | Warning count | `warning_count` tinyint default 0 |
| تاريخ آخر إنذار | Last warning date | `last_warning_date` date nullable |
| المرشد الأكاديمي | Academic advisor (text) | → resolved via people/assignments |
| المجموعة الرئيسية | Main group | → resolved via group assignments |
| المجموعة الفرعية | Sub-group | → resolved via group assignments |
| حالة الرسوم السريرية | Clinical fees status | `clinical_fees_status` enum |
| اشتراك Amboss | Amboss subscription | `has_amboss_subscription` boolean default false |
| حالة خاصة (معيد/مؤجل/منقول) | Special status | incorporated in `registration_status` |
| ملاحظات | Notes | `notes` text nullable |
| مصدر البيانات | Data source | `data_source` varchar nullable |

### Sheet 6: Batches & Groups (05_الدفعات_والمجموعات)
| Column | DB Mapping |
|---|---|
| السنة الأكاديمية | `academic_year_id` FK |
| المستوى | `academic_level` enum |
| الدفعة | `batch_label` (derived from year) |
| عدد الطلاب | computed, not stored |
| أسماء المجموعات الرئيسية | `name` in `student_groups` (one row per group letter) |
| عدد المجموعات الفرعية | computed from `student_subgroups` count |
| الحد الأدنى/الأعلى لحجم المجموعة | `min_size`/`max_size` on `student_subgroups` |
| مسؤول التوزيع | `distribution_manager` text on `student_groups` |
| تاريخ اعتماد التوزيع | `approved_at` on `student_groups` |

**Group naming pattern observed:**
- Year 4: G, N (each with G1-G5, N1-N5 sub-groups)
- Year 5: A, B, C (each with A1-A8, B1-B8, C1-C8)
- Year 6: Q, R, S (each with Q1-Q8, R1-R8, S1-S8)

### Sheet 8: Student Group Assignments (07_تكليفات_الطلاب_بالمجموعات)
| Column | DB Mapping |
|---|---|
| رقم التكليف | `assignment_code` UNIQUE (SGA-0001) |
| السنة الأكاديمية | `academic_year_id` FK |
| الرقم الجامعي | `student_id` FK |
| المستوى | denormalized (derived from student) |
| الروتيشن | `rotation` text nullable (future phase FK) |
| المجموعة الرئيسية | `student_group_id` FK |
| المجموعة الفرعية | `student_subgroup_id` FK |
| ساري من | `valid_from` date nullable |
| ساري حتى | `valid_until` date nullable |
| سبب التغيير | `change_reason` text nullable |
| اعتمد بواسطة | `approved_by` text nullable |
| ملاحظات | `notes` text nullable |

### Sheet 9: Staff & Clinical Supervisors (08_الطاقم_والمشرفون)
| Column | DB Mapping |
|---|---|
| كود الطبيب | `staff_code` UNIQUE (DR-000) |
| الاسم الكامل | `full_name_ar` |
| الاسم (إنجليزي) | `full_name_en` nullable |
| الصفة | `title` (text — مشرف سريري / رئيس قسم…) |
| القسم التابع له | `department_id` FK |
| المستشفى الأساسي | `primary_site_id` FK to `training_sites` nullable |
| التخصص الدقيق | `specialty` nullable |
| الدرجة العلمية | `academic_degree` nullable |
| رقم النقابة/الترخيص | `license_number` nullable |
| نوع التعاقد | `contract_type` enum nullable |
| تاريخ بداية العقد | `contract_start` date nullable |
| تاريخ نهاية العقد | `contract_end` date nullable |
| العبء التدريسي | `teaching_hours_per_week` tinyint nullable |
| أيام التدريب المتاحة | `available_days` text nullable |
| الحد الأقصى للطلاب | `max_students` tinyint nullable |
| الهاتف | `phone` nullable |
| البريد الإلكتروني | `email` nullable |
| رابط الصورة | `photo_url` nullable |
| رابط السيرة الذاتية | `cv_url` nullable |
| يشرف على أي مساقات | future — not stored in Phase 3A |
| ملاحظات | `notes` nullable |

### Sheet 14: Departments (13_الأقسام)
| Column | DB Mapping |
|---|---|
| كود القسم | `code` UNIQUE (DEP-IM) |
| اسم القسم (عربي) | `name_ar` |
| اسم القسم (إنجليزي) | `name_en` |
| النوع | `dept_type` enum: `primary`/`sub` |
| رئيس القسم | → `department_head_assignments` (person) |
| مساعد البحث والتدريس | → `department_head_assignments` role_type=`rta` |
| السنوات التي يخدمها | `serves_academic_levels` JSON array |
| ملاحظات | `notes` nullable |

**7 departments identified from workbook:**

| Code | Arabic Name | English Name | Type |
|---|---|---|---|
| DEP-IM | الطب الباطني | Internal Medicine | primary |
| DEP-GS | الجراحة العامة | General Surgery | primary |
| DEP-PED | طب الأطفال | Pediatrics | primary |
| DEP-OBG | النساء والتوليد | Obstetrics & Gynecology | primary |
| DEP-SSS | التخصصات الجراحية الفرعية | Surgical Subspecialties | sub |
| DEP-IMS | التخصصات الباطنية الفرعية | Internal Medicine Subspecialties | sub |
| DEP-FCM | طب الأسرة والمجتمع | Family & Community Medicine | sub |

### Sheet 15: Training Sites (14_مواقع_التدريب_وطاقتها)
28 columns — key ones:

| Column | DB Mapping |
|---|---|
| كود الموقع | `site_code` UNIQUE (H-01) |
| اسم الموقع (عربي) | `name_ar` |
| اسم الموقع (إنجليزي) | `name_en` |
| النوع | `site_type` enum: `hospital_public`/`hospital_private`/`medical_center`/`clinic`/`lab`/`other` |
| المدينة | `city` |
| العنوان التفصيلي | `address` nullable |
| خط العرض / خط الطول | `latitude`/`longitude` decimal nullable |
| المسافة عن الجامعة | `distance_km` decimal nullable |
| مسؤول التنسيق | `coordinator_name` nullable |
| هاتف التنسيق | `coordinator_phone` nullable |
| البريد | `coordinator_email` nullable |
| حالة الاتفاقية | `agreement_status` enum nullable |
| تاريخ بداية/نهاية الاتفاقية | `agreement_start`/`agreement_end` date nullable |
| تتوفر مواصلات جامعية | `has_university_transport` boolean |
| القسم السريري | `department_id` FK nullable |
| عدد الأسرة | `bed_count` int nullable |
| الحد الأقصى للطلاب في الفترة الواحدة | `max_students_per_period` int nullable |
| الحد الأقصى للطلاب مع الطبيب الواحد | `max_students_per_doctor` tinyint nullable |
| أيام التدريب | `training_days` nullable |
| يقبل مناوبات ليلية | `accepts_night_shifts` boolean |
| يقبل طالبات (قيود) | `female_student_restrictions` nullable |

### Sheet 16: Partnerships (15_الاتفاقيات_والشراكات)
| Column | DB Mapping |
|---|---|
| الجهة | `institution_name` |
| النوع/الغرض | `partnership_type` / `purpose` |
| محلي/دولي | `scope` enum: `local`/`international` |
| تاريخ البداية | `start_date` date nullable |
| تاريخ النهاية | `end_date` date nullable |
| ملاحظات | `notes` nullable |
| مصدر البيانات | `data_source` nullable |

### Sheet 45: Academic Years (44_السنوات_الأكاديمية)
| Column | DB Mapping |
|---|---|
| كود السنة الأكاديمية | `code` UNIQUE (2026/2027) |
| تاريخ البداية/النهاية | `start_date`/`end_date` |
| بداية/نهاية الفصل الأول | `semester1_start`/`semester1_end` |
| بداية/نهاية الفصل الثاني | `semester2_start`/`semester2_end` |
| بداية/نهاية الصيفي | `summer_start`/`summer_end` nullable |
| السنة الحالية؟ | `is_current` boolean |
| الحالة | `status` enum: `active`/`closed`/`planned` |
| ملاحظات | `notes` nullable |

---

## 3. Identified Entities (Phase 3A)

1. **AcademicYear** — academic year metadata and semester dates
2. **Department** — 7 clinical departments with code, bilingual names, type
3. **Person** — unified staff table (supervisors, heads, advisors, RTAs)
4. **DepartmentHeadAssignment** — person→dept with role_type (head/rta) and date range
5. **StudentGroup** — main group per academic_year+level (e.g. Group A, Year 5, 2026/2027)
6. **StudentSubgroup** — sub-group within a main group (e.g. A1, A2…A8)
7. **Student** — unified student record across all academic levels
8. **StudentGroupAssignment** — time-bound student↔subgroup membership
9. **TrainingSite** — clinical training locations (hospitals, centers, clinics)
10. **Partnership** — institutional agreements/partnerships

---

## 4. Relationships Between Entities

```
AcademicYear
    ├── hasMany Students (via academic_year_id on students — current enrollment year)
    ├── hasMany StudentGroups (via academic_year_id)
    └── hasMany StudentGroupAssignments

Department
    ├── hasMany People (people.department_id)
    ├── hasMany DepartmentHeadAssignments (head + rta roles)
    └── hasMany TrainingSites (sites.department_id)

Person
    ├── belongsTo Department
    ├── hasMany DepartmentHeadAssignments (as head or rta)
    ├── hasOne User (nullable — only if system access required)
    └── hasMany Students (as academic_advisor — via students.academic_advisor_id)

Student
    ├── belongsTo AcademicYear (current enrollment)
    ├── belongsTo Person (academic_advisor_id) nullable
    └── hasMany StudentGroupAssignments

StudentGroup
    ├── belongsTo AcademicYear
    ├── hasMany StudentSubgroups
    └── hasMany StudentGroupAssignments

StudentSubgroup
    ├── belongsTo StudentGroup
    └── hasMany StudentGroupAssignments

StudentGroupAssignment
    ├── belongsTo Student
    ├── belongsTo StudentGroup
    └── belongsTo StudentSubgroup

TrainingSite
    └── belongsTo Department (nullable — primary clinical department)

Partnership
    (standalone — no FK to other Phase 3A entities; links to institutions by name)
```

---

## 5. Fields That Should NOT Become Duplicate Database Columns

| Workbook Column | Resolution |
|---|---|
| المستوى (in sheet 8 assignments) | Derived from `students.academic_level` — not duplicated |
| المجموعة الرئيسية/الفرعية (in students sheet) | → resolved via `student_group_assignments` — not columns on `students` |
| المرشد الأكاديمي (text in students sheet) | → FK `academic_advisor_id` to `people` table |
| رئيس القسم / مساعد البحث (in departments sheet) | → `department_head_assignments` table with `role_type` |
| Department name (repeated in staff sheet) | → FK `department_id` to `departments` |
| Hospital name (repeated in staff sheet) | → FK `primary_site_id` to `training_sites` |
| Year-specific student lists (sheets 3/4/5) | → filter on `students.academic_level` |

---

## 6. Lookup / Reference Data

These are enum columns (not separate lookup tables) because they are small, stable, and application-controlled:

| Field | Values |
|---|---|
| `students.academic_level` | `fourth`, `fifth`, `sixth` |
| `students.registration_status` | `active`, `suspended`, `on_leave`, `transferred`, `graduated`, `repeating`, `deferred` |
| `students.gender` | `male`, `female` |
| `students.clinical_fees_status` | `paid`, `pending`, `exempt`, `unknown` |
| `departments.dept_type` | `primary`, `sub` |
| `people.contract_type` | `full_time`, `part_time`, `visiting`, `honorary` |
| `training_sites.site_type` | `hospital_public`, `hospital_private`, `medical_center`, `clinic`, `lab`, `other` |
| `training_sites.agreement_status` | `active`, `expired`, `pending`, `none` |
| `partnerships.scope` | `local`, `international` |
| `academic_years.status` | `active`, `closed`, `planned` |
| `department_head_assignments.role_type` | `head`, `rta` |

---

## 7. Ambiguities Requiring Future Decisions

| # | Ambiguity | Current Resolution |
|---|---|---|
| 1 | Department head names in sheet 14 are plain text — no DR-codes | Phase 3A creates people records for known heads from seed data; text names in notes |
| 2 | Academic cohort (دفعة) vs academic year — most student rows are blank for batch | Store `batch_year` as nullable integer; infer from university_number prefix when possible in import |
| 3 | Historical academic level changes — no history table in workbook | Documented ambiguity; no history table in Phase 3A; `academic_year_id` is the current enrollment year |
| 4 | Group letter naming is year/cohort-specific (not globally unique) | Groups scoped by `academic_year_id` + `academic_level` — composite unique constraint |
| 5 | `amboss_subscription` field — boolean or expiry date | Stored as `has_amboss_subscription` boolean for now |
| 6 | Training site `agreement_status` — most rows are blank (0) | Stored as nullable enum; blank = `null` (no agreement data on file) |
| 7 | Partnership `institution_name` overlaps with training site names (e.g. Al-Ahli Hospital) | These are separate concepts: sites = operational training locations; partnerships = formal institutional agreements. Both kept as separate tables. A future phase may add a FK linking them. |
| 8 | Staff member `يشرف على أي مساقات` (supervises courses) column in sheet 9 | Not stored in Phase 3A; belongs to the Courses/Rotations module (future phase) |
| 9 | RTA column in departments — shared table with dept heads or separate? | Resolved: `department_head_assignments.role_type = 'rta'` |
| 10 | Student group assignment `rotation` column is blank in all observed rows | `rotation` stored as nullable text in Phase 3A; will become FK to rotations table in later phase |

---

## 8. Proposed Database Mapping

### Table: `academic_years`
```
id, code (UNIQUE e.g. "2026/2027"), start_date, end_date,
semester1_start, semester1_end, semester2_start, semester2_end,
summer_start (nullable), summer_end (nullable),
is_current (boolean), status (enum), notes, created_at, updated_at
```
Index: `is_current`, `status`

### Table: `departments`
```
id, code (UNIQUE e.g. "DEP-IM"), name_ar, name_en,
dept_type (enum: primary/sub), serves_academic_levels (JSON),
is_active (boolean default true), notes, created_at, updated_at
```
Index: `code`, `is_active`

### Table: `people`
```
id, staff_code (UNIQUE e.g. "DR-000", nullable),
full_name_ar, full_name_en (nullable), email (nullable),
phone (nullable), department_id (FK nullable),
primary_site_id (FK to training_sites nullable),
specialty (nullable), academic_degree (nullable),
license_number (nullable), contract_type (enum nullable),
contract_start (date nullable), contract_end (date nullable),
teaching_hours_per_week (tinyint nullable),
available_days (nullable), max_students (tinyint nullable),
photo_url (nullable), cv_url (nullable),
is_active (boolean default true),
user_id (FK to users nullable UNIQUE),
notes, created_at, updated_at
```
Index: `staff_code`, `department_id`, `is_active`, `user_id`

### Table: `department_head_assignments`
```
id, person_id (FK), department_id (FK),
role_type (enum: head/rta),
started_at (date nullable), ended_at (date nullable),
is_current (boolean default true),
notes, created_at, updated_at
```
Index: `department_id`, `person_id`, `is_current`, (`department_id`, `role_type`, `is_current`)

### Table: `student_groups`
```
id, academic_year_id (FK), academic_level (enum),
name (e.g. "A", "B", "G"),
distribution_manager (text nullable),
approved_at (date nullable),
notes, created_at, updated_at
UNIQUE (academic_year_id, academic_level, name)
```

### Table: `student_subgroups`
```
id, student_group_id (FK),
name (e.g. "A1", "A2"),
min_size (tinyint nullable), max_size (tinyint nullable),
is_active (boolean default true),
created_at, updated_at
UNIQUE (student_group_id, name)
```

### Table: `students`
```
id, university_number (UNIQUE), full_name_ar, full_name_en (nullable),
national_id (nullable), gender (enum nullable),
date_of_birth (date nullable), city (nullable),
phone (nullable), guardian_phone (nullable),
university_email (nullable UNIQUE), photo_url (nullable),
batch_year (smallint nullable), academic_level (enum),
academic_year_id (FK nullable — current enrollment year),
study_plan_code (nullable), registration_status (enum),
gpa (decimal 4,2 nullable), credit_hours_passed (smallint nullable),
warning_count (tinyint default 0), last_warning_date (date nullable),
academic_advisor_id (FK to people nullable),
clinical_fees_status (enum default unknown),
has_amboss_subscription (boolean default false),
notes (text nullable), data_source (nullable),
created_at, updated_at
```
Index: `university_number`, `academic_level`, `academic_year_id`, `registration_status`, `academic_advisor_id`

### Table: `student_group_assignments`
```
id, assignment_code (UNIQUE e.g. "SGA-0001"),
student_id (FK), academic_year_id (FK),
student_group_id (FK), student_subgroup_id (FK nullable),
valid_from (date nullable), valid_until (date nullable),
change_reason (text nullable),
approved_by (text nullable),
notes (text nullable),
data_source (nullable),
created_at, updated_at
```
Index: `student_id`, `academic_year_id`, `student_group_id`, `student_subgroup_id`

### Table: `training_sites`
```
id, site_code (UNIQUE e.g. "H-01"), name_ar, name_en,
site_type (enum), city (nullable), address (nullable),
latitude (decimal 10,7 nullable), longitude (decimal 10,7 nullable),
distance_km (decimal 5,2 nullable),
coordinator_name (nullable), coordinator_phone (nullable),
coordinator_email (nullable),
agreement_status (enum nullable),
agreement_start (date nullable), agreement_end (date nullable),
has_university_transport (boolean default false),
department_id (FK nullable), bed_count (int nullable),
max_students_per_period (int nullable),
max_students_per_doctor (tinyint nullable),
training_days (nullable),
accepts_night_shifts (boolean default false),
female_student_restrictions (nullable),
is_active (boolean default true),
notes (text nullable), created_at, updated_at
```
Index: `site_code`, `site_type`, `department_id`, `is_active`

### Table: `partnerships`
```
id, institution_name, partnership_type (nullable),
purpose (text nullable),
scope (enum: local/international),
start_date (date nullable), end_date (date nullable),
is_active (boolean default true),
notes (text nullable), data_source (nullable),
created_at, updated_at
```
Index: `scope`, `is_active`

---

## 9. Migration Naming Strategy

Phase 3A migrations use prefix `2026_08_14_30XXXX_` to clearly distinguish from Phase 1/2 (`2026_08_13_1000XX_`). Migrations are ordered by FK dependency.

---

*Document produced during Phase 3A pre-implementation analysis. Not to be modified without a recorded decision.*
