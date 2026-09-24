# Clinical QR Attendance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure supervisor-controlled QR check-in/check-out workflow that identifies students without full accounts and writes finalized results into the existing clinical attendance record system.

**Architecture:** Add a dedicated QR session aggregate beside the existing `clinical_sessions`/`attendance_records`, with an immutable roster snapshot, append-only scan/audit events, signed 15-second QR payloads, and a transactional finalizer that maps the snapshot into current attendance records. Reuse the current student schedule OTP/trusted-device identity through a small shared resolver, expose separate authenticated supervisor and public student APIs, then add a focused supervisor workspace and camera-only public scanner.

**Tech Stack:** Laravel 12/PHP 8.3, Eloquent/MySQL with SQLite feature tests, React 19/TypeScript, TanStack Query, Tailwind CSS, Vitest/Testing Library, `qrcode` for display, `@zxing/browser` for live-camera decoding.

**Spec:** `docs/superpowers/specs/2026-09-24-clinical-qr-attendance-design.md`

## Global Constraints

- No GPS/geofencing, no automatic opening from the schedule, no offline attendance queue, and no student user accounts.
- The supervisor explicitly performs the four operational actions: open check-in, close check-in, open check-out, finalize.
- QR payloads rotate every 15 seconds, permit at most 5 seconds expiry grace, contain no student data, and are accepted only by the system scanner endpoint.
- Student timestamps use server time; raw QR values, OTPs, IP addresses, and trusted-device tokens are never stored.
- The public scanner is live-camera only: no file input, gallery selection, pasted value, or manual code entry.
- `attendance_records` remains the authoritative source for existing reports, warnings, and dashboards.
- A check-in without check-out finalizes as `present` with `is_incomplete = true`; no check-in finalizes as `absent`.
- Every manual correction and every non-forward state transition requires a non-empty reason and an append-only audit record.
- Existing manual attendance, public schedule, warning, supervisor, and review workflows must remain backward compatible.

## Review Focus

- Two supervisors opening the same assignment/date concurrently must produce one session and return the existing one, never duplicate rosters.
- A QR scanned across its 15-second boundary must succeed only within the 5-second grace and only while the encoded phase is still active.
- Repeated delivery of the same successful scan must return its original timestamp without a second state change or duplicate event classified as success.
- Finalization failure midway through roster mapping must roll back both new `attendance_records` and all QR-session final state changes.
- A valid trusted device belonging to a student outside the snapshotted roster must receive a generic rejection without learning group or student details.

---

## File Structure

### Backend additions

- `backend/database/migrations/*_create_clinical_qr_attendance_tables.php`: session, roster, scan-event persistence and constraints.
- `backend/database/migrations/*_add_qr_metadata_to_attendance_records.php`: nullable linkage/timestamps/source/incomplete metadata for existing attendance consumers.
- `backend/app/Models/ClinicalQrAttendanceSession.php`: aggregate state and relationships.
- `backend/app/Models/ClinicalQrAttendanceRoster.php`: per-student scan/final outcome state.
- `backend/app/Models/ClinicalQrScanEvent.php`: append-only attempt/audit model.
- `backend/app/Services/StudentPublicIdentityService.php`: resolve access-token or trusted-browser cookie into one student without schedule-data coupling.
- `backend/app/Services/ClinicalAttendance/QrTokenService.php`: issue and validate signed short-lived payloads.
- `backend/app/Services/ClinicalAttendance/QrAttendanceService.php`: ownership, roster snapshot, state transitions, scans, manual overrides, and atomic finalization.
- `backend/app/Http/Controllers/Api/V1/ClinicalQrAttendanceController.php`: authenticated supervisor/reviewer endpoints.
- `backend/app/Http/Controllers/Api/V1/PublicClinicalQrAttendanceController.php`: minimal public identity/status/scan endpoints.
- `backend/app/Http/Requests/ClinicalAttendance/*.php`: transition, scan, and manual-override validation.
- `backend/config/clinical_attendance.php`: rotation, grace, scanner enablement, and event-retention settings.

### Backend modifications

