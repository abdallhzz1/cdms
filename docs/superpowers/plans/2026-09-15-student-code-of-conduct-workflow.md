# Student Code of Conduct Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a versioned Medical Students Code of Conduct circulation workflow that records OTP-verified reading, tracks the required handwritten copy, stores signed scans privately in student files, and reports completion.

**Architecture:** Add a self-contained student-policy domain with immutable published documents, campaigns that snapshot eligible students, and one assignment record per student. Staff APIs use dedicated permissions; public APIs use campaign-scoped OTP challenges and hashed short-lived access tokens. The existing student Documents tab exposes the same scan metadata without duplicating the stored file.

**Tech Stack:** Laravel 11, Eloquent, Sanctum permission middleware, private Laravel storage, React 18, TypeScript, TanStack Query, React Router, Tailwind CSS, Vitest, Laravel feature tests, SheetJS.

**Spec:** `docs/superpowers/specs/2026-09-15-student-code-of-conduct-workflow.md`

## Global Constraints

- The handwritten paper signature is authoritative; electronic acknowledgement records reading only.
- Students remain non-user records and authenticate through university-number OTP.
- The system publishes only an externally approved bilingual, letterheaded PDF and never edits policy wording.
- Published document files are immutable; corrections create a new version and campaign.
- Official PDFs and signed scans remain on private storage and are streamed only through authorized endpoints.
- Public errors do not reveal whether a university number exists.
- Acknowledgement records the immutable document version and SHA-256 hash.
- Student deletion must not cascade-delete policy evidence.
- The first release excludes drawn signatures, third-party e-signature, and OCR.

---

### Task 1: Policy schema, models, and permissions

**Files:**
- Create: `backend/database/migrations/2026_09_15_090000_create_student_policy_workflow.php`
- Create: `backend/app/Models/StudentPolicyDocument.php`
- Create: `backend/app/Models/StudentPolicyCampaign.php`
- Create: `backend/app/Models/StudentPolicyAssignment.php`
- Create: `backend/app/Models/StudentPolicyOtpChallenge.php`
- Create: `backend/database/factories/StudentPolicyDocumentFactory.php`
- Create: `backend/database/factories/StudentPolicyCampaignFactory.php`
- Create: `backend/database/factories/StudentPolicyAssignmentFactory.php`
- Modify: `backend/app/Models/Student.php`
- Modify: `backend/database/seeders/PermissionSeeder.php`
- Modify: `frontend/src/pages/admin/PermissionMatrixPage.tsx`
- Test: `backend/tests/Feature/StudentPolicyWorkflowTest.php`

**Interfaces:**
- Produces: Eloquent relations `StudentPolicyDocument::campaigns()`, `StudentPolicyCampaign::document()`, `StudentPolicyCampaign::assignments()`, `StudentPolicyAssignment::student()`, and `Student::policyAssignments()`.
- Produces: permissions `student_policies.view` and `student_policies.manage` under module `Student Policies`.

- [ ] **Step 1: Write the failing schema and permission test**

```php
public function test_policy_permissions_and_assignment_uniqueness_exist(): void
{
    $this->seed(PermissionSeeder::class);
    $this->assertDatabaseHas('permissions', ['code' => 'student_policies.view']);
    $this->assertDatabaseHas('permissions', ['code' => 'student_policies.manage']);

    $document = StudentPolicyDocument::factory()->create();
    $campaign = StudentPolicyCampaign::factory()->for($document, 'document')->create();
    $student = Student::factory()->create();
    StudentPolicyAssignment::create(['campaign_id' => $campaign->id, 'student_id' => $student->id]);

    $this->expectException(QueryException::class);
    StudentPolicyAssignment::create(['campaign_id' => $campaign->id, 'student_id' => $student->id]);
}
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd backend && php artisan test --filter=StudentPolicyWorkflowTest`

Expected: FAIL because the policy models and tables do not exist.

- [ ] **Step 3: Create the migration and focused models**

