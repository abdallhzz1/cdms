# Basic Sciences lecture attendance

## Approved change and isolation — 2026-09-29

The user approved a separate lecture attendance workspace for Basic Sciences, with lecturers who do not receive clinical privileges. This is an extension to the original ten-role clinical constitution, not a clinical supervisor role or an automatic copy of clinical student data.

- Staff authentication is the existing account/session system. New roles: `BASIC_LECTURER` and `BASIC_ATTENDANCE_ADMIN`.
- The lecturer has `basic_attendance.view`, `.record`, `.export`; every section, lecture, QR, correction, audit and export is additionally scoped to `basic_section_lecturers`. Permission alone is never an assignment.
- The basic administrator has these permissions and `.manage`, with access to basic sections only. Neither new role receives clinical/student/grade/distribution/user-management permissions by default.
- `SYS_ADMIN` receives the new module grants additively. Existing role grants and clinical records are not reset. A deliberately multi-role account retains the union of its explicitly assigned permissions. Do not assign a clinical role to a basic-only lecturer.
- Pure basic-role accounts open `/basic-attendance` directly and see only that module and their own profile. Shared/multi-role accounts have a permission-filtered navigation entry.
- Basic courses, sections, students, enrollments, lectures, records, OTP challenges, trusted browsers and audit entries have independent `basic_*` tables. The reason for separate student/course registries is the approved operational isolation: the current clinical cohorts cannot be reclassified or exposed to basic lecturers. No automatic clinical-to-basic synchronization is introduced.
- Initial level choices are years one, two and three. Year and semester are entered per section; no academic year is fabricated or forced to be the clinical current year. These are setup choices, not a claim that official basic course ownership has been supplied.

## Initial setup

1. System administrator opens Users, creates an account with **only Basic Sciences Lecturer**, or explicitly adds that role to an existing account. New-account forms now require selecting roles; they no longer preselect Clinical Supervisor. The basic administrator role cannot create users or grant roles.
2. Assign **Basic Attendance Administrator** to the basic department's roster/section manager, if needed. This role does not require any clinical role.
3. Use the sidebar's Courses screen to add a course, then the Sections screen to choose that course and add its sections, year, semester and assigned basic lecturer accounts. Several lecturers may share a section, but only one unfinished attendance session may exist for it.
4. Use the sidebar's Students screen, select a course then section, and expand the import panel to upload Excel/CSV. Required headers: `university_number`, `name`, `email`; optional `photo_url` (HTTPS). Arabic aliases: `الرقم الجامعي`, `الاسم`, `البريد الجامعي`. The email is the officially registered recipient supplied by the administrator, not one entered by a student. Use a roster of 1–2000 students; check the preview and confirm.
5. Duplicate numbers/emails and an email assigned to another student are rejected. Imports are transactional and additive. Withdrawal affects future lectures only. Email changes revoke outstanding identity challenges and remembered devices.
6. Give students `/lecture-attendance` for pre-verification before a large first lecture. Successful pre-verification **does not record attendance**. Real SMTP sending and inbox delivery must be checked on the old server before using a real class or updating the live server.

No real staff accounts, real rosters or invented courses are seeded by deployment. All automated test people are synthetic and live only in an isolated in-memory database.

## Lecturer and student flow

### Staff workspace update — 2026-09-30

The attendance workspace uses separate, bookmarkable sidebar screens for Courses, Sections, Students, Lectures and Reports. Within each operational screen, choose a course first and then one of its assigned sections; the content opens in that same screen. Courses and Sections setup are restricted to administrators; lecturers may read the student roster for sections assigned to them, while only administrators can import or withdraw students. Functional navigation is in the sidebar only—there are no cross-screen tabs or links inside the workspace. Older section-detail URLs redirect to the corresponding screen with the section selected. This is a presentation change, not a change to permission scope or historical attendance data.

The selected course and section are remembered per signed-in staff member for the browser session, so moving between sidebar screens does not force re-selection. Opening a bookmarked section URL still takes precedence. Course changes clear an incompatible section selection. The Students screen keeps the roster visible and folds import controls until needed.

The Courses screen presents one full-width course catalog with name, code, academic level and section count. Its create form appears only when the administrator selects Add course, rather than occupying a permanent second column. The form stays open with the server error visible if creation fails and closes only after a successful save.

The sidebar orders the workflow as Courses → Sections → Students → Lectures → Reports, hiding setup entries without `basic_attendance.manage`. The lecturer's QR image encodes the currently open site's absolute `/lecture-attendance?qr=…` URL, retaining the signed token even if the API server's URL base differs. A malformed/token-only response is never shown as a QR. On a phone, the ordinary camera should recognize this as a website link; same-device browser/cookie rules still apply.

On the roster screen, download the bilingual-guided `basic-attendance-students-template.xlsx`. Fill only the `Students` sheet with the exact headers `university_number`, `name`, `email`, optional `photo_url`; the second sheet explains accepted values. University numbers must be entered as text, especially if they begin with zero. The template has no example student row, so no fictional student can be imported accidentally. Before confirmation, the browser validates headers, 1–2000 populated rows, number/email format, duplicate identifiers and HTTPS photo links, shows row-specific errors and previews the first five students. Any browser-side error blocks the whole submission. Laravel remains authoritative and validates every row transactionally before writing; a browser preview is not a guarantee that existing-server collisions will pass. The import is additive and does not alter frozen lecture rosters.