- `backend/app/Http/Controllers/Api/V1/PublicStudentScheduleController.php`: delegate student resolution to the shared identity service without changing response contracts.
- `backend/app/Models/AttendanceRecord.php`: QR relationships/casts/fillable metadata.
- `backend/app/Models/ClinicalSession.php`: QR-session relationship.
- `backend/app/Providers/AppServiceProvider.php`: public scan/status rate limiters.
- `backend/routes/api.php`: authenticated and public QR routes.
- `backend/database/seeders/PermissionSeeder.php`, `backend/database/seeders/LogicalPermissionSeeder.php`: dedicated finalized-session reopen permission while retaining `attendance.record` for ordinary supervisor operations.
- `backend/app/Http/Controllers/Api/V1/AttendanceRecordController.php`: expose QR timing/source/incomplete fields to reviewers and exports.

### Frontend additions

- `frontend/src/api/clinicalQrAttendance.ts`: typed supervisor and public API client.
- `frontend/src/pages/clinical/SupervisorQrAttendanceWorkspace.tsx`: state-driven QR panel, counters, table, confirmations, corrections.
- `frontend/src/pages/public/PublicClinicalAttendancePage.tsx`: OTP/trusted identity and live camera scanner.
- `frontend/src/components/clinical/LiveQrScanner.tsx`: camera lifecycle and ZXing decoding only.
- `frontend/src/pages/clinical/SupervisorQrAttendanceWorkspace.test.tsx`, `frontend/src/pages/public/PublicClinicalAttendancePage.test.tsx`, `frontend/src/components/clinical/LiveQrScanner.test.tsx`: UI behavior coverage.

### Frontend modifications

- `frontend/src/pages/clinical/SupervisorAttendancePage.tsx`: integrate QR mode without removing manual attendance.
- `frontend/src/pages/clinical/AttendanceMasterPage.tsx`: show source, check-in/out, and incomplete state.
- `frontend/src/App.tsx`: public `/clinical-attendance` route.
- `frontend/package.json`, `frontend/package-lock.json`: live-camera QR decoder dependency.
- `frontend/src/index.css`: responsive light visual states if component utilities are insufficient.

---

### Task 1: Persist the QR attendance aggregate and compatibility metadata

**Files:**
- Create: `backend/database/migrations/2026_09_24_000001_create_clinical_qr_attendance_tables.php`
- Create: `backend/database/migrations/2026_09_24_000002_add_qr_metadata_to_attendance_records.php`
- Create: `backend/app/Models/ClinicalQrAttendanceSession.php`
- Create: `backend/app/Models/ClinicalQrAttendanceRoster.php`
- Create: `backend/app/Models/ClinicalQrScanEvent.php`
- Modify: `backend/app/Models/AttendanceRecord.php`
- Modify: `backend/app/Models/ClinicalSession.php`
- Test: `backend/tests/Feature/ClinicalQrAttendanceSchemaTest.php`

**Interfaces:**
- Produces: session states `check_in_open|check_in_closed|check_out_open|finalized`; roster sources `qr|manual_override`; attendance fields `clinical_qr_attendance_roster_id`, `check_in_at`, `check_out_at`, `recording_source`, `is_incomplete`.

- [ ] **Step 1: Write failing schema/model tests** that migrate the database, create related rows, assert unique `(assignment_key, session_date, active_guard)` and `(clinical_qr_attendance_session_id, student_id)` constraints, assert casts, and prove deleting a QR session does not delete finalized `attendance_records`.

```php
$session = ClinicalQrAttendanceSession::create([
    'assignment_key' => '12|9|3|5', 'rotation_block_id' => $block->id,
    'training_site_id' => $site->id, 'supervisor_id' => $person->id,
    'session_date' => '2026-09-24', 'state' => 'check_in_open',
    'active_guard' => 1, 'version' => 1,
]);
$this->assertSame('2026-09-24', $session->session_date->toDateString());
```

- [ ] **Step 2: Run the focused test and verify failure.**

Run: `cd backend; php artisan test --filter=ClinicalQrAttendanceSchemaTest`

Expected: FAIL because tables/models do not exist.

- [ ] **Step 3: Implement migrations and models.** Use nullable `active_guard` with a unique index on `(assignment_key, session_date, active_guard)`; set it to `1` while active and `null` on finalization so historical finalized rows do not block a later authorized replacement. Add foreign keys, indexes on state/date/student/result, datetime casts, guarded fillable fields, and explicit relationships.