Create four tables with foreign keys, timestamps, indexes on campaign status/deadline and assignment milestones, a unique `campaign_id + student_id`, and nullable scan metadata. Use `restrictOnDelete()` from assignments to students and documents so evidence cannot be cascaded away. Store document and scan hashes as 64-character SHA-256 strings. Add casts for dates, JSON target levels, and timestamps. Add focused model factories for documents, campaigns, and assignments so feature tests create valid domain records without duplicating setup.

Seed the permissions with:

```php
['code' => 'student_policies.view', 'module' => 'Student Policies', 'action' => 'VIEW', 'description_key' => 'permissions.student_policies_view.description'],
['code' => 'student_policies.manage', 'module' => 'Student Policies', 'action' => 'MANAGE', 'description_key' => 'permissions.student_policies_manage.description'],
```

Add Arabic matrix labels `عرض سياسات وتعهدات الطلبة` and `إدارة سياسات وتعهدات الطلبة`, plus English module label `Student Policies and Acknowledgements`.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `cd backend && php artisan test --filter=StudentPolicyWorkflowTest`

Expected: PASS.

- [ ] **Step 5: Commit the domain foundation**

```bash
git add backend/database/migrations backend/app/Models backend/database/seeders/PermissionSeeder.php frontend/src/pages/admin/PermissionMatrixPage.tsx backend/tests/Feature/StudentPolicyWorkflowTest.php
git commit -m "add student policy workflow foundation"
```

### Task 2: Staff document and campaign lifecycle API

**Files:**
- Create: `backend/app/Http/Controllers/Api/V1/StudentPolicyController.php`
- Create: `backend/app/Services/StudentPolicyCampaignService.php`
- Create: `backend/app/Http/Resources/V1/StudentPolicyCampaignResource.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/StudentPolicyWorkflowTest.php`

**Interfaces:**
- Consumes: models and permissions from Task 1 and `SecureFileUploadService::storeDocument()`.
- Produces: `GET /api/v1/student-policies`, `POST /api/v1/student-policies/documents`, `POST /api/v1/student-policies/campaigns`, `GET /api/v1/student-policies/campaigns/{campaign}`, `POST /api/v1/student-policies/campaigns/{campaign}/publish`, and `POST /api/v1/student-policies/campaigns/{campaign}/close`.
- Produces: `StudentPolicyCampaignService::publish(StudentPolicyCampaign $campaign, User $actor): StudentPolicyCampaign`.

- [ ] **Step 1: Write failing lifecycle tests**

```php
public function test_manager_uploads_pdf_and_publishes_a_snapshot_for_active_target_students(): void
{
    Storage::fake('local');
    $manager = $this->policyUser('student_policies.manage');
    Student::factory()->create(['academic_level' => 'fourth', 'registration_status' => 'active']);
    Student::factory()->create(['academic_level' => 'fifth', 'registration_status' => 'active']);

    $documentId = $this->actingAs($manager)->postJson('/api/v1/student-policies/documents', [
        'title_ar' => 'مدونة سلوك طلبة الطب',
        'title_en' => 'Medical Students Code of Conduct',
        'version_label' => '2026.1',
        'effective_date' => '2026-09-15',
        'file' => UploadedFile::fake()->create('conduct.pdf', 100, 'application/pdf'),
    ])->assertCreated()->json('data.id');

    $campaignId = $this->actingAs($manager)->postJson('/api/v1/student-policies/campaigns', [
        'student_policy_document_id' => $documentId,
        'academic_year_id' => AcademicYear::factory()->create()->id,
        'target_levels' => ['fourth'],
        'deadline' => '2026-10-01',
    ])->assertCreated()->json('data.id');

    $this->postJson("/api/v1/student-policies/campaigns/{$campaignId}/publish")->assertOk();
    $this->assertDatabaseCount('student_policy_assignments', 1);
}
```

Also test PDF-only publication, duplicate version rejection, no eligible students, immutable published files, close behavior, `view` versus `manage`, and transaction rollback.

- [ ] **Step 2: Run lifecycle tests and verify RED**

