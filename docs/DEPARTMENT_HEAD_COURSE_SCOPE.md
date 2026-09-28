# Department-head clinical course ownership

## Source and classification

The additive migration `2026_09_28_100000_create_course_department_table` creates an explicit many-to-many course/department relationship. Classification is taken from `docs/reference/بيانات_الدائرة_السريرية_الشاملة (1).xlsx`, worksheet `16_المساقات_السريرية`, responsible department column H. It is not inferred from a course title, a cohort letter, or the department's old `serves_academic_levels` field.

| Department code | Initial course codes |
| --- | --- |
| DEP-IM | M1460, M1661, M1662, M1687 |
| DEP-GS | M1470, M1673 |
| DEP-PED | M1583, M1688 |
| DEP-OBG | M1582, M1689 |
| DEP-IMS | M1481, M1461, M1462, M1471, N1471, M1563 |
| DEP-SSS | M1574, M1566, M1571, M1572, M1677 |
| DEP-FCM | M1593 |

N1471 is the catalog's renamed counterpart of the workbook's M1471. Only codes and departments that already exist are linked. College-wide courses such as introduction, research and electives, and unknown/custom course codes, remain unassigned for explicit review. Missing department codes are not guessed or automatically created.

Users with global course-management access can review and change the assignment in **Courses → Edit → Responsible departments**. Changes are audited as `course.departments.changed`. A department head cannot reassign course ownership. Existing permission grants are not reseeded or rewritten.

## Access rules

- SYS_ADMIN, DEAN, VICE_DEAN and CLINICAL_DIRECTOR retain their global access even when they also have a department-head or RTA role.
- A head's explicit `user_roles` department scope takes priority. Otherwise a current head assignment, then their linked person's department, is used. No department or no owned courses means no clinical data, not a fallback to all departments.
- Clinical records and their parent rotations/sessions are restricted by the explicit course owner. An assignment's nullable or stale `department_id` is not used as the authority.
- Student-directory membership comes from current published assignments to owned courses, matched to the student's current clinical level. A letter such as A is not hard-coded: changing the published placement changes the visible groups and students.
- Directory year tabs are derived from visible students; empty fourth/sixth tabs disappear. Course, grade, distribution and schedule selectors derive their permitted years from owned courses/rotations.
- The same student may have records in several departments. Visibility of their profile does **not** grant access to their other courses' marks, attendance or assessments.
- List queries, record-detail/write guards, report rows, CSV downloads, dashboard clinical counters, approval decisions/notifications, administrative supervisor assignments and group rosters use the corresponding course/student boundary.
- College-wide cohort import/reassignment, portal-wide switches and shared supervisor-account/hospital changes are not permitted through a head's scoped workflow. Unchanged roster metadata can be echoed by the student profile form without reassigning that roster.
- A head with CLINICAL_SUPERVISOR keeps their independently owned personal supervisor workspace and QR sessions. This does not expand their department-administration scope. Public OTP-based student lookup is unchanged.

Non-clinical modules such as personal correspondence, meetings and tasks retain their existing permission/ownership rules; this change does not invent course relationships for them. Shared facilities and supervisor directory metadata remain shared reference data, while student placements and clinical records are restricted.

## Data safety and rollout

The migration only adds the ownership pivot and inserts known mappings. It does not rewrite student groups, distribution versions, existing grades, attendance, assessments, QR sessions or role permissions. Updating owners intentionally changes which heads can access those courses; the underlying records remain unchanged.

Back up the database and test the old server first, then update the new production server. Run `php artisan migrate --force` before allowing API traffic to the updated code. Do not use `migrate:fresh`, delete historical attendance, run blanket permission seeders, or reset/stash server-local changes.

The new server repository is `/home/alfajrhe/repositories/cdms`; the public directory `/home/alfajrhe/cdms.alfajrhealth.com` is **not** its Git checkout. Publish only built assets and the public entry files. Never copy the private backend or `.env` into the public directory.

## Verification

`tests/Feature/DepartmentHeadCourseScopeTest.php` uses an isolated SQLite test database. It covers known-code backfill without changes to existing records, same-level departments, the same student's other courses, missing department assignment, multiple roles/global precedence, ownership edit restrictions/auditing, populated directory years, mixed subgroup roster counts, scoped report/CSV rows, and independent personal supervisor access.

Frontend ownership tests cover hidden empty directory cohorts, an explicit empty scope, and editable global versus read-only head ownership. Arabic browser previews were checked at 390px and 1440px without page overflow or JavaScript errors. The enlarged course form now scrolls internally so its title remains reachable on a phone.

The frontend suite passed 101 tests. Focused backend scope and related regression tests passed. The full backend run was **not clean**: 15 failures and one error also occurred against the previously committed classes in this environment (including unavailable PDF/Excel facades, SQLite decimal-format assertions, query-count checks and existing QR/remembered-browser fixtures). They must not be represented as successful production verification. No live server/database has been altered by these local tests.