- [ ] **Step 4: Run the focused test and migrations.**

Run: `cd backend; php artisan migrate:fresh --env=testing; php artisan test --filter=ClinicalQrAttendanceSchemaTest`

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/database/migrations backend/app/Models backend/tests/Feature/ClinicalQrAttendanceSchemaTest.php
git commit -m "feat: add clinical qr attendance data model"
```

### Task 2: Extract reusable public student identity resolution

**Files:**
- Create: `backend/app/Services/StudentPublicIdentityService.php`
- Modify: `backend/app/Http/Controllers/Api/V1/PublicStudentScheduleController.php`
- Test: `backend/tests/Feature/PublicStudentIdentityServiceTest.php`
- Test: `backend/tests/Feature/PublicStudentScheduleTest.php`

**Interfaces:**
- Produces: `resolve(Request $request, ?string $accessToken): ?Student`, `trustedDevice(Request $request): ?StudentScheduleTrustedDevice`, `forget(Request $request): Cookie`.
- Consumes: existing `StudentScheduleOtpChallenge`, `StudentScheduleTrustedDevice`, and `cdms_student_schedule` cookie.

- [ ] **Step 1: Write failing tests** for resolving a valid access token, valid cookie, expired token, revoked device, malformed token, and ensuring the original schedule API response remains unchanged.

```php
$student = app(StudentPublicIdentityService::class)->resolve(
    Request::create('/x', 'POST', ['access_token' => $plainToken]),
    $plainToken
);
$this->assertTrue($student->is($expectedStudent));
```

- [ ] **Step 2: Run tests to verify failure.**

Run: `cd backend; php artisan test --filter='PublicStudentIdentityServiceTest|PublicStudentScheduleTest'`

- [ ] **Step 3: Implement the resolver and refactor only the private identity lookup paths** in `schedule`, `remember`, and `forget`; keep cookie name, duration, OTP endpoints, Arabic messages, registration check, and payloads compatible.

- [ ] **Step 4: Run the focused and existing schedule suites.**

Run: `cd backend; php artisan test --filter='PublicStudentIdentityServiceTest|PublicStudentScheduleTest'`

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/app/Services/StudentPublicIdentityService.php backend/app/Http/Controllers/Api/V1/PublicStudentScheduleController.php backend/tests/Feature
git commit -m "refactor: share public student identity resolution"
```

### Task 3: Sign and validate rotating QR payloads

**Files:**
- Create: `backend/config/clinical_attendance.php`
- Create: `backend/app/Services/ClinicalAttendance/QrTokenService.php`
- Test: `backend/tests/Unit/ClinicalAttendance/QrTokenServiceTest.php`

**Interfaces:**
- Produces: `issue(ClinicalQrAttendanceSession $session): array{token:string,expires_at:string,phase:string}` and `validate(string $token): QrTokenClaims`.
- Claims: session UUID, phase, issued Unix timestamp, expiry Unix timestamp, 32-byte nonce; HMAC-SHA256 using an APP_KEY-derived purpose-specific key.

- [ ] **Step 1: Write failing unit tests** using frozen time for valid check-in, valid check-out, tampering, wrong structure, 5-second grace, beyond-grace expiry, and phase derivation.

```php
Carbon::setTestNow('2026-09-24 08:00:00');
$issued = $service->issue($session);
Carbon::setTestNow('2026-09-24 08:00:20');
$this->assertSame($session->public_id, $service->validate($issued['token'])->sessionId);
```

- [ ] **Step 2: Run and confirm failure.**

Run: `cd backend; php artisan test tests/Unit/ClinicalAttendance/QrTokenServiceTest.php`

- [ ] **Step 3: Implement URL-safe base64 payload/signature handling** with `hash_equals`, strict claim validation, configuration defaults `rotation_seconds=15`, `grace_seconds=5`, `scanner_enabled=true`, and never log/return nonce outside issuance.

- [ ] **Step 4: Run the unit test.**