Run: `cd backend && php artisan test --filter=StudentPolicyWorkflowTest`

Expected: FAIL with missing routes.

- [ ] **Step 3: Implement upload, campaign CRUD, publication snapshot, and resource presenter**

Validate MIME using the existing secure upload service, calculate `hash_file('sha256', Storage::disk('local')->path($storedPath))`, wrap publication in `DB::transaction()` with `lockForUpdate()`, and insert assignment rows from active students matching target levels. Return counts grouped by milestones from database queries rather than client values.

Protect list/detail with `permission.any:student_policies.view,student_policies.manage`; protect mutations with `permission:student_policies.manage`.

- [ ] **Step 4: Run lifecycle tests and verify GREEN**

Run: `cd backend && php artisan test --filter=StudentPolicyWorkflowTest`

Expected: PASS.

- [ ] **Step 5: Commit the staff lifecycle API**

```bash
git add backend/app/Http/Controllers/Api/V1/StudentPolicyController.php backend/app/Services/StudentPolicyCampaignService.php backend/app/Http/Resources/V1/StudentPolicyCampaignResource.php backend/routes/api.php backend/tests/Feature/StudentPolicyWorkflowTest.php
git commit -m "add student policy campaign lifecycle"
```

### Task 3: Public OTP access and version-bound acknowledgement

**Files:**
- Create: `backend/app/Http/Controllers/Api/V1/PublicStudentPolicyController.php`
- Create: `backend/app/Services/StudentPolicyAccessService.php`
- Create: `backend/app/Mail/StudentPolicyOtpMail.php`
- Create: `backend/resources/views/emails/student-policy-otp.blade.php`
- Modify: `backend/routes/api.php`
- Modify: `backend/app/Providers/AppServiceProvider.php`
- Test: `backend/tests/Feature/PublicStudentPolicyTest.php`

**Interfaces:**
- Consumes: campaigns, assignments, OTP challenges, and `Student::resolvedUniversityEmail()`.
- Produces: `GET /api/v1/public/student-policies/{campaign:public_id}`, `POST .../request-otp`, `POST .../verify-otp`, `POST .../document-opened`, `GET .../document`, and `POST .../acknowledge`.
- Produces: a random 64-byte access token returned once and stored only as SHA-256 hash with 20-minute expiry.

- [ ] **Step 1: Write failing public security tests**

```php
public function test_student_must_verify_otp_and_open_exact_version_before_acknowledging(): void
{
    Mail::fake();
    [$campaign, $student] = $this->publishedCampaignWithStudent();

    $challenge = $this->postJson("/api/v1/public/student-policies/{$campaign->public_id}/request-otp", [
        'university_number' => $student->university_number,
    ])->assertOk()->json('data.challenge_token');

    $otp = $this->latestPolicyOtpFor($student);
    $token = $this->postJson("/api/v1/public/student-policies/{$campaign->public_id}/verify-otp", [
        'challenge_token' => $challenge,
        'otp' => $otp,
    ])->assertOk()->json('data.access_token');

    $this->postJson("/api/v1/public/student-policies/{$campaign->public_id}/acknowledge", [
        'access_token' => $token,
        'typed_name' => $student->full_name_ar,
    ])->assertUnprocessable();

    $this->postJson("/api/v1/public/student-policies/{$campaign->public_id}/document-opened", ['access_token' => $token])->assertOk();
    $this->postJson("/api/v1/public/student-policies/{$campaign->public_id}/acknowledge", [
        'access_token' => $token,
        'typed_name' => $student->full_name_ar,
    ])->assertOk();
}
```

Also test enumeration-safe responses, hashed OTP/token storage, expiry, attempt limits, wrong campaign tokens, closed campaigns, repeat acknowledgement idempotency, and document authorization.

- [ ] **Step 2: Run public tests and verify RED**

Run: `cd backend && php artisan test --filter=PublicStudentPolicyTest`

Expected: FAIL with missing public controller and routes.

- [ ] **Step 3: Implement campaign-scoped OTP and acknowledgement service**