- Choose a section and open a lecture with its title, one-check or two-check mode, registration-window minutes and late-after minutes. Defaults 5 and 2 minutes are editable operational defaults, **not an official faculty lateness or absence sanction policy**. No scheduling/geolocation is used.
- Opening a lecture snapshots the active section roster. Later imports/withdrawals do not change that lecture's members.
- The QR is a public site link, signed for this basic lecture, version, phase and 15-second slot. It changes automatically and becomes invalid when expired, closed, finalized or moved to another phase. A three-second rotation grace is enforced server-side.
- The QR is prominent on phones and desktops and has a white large-display mode. Failed refresh/expired codes are hidden rather than presented as valid. The student table remains a table on phones; both check times and the student's status are visible in its compact layout.
- Students use their ordinary phone camera. A remembered browser registers one idempotent scan directly. Another browser/device requires university-number + email OTP again.
- On a first scan, an encrypted preparation ticket captures a **fresh** QR before number entry/email delay. It lasts at most five minutes and never beyond the lecturer's registration window. OTP acceptance still requires the same session version and phase to be open. It is not a general exemption from QR expiry for remembered devices.
- OTP lasts five minutes, has five attempts, and is single-use. It is sent only to the roster email. There is no development OTP bypass. Challenge/device secrets are hashed in the database; audit entries do not store OTPs or raw tokens.
- Remembering for 30 days requires explicit consent with a shared-device warning. Without consent the browser is trusted for two hours. The cookie is HTTP-only, root-path, SameSite=Lax and Secure in production. Browser revocation is available and does not revoke clinical/staff identities.
- Identity success and attendance success are distinct. Closing/changing a phase during OTP can verify the browser but never records an invalid attendance. The student sees a clear message to rescan. Successful registrations do not show a contradictory failure banner.
- The lecturer closes registration; in two-check mode they explicitly open the second check. A student cannot perform the second check without the first. Reopening a permitted phase invalidates old codes and is audited.
- On finalization: no first check → absent; both checks → present; first without required second → incomplete. In one-check mode a first check is sufficient. Lateness is retained separately. No disciplinary absence percentages are invented.
- Corrections require a reason, retain original scan timestamps, preserve old/new status and actor/time in the audit, and are not overwritten by later scans/finalization. Archived sections/historical lectures cannot be redefined into different courses/semesters.
- View lecture history and the semester attendance matrix (seven lecture columns per page). Print the displayed range or export the full section as UTF-8 CSV readable in Excel. CSV strings are formula-escaped.

## Deployment and safety

Migration `2026_09_29_100000_create_basic_lecture_attendance` creates ten independent tables, with short MySQL-safe constraint/index names, and runs the additive `BasicAttendancePermissionSeeder`. Existing clinical tables are not changed. Do not run broad role/permission seeders as part of deploying this module: they can overwrite administrator-customized grants. No `migrate:fresh`, table drops, rollback, `stash` or `reset` is needed.

Before deployment back up database/files and verify the recovery procedure. Update and test the old server first; update the new live server only after verifying staff login, the roster, SMTP OTP delivery, both scan phases, finalization and the exported report. Existing production SMTP/session/HTTPS configuration must be valid. Same browser is required to reuse a remembered identity; an in-app browser and the normal browser may have different cookie stores.

OTP emails currently use the existing synchronous mail transport. Pre-verification is important for large classes; this release is not a SMTP-provider throughput guarantee. Shared campus IP rate limits allow anonymous students independently, while retaining per-student challenge and per-device scan ceilings. Device-level scan rejection remains idempotent rather than creating duplicate attendance records.

Rotating QR/verified email do **not** prove physical presence: a current link can still be relayed, and consent remembers a browser rather than cryptographically proving a particular physical phone. There is intentionally no location check or absolute fraud-prevention claim. No penalties or automated schedule opening are introduced.

## Verification

- 16 dedicated backend feature tests, plus user-role and department-scope regressions (28 tests / 350 assertions at focused run), including the real same-origin encrypted-cookie middleware round trip.
- Synthetic 353-student roster import and lecture snapshot; final-state calculation, duplicate protection, frozen roster, scope denial on every endpoint family, manual corrections/audit, expired/tampered/wrong-phase QR, OTP delay and attempt limits, mail failure, device expiry/revocation, email-change invalidation, section assignment/account separation, history guard, report paging and CSV.
- The frontend test suite covers isolated navigation, root redirect, explicit basic-only user creation, one-shot remembered first/second checks, OTP preparation/consent, no duplicate auto-scan, no false pre-verification attendance, and required correction reason. Re-run it after every frontend change.
- Local Chrome visual checks with mocked APIs at 390px phone and 1440px desktop: no document-level horizontal overflow or JavaScript errors; QR display width 340px / 420px. This is visual QA, not a live-server end-to-end or concurrent-load benchmark.
- Full backend suite: 505 tests; the same pre-existing 15 failures and one error remain outside this module (including absent local PDF/Excel dependencies and an uninitialized old QR schema test). The new module's tests pass. Do not report the full backend suite as green.

Server commands use `migrate --force`, targeted cache commands (not the previously failing view cache), and queue restart. The new server's Git checkout is `/home/alfajrhe/repositories/cdms`; its public frontend lives at `/home/alfajrhe/cdms.alfajrhealth.com`, so copy only built frontend assets and explicit root entry files, never private backend files or environment files.