Run: `cd backend; php artisan test tests/Unit/ClinicalAttendance/QrTokenServiceTest.php`

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/config/clinical_attendance.php backend/app/Services/ClinicalAttendance backend/tests/Unit/ClinicalAttendance
git commit -m "feat: sign rotating clinical attendance qr tokens"
```

### Task 4: Implement supervisor session lifecycle and roster snapshot

**Files:**
- Create: `backend/app/Services/ClinicalAttendance/QrAttendanceService.php`
- Create: `backend/app/Http/Controllers/Api/V1/ClinicalQrAttendanceController.php`
- Create: `backend/app/Http/Requests/ClinicalAttendance/TransitionQrAttendanceRequest.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/ClinicalQrAttendanceSupervisorTest.php`

**Interfaces:**
- Produces authenticated endpoints:
  - `GET /api/v1/operational/clinical-qr-attendance/assignments`
  - `POST /api/v1/operational/clinical-qr-attendance/sessions`
  - `GET /api/v1/operational/clinical-qr-attendance/sessions/{session}`
  - `POST /api/v1/operational/clinical-qr-attendance/sessions/{session}/transition`
  - `GET /api/v1/operational/clinical-qr-attendance/sessions/{session}/qr`
- `openSession(User $actor, int $assignmentId, CarbonImmutable $date): ClinicalQrAttendanceSession` snapshots all assignments sharing version/block/site/supervisor/subgroup group key.

- [ ] **Step 1: Write failing feature tests** for required permissions, supervisor ownership, published/current distribution, exact snapshot membership, changed membership after opening, allowed/forbidden transitions, required reopen reason, QR availability only during open phases, abandoned-session retrieval, and simultaneous duplicate open returning the existing session.

```php
$response = $this->actingAs($supervisor)->postJson('/api/v1/operational/clinical-qr-attendance/sessions', [
    'assignment_id' => $assignment->id, 'session_date' => '2026-09-24',
]);
$response->assertCreated()->assertJsonCount(5, 'data.roster');
```

- [ ] **Step 2: Run and verify failure.**

Run: `cd backend; php artisan test --filter=ClinicalQrAttendanceSupervisorTest`

- [ ] **Step 3: Implement transactional lifecycle.** Lock the assignment/session rows, validate the actor's `person_id`, build a stable assignment key, snapshot the roster, increment `version` on each transition, append transition events, return only current supervisor-owned sessions, and translate duplicate-key races into the existing active session response.

- [ ] **Step 4: Run focused tests.**

Run: `cd backend; php artisan test --filter=ClinicalQrAttendanceSupervisorTest`

Expected: PASS including duplicate-open and ownership cases.

- [ ] **Step 5: Commit.**

```bash
git add backend/app/Services/ClinicalAttendance backend/app/Http/Controllers/Api/V1/ClinicalQrAttendanceController.php backend/app/Http/Requests/ClinicalAttendance backend/routes/api.php backend/tests/Feature/ClinicalQrAttendanceSupervisorTest.php
git commit -m "feat: add supervisor qr attendance lifecycle"
```

### Task 5: Implement the public scanner API and scan transaction

**Files:**
- Create: `backend/app/Http/Controllers/Api/V1/PublicClinicalQrAttendanceController.php`
- Create: `backend/app/Http/Requests/ClinicalAttendance/ScanClinicalQrRequest.php`
- Modify: `backend/app/Services/ClinicalAttendance/QrAttendanceService.php`
- Modify: `backend/app/Providers/AppServiceProvider.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/PublicClinicalQrAttendanceTest.php`

**Interfaces:**
- Produces public endpoints:
  - `POST /api/v1/public/clinical-attendance/identity`
  - `POST /api/v1/public/clinical-attendance/scan`
- Scan request: `{qr_token: string, access_token?: string}` plus trusted cookie fallback.
- Success response: `{operation, recorded_at, course, group, training_site, idempotent}` with no roster peer data.

- [ ] **Step 1: Write failing feature tests** for access-token and trusted-cookie identity, scanner disabled, valid check-in/out, expired/tampered/wrong-phase token, wrong roster, checkout without check-in, duplicate idempotency preserving timestamp, phase closure invalidating a previously issued QR, and rate limiting.

```php
$first = $this->withCookie('cdms_student_schedule', $deviceToken)
    ->postJson('/api/v1/public/clinical-attendance/scan', ['qr_token' => $qr]);
$second = $this->withCookie('cdms_student_schedule', $deviceToken)
    ->postJson('/api/v1/public/clinical-attendance/scan', ['qr_token' => $qr]);