Follow the existing student schedule throttle pattern. Store `hash('sha256', $otp)`, access-token hash, expiry, and attempt count. On document-open, set `opened_at` once. On acknowledgement, require `opened_at`, compare normalized typed name with either student name, and atomically set `acknowledged_at`, typed name, document version, document SHA-256, `hash_hmac('sha256', $request->ip(), config('app.key'))`, and hashed user agent.

Stream the PDF from private storage with `Content-Disposition: inline`, `Cache-Control: private, no-store`, and `X-Content-Type-Options: nosniff`.

- [ ] **Step 4: Run public tests and verify GREEN**

Run: `cd backend && php artisan test --filter=PublicStudentPolicyTest`

Expected: PASS.

- [ ] **Step 5: Commit secure student access**

```bash
git add backend/app/Http/Controllers/Api/V1/PublicStudentPolicyController.php backend/app/Services/StudentPolicyAccessService.php backend/app/Mail/StudentPolicyOtpMail.php backend/resources/views/emails/student-policy-otp.blade.php backend/app/Providers/AppServiceProvider.php backend/routes/api.php backend/tests/Feature/PublicStudentPolicyTest.php
git commit -m "add OTP student policy acknowledgement"
```

### Task 4: Paper receipt, private scans, and student-file integration

**Files:**
- Modify: `backend/app/Http/Controllers/Api/V1/StudentPolicyController.php`
- Modify: `backend/app/Http/Resources/V1/StudentResource.php`
- Modify: `backend/app/Http/Controllers/Api/V1/StudentController.php`
- Modify: `frontend/src/pages/StudentProfilePage.tsx`
- Test: `backend/tests/Feature/StudentPolicyWorkflowTest.php`
- Test: `frontend/src/pages/StudentProfilePage.test.tsx`

**Interfaces:**
- Produces: `POST /api/v1/student-policies/assignments/{assignment}/paper-receipt`, `POST .../scan`, `GET .../scan`, and `DELETE .../scan`.
- Produces: virtual `clinical_pledge` document entries in `StudentResource` derived from policy assignments.

- [ ] **Step 1: Write failing receipt and secure-file tests**

```php
public function test_manager_records_paper_receipt_and_scan_appears_in_student_documents(): void
{
    Storage::fake('local');
    [$campaign, $student, $assignment] = $this->publishedCampaignWithStudentAssignment();
    $manager = $this->policyUser('student_policies.manage');

    $this->actingAs($manager)->postJson("/api/v1/student-policies/assignments/{$assignment->id}/paper-receipt")->assertOk();
    $this->post("/api/v1/student-policies/assignments/{$assignment->id}/scan", [
        'file' => UploadedFile::fake()->create('signed.pdf', 100, 'application/pdf'),
    ])->assertCreated();

    $this->getJson("/api/v1/students/{$student->id}")
        ->assertOk()
        ->assertJsonPath('data.documents.0.category', 'clinical_pledge');
}
```

Also assert viewer download access, unauthorized denial, scan replacement audit, MIME/size limits, bulk receipt selection, and no public scan URL.

- [ ] **Step 2: Run receipt tests and verify RED**

Run: `cd backend && php artisan test --filter=StudentPolicyWorkflowTest`

Expected: FAIL with missing receipt endpoints.

- [ ] **Step 3: Implement receipt and scan actions**

Use row locks for milestone changes, private storage directory `student-policy-scans/{campaign_id}/{student_id}`, SHA-256 hashes, actor/timestamp metadata, and the existing audit service. Extend the student resource by merging existing JSON documents with policy-scan projections using stable IDs like `policy-assignment-{id}`. Route projected downloads to the policy scan endpoint instead of duplicating files.

- [ ] **Step 4: Add the policy category and immutable indicator to the Documents tab**

Render policy scans with title, version, receipt date, and a `Signed Code of Conduct` badge. Hide delete for projected policy documents unless the user has `student_policies.manage`.

- [ ] **Step 5: Run backend and frontend tests and verify GREEN**

Run: `cd backend && php artisan test --filter=StudentPolicyWorkflowTest`

Run: `cd frontend && npm test -- src/pages/StudentProfilePage.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit student-file integration**

```bash
git add backend/app/Http/Controllers/Api/V1/StudentPolicyController.php backend/app/Http/Resources/V1/StudentResource.php backend/app/Http/Controllers/Api/V1/StudentController.php frontend/src/pages/StudentProfilePage.tsx backend/tests/Feature/StudentPolicyWorkflowTest.php frontend/src/pages/StudentProfilePage.test.tsx
git commit -m "track signed conduct copies in student files"
```

### Task 5: Staff campaign and follow-up interface

**Files:**
- Create: `frontend/src/api/studentPolicies.ts`
- Create: `frontend/src/pages/StudentPoliciesPage.tsx`
- Create: `frontend/src/pages/StudentPolicyCampaignPage.tsx`
- Create: `frontend/src/pages/StudentPoliciesPage.test.tsx`
- Create: `frontend/src/pages/StudentPolicyCampaignPage.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: staff endpoints from Tasks 2 and 4.
- Produces: routes `/student-policies` and `/student-policies/:id`.
- Produces: `exportPolicyRegister(rows: PolicyAssignmentRow[]): void` using the installed `xlsx` package.

- [ ] **Step 1: Write failing permission, creation, filtering, and bulk receipt tests**

```tsx
it('shows only real campaign milestones and confirms bulk paper receipt', async () => {
  renderWithProviders(<StudentPolicyCampaignPage />, { route: '/student-policies/7' });
  expect(await screen.findByText('Not opened')).toBeVisible();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Select Student One' }));
  await userEvent.click(screen.getByRole('button', { name: 'Record paper receipt' }));
  expect(screen.getByRole('dialog', { name: 'Confirm paper receipt' })).toBeVisible();
});
```

Test list visibility for `student_policies.view`, mutation controls only for `student_policies.manage`, required PDF/version/year/levels/deadline, mobile horizontal table, search/level/status filters, individual scan upload, and Excel headers.

- [ ] **Step 2: Run UI tests and verify RED**

Run: `cd frontend && npm test -- src/pages/StudentPoliciesPage.test.tsx src/pages/StudentPolicyCampaignPage.test.tsx`

Expected: FAIL because pages do not exist.

- [ ] **Step 3: Implement the API client and calm staff UI**

Use a compact page header, four milestone statistics, one filter bar, and a horizontally scrollable table on mobile rather than cards. Campaign creation is a focused modal. Keep scan upload per row; bulk action records paper receipt only. Export the filtered rows to `.xlsx` with Arabic and English-safe column labels and no private evidence fields.

- [ ] **Step 4: Wire protected routes and sidebar**

Use a route guard that accepts either `student_policies.view` or `student_policies.manage`; do not assume `manage` implicitly grants `view`. Mutation controls require `student_policies.manage`. Sidebar visibility follows either permission and uses a document-check icon under student administration.

- [ ] **Step 5: Run UI tests and verify GREEN**

Run: `cd frontend && npm test -- src/pages/StudentPoliciesPage.test.tsx src/pages/StudentPolicyCampaignPage.test.tsx src/App.test.tsx src/components/layout/Sidebar.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the staff UI**

```bash
git add frontend/src/api/studentPolicies.ts frontend/src/pages/StudentPoliciesPage.tsx frontend/src/pages/StudentPolicyCampaignPage.tsx frontend/src/pages/StudentPoliciesPage.test.tsx frontend/src/pages/StudentPolicyCampaignPage.test.tsx frontend/src/App.tsx frontend/src/components/layout/Sidebar.tsx frontend/src/App.test.tsx frontend/src/components/layout/Sidebar.test.tsx
git commit -m "add student policy follow-up workspace"
```

### Task 6: Public student Code of Conduct portal

**Files:**
- Create: `frontend/src/pages/public/PublicStudentPolicyPage.tsx`
- Create: `frontend/src/pages/public/PublicStudentPolicyPage.test.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: public endpoints from Task 3.
- Produces: `/portal/student-policies/:campaignPublicId`.