$second->assertOk()->assertJsonPath('data.recorded_at', $first->json('data.recorded_at'));
```

- [ ] **Step 2: Run and verify failure.**

Run: `cd backend; php artisan test --filter=PublicClinicalQrAttendanceTest`

- [ ] **Step 3: Implement scan validation in one transaction.** Lock session and roster, validate token and current phase, store server timestamp, hash IP with APP_KEY HMAC, hash nonce, truncate user agent, append result events, use generic wrong-roster response, and return original successful time on duplicates. Configure separate per-IP and per-student throttles.

- [ ] **Step 4: Run focused tests.**

Run: `cd backend; php artisan test --filter=PublicClinicalQrAttendanceTest`

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/app/Http/Controllers/Api/V1/PublicClinicalQrAttendanceController.php backend/app/Http/Requests/ClinicalAttendance/ScanClinicalQrRequest.php backend/app/Services/ClinicalAttendance/QrAttendanceService.php backend/app/Providers/AppServiceProvider.php backend/routes/api.php backend/tests/Feature/PublicClinicalQrAttendanceTest.php
git commit -m "feat: record public clinical qr scans"
```

### Task 6: Finalize attendance atomically and support audited corrections

**Files:**
- Create: `backend/app/Http/Requests/ClinicalAttendance/OverrideQrAttendanceRequest.php`
- Modify: `backend/app/Services/ClinicalAttendance/QrAttendanceService.php`
- Modify: `backend/app/Http/Controllers/Api/V1/ClinicalQrAttendanceController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/ClinicalQrAttendanceFinalizationTest.php`
- Test: `backend/tests/Feature/AttendanceWarningWorkflowTest.php`

**Interfaces:**
- Produces:
  - `PATCH /api/v1/operational/clinical-qr-attendance/sessions/{session}/roster/{roster}`
  - transition action `finalize` writing one `ClinicalSession` and `AttendanceRecord` per snapshot student.
- Manual payload: `{status: present|absent|late|excused, reason: string, check_in_at?: datetime, check_out_at?: datetime}`.

- [ ] **Step 1: Write failing tests** for all final classifications, required reason, actor/previous/new audit data, preserving QR timestamps, reviewer-only finalized reopen permission, re-finalization idempotency, existing manual-row upsert behavior, warning compatibility, and forced exception rollback leaving the QR session unfinalized with zero partial records.

```php
$this->mock(QrAttendanceFinalizationHook::class)
    ->shouldReceive('afterRecord')->once()->andThrow(new RuntimeException('forced'));
$this->postJson($finalizeUrl)->assertServerError();
$this->assertDatabaseMissing('clinical_qr_attendance_sessions', ['id' => $session->id, 'state' => 'finalized']);
```

- [ ] **Step 2: Run and verify failure.**

Run: `cd backend; php artisan test --filter='ClinicalQrAttendanceFinalizationTest|AttendanceWarningWorkflowTest'`

- [ ] **Step 3: Implement finalization and correction.** Create/reuse the date/block/site `ClinicalSession`, upsert attendance by `(clinical_session_id, student_id)`, copy timestamps/source/incomplete/linkage, never overwrite a QR timestamp without an explicit manual override, null `active_guard` only after every row succeeds, and record audit events for every correction/reopen.

- [ ] **Step 4: Run focused suites.**