- [ ] **Step 1: Write failing OTP and acknowledgement UI tests**

```tsx
it('does not show the Code before verification and preserves the paper signature requirement', async () => {
  renderWithProviders(<PublicStudentPolicyPage />, { route: '/portal/student-policies/campaign-token' });
  expect(await screen.findByRole('heading', { name: 'Medical Students Code of Conduct' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Open official document' })).not.toBeInTheDocument();
  await verifyStudentOtp();
  expect(screen.getByRole('button', { name: 'Open official document' })).toBeVisible();
  expect(screen.getByText(/does not replace your handwritten signature/i)).toBeVisible();
});
```

Test generic invalid-number behavior, OTP resend countdown, closed campaign, document-open prerequisite, typed-name validation, idempotent acknowledged state, and phone layout.

- [ ] **Step 2: Run the public UI test and verify RED**

Run: `cd frontend && npm test -- src/pages/public/PublicStudentPolicyPage.test.tsx`

Expected: FAIL because the page does not exist.

- [ ] **Step 3: Implement the student flow**

Build four explicit states: identity, OTP, document and acknowledgement, completion. Open the PDF in an authenticated application request rather than exposing a storage URL; immediately record `document-opened`. Disable acknowledgement until open succeeds, the required checkbox is selected, and typed name is present. Completion prominently repeats printing and paper-return instructions.

- [ ] **Step 4: Run the public UI test and verify GREEN**

Run: `cd frontend && npm test -- src/pages/public/PublicStudentPolicyPage.test.tsx src/App.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the public portal**

```bash
git add frontend/src/pages/public/PublicStudentPolicyPage.tsx frontend/src/pages/public/PublicStudentPolicyPage.test.tsx frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "add student conduct acknowledgement portal"
```

### Task 7: Audit coverage, final verification, and production build

**Files:**
- Modify: `backend/tests/Feature/PermissionMatrixWorkflowTest.php`
- Modify: `backend/tests/Feature/StudentPolicyWorkflowTest.php`
- Modify: `docs/CPANEL_SECURE_DEPLOYMENT.md`
- Generated: `assets/index-*.js`, `assets/index-*.css`, `index.html`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: deployable frontend assets and an operator checklist for a controlled test campaign.

- [ ] **Step 1: Add permission-matrix and audit regression tests**

Assert both policy permissions appear in the matrix, every guarded route permission is registered, and audit records exist for publish, close, acknowledge, paper receipt, scan upload/download/removal, and export.

- [ ] **Step 2: Run focused backend suites**

Run: `cd backend && php artisan test --filter='StudentPolicy|PermissionMatrixWorkflowTest'`

Expected: PASS with zero failures.

- [ ] **Step 3: Run focused frontend suites**

Run: `cd frontend && npm test -- src/pages/StudentPoliciesPage.test.tsx src/pages/StudentPolicyCampaignPage.test.tsx src/pages/public/PublicStudentPolicyPage.test.tsx src/pages/StudentProfilePage.test.tsx src/App.test.tsx src/components/layout/Sidebar.test.tsx`

Expected: PASS with zero failures.

- [ ] **Step 4: Build production assets**

Run: `cd frontend && npm run build`

Expected: TypeScript and Vite finish successfully and copy hashed assets to the repository root.

- [ ] **Step 5: Verify repository integrity**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; status contains only intended source, migration, test, documentation, and generated asset changes.

- [ ] **Step 6: Document the controlled rollout**

Add cPanel steps: pull from `/home/alfajrhe/repositories/cdms`, migrate, clear/cache Laravel, deploy HEAD, confirm the new asset hash, create a campaign for test students, verify OTP and private scan access, then publish the real campaign only after receiving the approved bilingual letterheaded PDF.

- [ ] **Step 7: Commit final integration**

```bash
git add backend/tests docs/CPANEL_SECURE_DEPLOYMENT.md assets index.html
git commit -m "verify student conduct workflow deployment"
```