Run: `cd backend; php artisan test --filter='ClinicalQrAttendanceFinalizationTest|AttendanceWarningWorkflowTest|ClinicalDirectorAttendanceAccessTest'`

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/app/Http/Requests/ClinicalAttendance backend/app/Services/ClinicalAttendance backend/app/Http/Controllers/Api/V1/ClinicalQrAttendanceController.php backend/routes/api.php backend/tests/Feature
git commit -m "feat: finalize and audit qr attendance"
```

### Task 7: Add permissions and reviewer/report fields

**Files:**
- Modify: `backend/database/seeders/PermissionSeeder.php`
- Modify: `backend/database/seeders/LogicalPermissionSeeder.php`
- Modify: `backend/app/Http/Controllers/Api/V1/AttendanceRecordController.php`
- Modify: `frontend/src/pages/admin/PermissionMatrixPage.tsx`
- Test: `backend/tests/Feature/ClinicalQrAttendanceReviewTest.php`
- Test: `frontend/src/pages/clinical/AttendanceMasterPage.test.tsx`

**Interfaces:**
- Produces permission `attendance.qr.reopen_finalized` and reviewer fields `check_in_at`, `check_out_at`, `recording_source`, `is_incomplete`, `manual_reason`, `qr_session_id`.

- [ ] **Step 1: Write failing backend and frontend tests** proving ordinary supervisors cannot reopen finalized sessions, authorized reviewers can with a reason, old manual records serialize nullable QR fields, and exports preserve old columns while adding QR metadata.

- [ ] **Step 2: Run tests and verify failure.**

Run: `cd backend; php artisan test --filter=ClinicalQrAttendanceReviewTest`

Run: `cd frontend; npm test -- AttendanceMasterPage.test.tsx`

- [ ] **Step 3: Implement permission seeding, Arabic matrix label, scoped reviewer serialization, and Excel/PDF column additions.** Do not change warning calculations or require QR metadata for legacy records.

- [ ] **Step 4: Run focused tests.**

Run: `cd backend; php artisan test --filter='ClinicalQrAttendanceReviewTest|ClinicalDirectorAttendanceAccessTest|AttendanceWarningWorkflowTest'`

Run: `cd frontend; npm test -- AttendanceMasterPage.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/database/seeders backend/app/Http/Controllers/Api/V1/AttendanceRecordController.php backend/tests/Feature frontend/src/pages/admin/PermissionMatrixPage.tsx frontend/src/pages/clinical/AttendanceMasterPage.test.tsx
git commit -m "feat: expose qr attendance for reviewers"
```

### Task 8: Build the supervisor QR workspace

**Files:**
- Create: `frontend/src/api/clinicalQrAttendance.ts`
- Create: `frontend/src/pages/clinical/SupervisorQrAttendanceWorkspace.tsx`
- Create: `frontend/src/pages/clinical/SupervisorQrAttendanceWorkspace.test.tsx`
- Modify: `frontend/src/pages/clinical/SupervisorAttendancePage.tsx`

**Interfaces:**
- Consumes Task 4/6 supervisor endpoints.
- Produces a QR/manual mode switch, state-aware primary action, 15-second token refresh/countdown, 5-second status polling, compact roster table, and correction dialog.

- [ ] **Step 1: Write failing UI tests** for all four primary action labels, confirmation before close/finalize, QR refresh at rotation boundary, polling paused while `document.hidden`, polling stopped when finalized, counters, search, required correction reason, light responsive layout, and network/offline state that hides/freezes an invalid QR.

```tsx
vi.useFakeTimers();
render(<SupervisorQrAttendanceWorkspace />);
expect(await screen.findByRole('button', { name: 'إغلاق تسجيل الدخول' })).toBeVisible();
await vi.advanceTimersByTimeAsync(15_000);
expect(fetchQr).toHaveBeenCalledTimes(2);
```

- [ ] **Step 2: Run and verify failure.**

Run: `cd frontend; npm test -- SupervisorQrAttendanceWorkspace.test.tsx`

- [ ] **Step 3: Implement the typed API and workspace.** Keep the existing manual group-entry UI intact under its own tab, use `qrcode` only for rendering server-issued payloads, show one visually dominant action, and make every destructive transition explicit and keyboard accessible.

- [ ] **Step 4: Run UI tests and typecheck.**

Run: `cd frontend; npm test -- SupervisorQrAttendanceWorkspace.test.tsx; npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add frontend/src/api/clinicalQrAttendance.ts frontend/src/pages/clinical/SupervisorQrAttendanceWorkspace.tsx frontend/src/pages/clinical/SupervisorQrAttendanceWorkspace.test.tsx frontend/src/pages/clinical/SupervisorAttendancePage.tsx
git commit -m "feat: add supervisor qr attendance workspace"
```

### Task 9: Build the camera-only public student scanner

**Files:**
- Create: `frontend/src/components/clinical/LiveQrScanner.tsx`
- Create: `frontend/src/components/clinical/LiveQrScanner.test.tsx`
- Create: `frontend/src/pages/public/PublicClinicalAttendancePage.tsx`
- Create: `frontend/src/pages/public/PublicClinicalAttendancePage.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`

**Interfaces:**
- Consumes existing OTP request/verify/remember/forget routes and Task 5 identity/scan endpoints.
- `LiveQrScanner` props: `{active:boolean,onDecoded(value:string):void,onError(code:CameraErrorCode):void}`.

- [ ] **Step 1: Install the browser decoder dependency.**

Run: `cd frontend; npm install @zxing/browser`

- [ ] **Step 2: Write failing tests** for OTP entry, trusted-cookie identity, remember-for-30-days modal, explicit camera-start gesture, successful check-in/out result, expired-token recovery without closing camera, unsupported/insecure/denied camera guidance, scan submission lock, and DOM assertion that no `input[type=file]`, paste box, or manual QR field exists.

```tsx
render(<PublicClinicalAttendancePage />);
expect(document.querySelector('input[type="file"]')).toBeNull();
await user.click(screen.getByRole('button', { name: 'فتح كاميرا الحضور' }));
expect(mockGetUserMedia).toHaveBeenCalledOnce();
```

- [ ] **Step 3: Run and verify failure.**

Run: `cd frontend; npm test -- LiveQrScanner.test.tsx PublicClinicalAttendancePage.test.tsx`

- [ ] **Step 4: Implement scanner and public page.** Stop all media tracks on unmount/background, request the rear camera with `facingMode: environment`, debounce decoded values while a request is pending, show only the current student's identity and latest operation, provide forget/change-student with OTP protection, and use a calm light mobile-first design.

- [ ] **Step 5: Add public route and run tests/typecheck/build.**

Run: `cd frontend; npm test -- LiveQrScanner.test.tsx PublicClinicalAttendancePage.test.tsx; npm run typecheck; npm run build:container`

Expected: PASS and `/clinical-attendance` renders outside `ProtectedRoute`.

- [ ] **Step 6: Commit.**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/clinical frontend/src/pages/public/PublicClinicalAttendancePage.tsx frontend/src/pages/public/PublicClinicalAttendancePage.test.tsx frontend/src/App.tsx
git commit -m "feat: add camera only student attendance scanner"
```

### Task 10: Complete reviewer UI, end-to-end regressions, and deployment documentation

**Files:**
- Modify: `frontend/src/pages/clinical/AttendanceMasterPage.tsx`
- Modify: `frontend/src/pages/clinical/AttendanceMasterPage.test.tsx`
- Create: `docs/operations/clinical-qr-attendance.md`
- Modify: `.env.example`

**Interfaces:**
- Produces visible QR/manual source, check-in/out times, incomplete badge, audit/correction details, filters/exports, and operator runbook.

- [ ] **Step 1: Extend failing reviewer UI tests** for legacy rows, QR rows, incomplete rows, manual overrides, narrow mobile table behavior, and export payloads.

- [ ] **Step 2: Run and verify failure.**

Run: `cd frontend; npm test -- AttendanceMasterPage.test.tsx`

- [ ] **Step 3: Implement reviewer UI and operational documentation.** Document HTTPS/camera requirements, `CLINICAL_ATTENDANCE_SCANNER_ENABLED`, rotation/grace configuration, migration/rollback, permission seeding, queue/cache refresh, and smoke-test sequence without documenting secrets.

- [ ] **Step 4: Run the complete verification matrix.**

Run: `cd backend; php artisan test`

Run: `cd frontend; npm test; npm run typecheck; npm run build:container`

Expected: all backend/frontend tests pass, TypeScript has no errors, and the production frontend bundle builds.

- [ ] **Step 5: Inspect migration and route safety.**

Run: `cd backend; php artisan migrate:status; php artisan route:list --path=clinical-attendance; php artisan config:show clinical_attendance`

Expected: both migrations listed, authenticated/public routes separated correctly, secrets absent from config output.

- [ ] **Step 6: Commit.**

```bash
git add frontend/src/pages/clinical/AttendanceMasterPage.tsx frontend/src/pages/clinical/AttendanceMasterPage.test.tsx docs/operations/clinical-qr-attendance.md .env.example
git commit -m "docs: finalize clinical qr attendance rollout"
```

- [ ] **Step 7: Review the full diff and push only after clean verification.**

Run: `git status --short; git diff --check; git log --oneline --decorate -12`

Expected: no unintended files, no whitespace errors, and the task commits appear in order.

