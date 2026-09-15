# Student Code of Conduct Workflow Design

## Purpose

The Clinical Phase Portal will publish the approved Medical Students Code of Conduct, verify each student through university email OTP, record that the student opened and acknowledged the correct document version, and track the authoritative handwritten copy until it is received and stored in the student's private file.

This workflow implements the College request without treating an electronic checkbox as a replacement for the required handwritten signature.

## Confirmed Source Requirements

- The Code must be printed on official College of Medicine letterhead.
- Every medical student must read and sign it.
- Signed copies must remain in student files.
- The final Code must be available in the Clinical Phase Portal for reference.
- The supplied document contains student name, student ID, signature, and date fields.
- The supplied document refers to an approved bilingual Arabic-English version, while the supplied content currently appears in English only and has no document header or footer.

The official bilingual, letterheaded PDF is therefore an input to the workflow. The system must not invent, translate, or silently alter the approved policy text.

## Users and Responsibilities

### Policy administrator

A user with `student_policies.manage` can upload a final PDF, create a circulation campaign, select the target academic year and clinical levels, set a deadline, publish or close a campaign, record receipt of paper copies, upload scans, and correct receipt metadata.

### Reviewer

A user with `student_policies.view` can view campaign progress, filter students, open private scans, and export the follow-up register. The reviewer cannot publish a new version or alter receipt evidence.

### Student

Students remain non-user records. A student enters a university number and verifies the university email through OTP. After verification, the student can read or download the assigned Code, acknowledge reading it, and see instructions for returning the handwritten copy. A student cannot access another student's state or signed scan.

## Authoritative Status Model

Each targeted student has one record per campaign with the following milestones:

1. `not_opened`: the student has not opened the campaign after OTP verification.
2. `opened`: the approved document was displayed or downloaded.
3. `acknowledged`: the student confirmed reading and understanding the displayed version.
4. `paper_received`: an authorized staff member recorded receipt of the handwritten copy.
5. `scan_attached`: the signed scan is stored privately in the student's file.

The workflow is complete only at `paper_received` when the College retains paper files, or `scan_attached` when the College requires a digital file as well. Electronic acknowledgement is supporting evidence, not the legal signature.

## Data Model

### `student_policy_documents`

- `id`, `public_id`
- Arabic and English titles
- document type, initially `code_of_conduct`
- version label and effective date
- private storage path, original filename, MIME type, size, SHA-256 hash
- status: `draft`, `published`, or `retired`
- uploaded and published user/timestamps
- notes for administrators only

Only PDF is accepted for a published version. DOCX may be retained as an internal source attachment later but is not part of the first release.

### `student_policy_campaigns`

- `id`, `public_id`, `student_policy_document_id`
- academic year
- target clinical levels as JSON
- optional registration status filter, defaulting to active students
- deadline
- status: `draft`, `published`, `closed`
- public instructions in Arabic and English
- created, published, and closed user/timestamps

Publishing snapshots the target student IDs so later level changes do not rewrite historical obligations.

### `student_policy_assignments`

- `id`, `campaign_id`, `student_id`
- `opened_at`, `acknowledged_at`
- acknowledged typed name and document hash/version
- hashed IP and hashed user-agent evidence
- `paper_received_at`, `paper_received_by`
- signed scan storage metadata and hash
- `scan_uploaded_at`, `scan_uploaded_by`
- internal follow-up note
- unique constraint on campaign and student

Scans are stored on the private Laravel disk. Download is streamed through an authorized endpoint with audit logging.

### `student_policy_otp_challenges`

- short-lived hashed OTP challenge tied to campaign and student
- attempt count, expiry, verified timestamp, and one-time access token hash

The implementation follows the existing student schedule and group-registration OTP protections but does not reuse schedule-specific challenge records.

## Administrative Experience

### Policies and campaigns list

Route: `/student-policies`

The page shows a compact campaign list with document version, academic year, targeted levels, deadline, and completion counts. Primary actions are upload final Code, create campaign, open follow-up, and export.

### Campaign follow-up

Route: `/student-policies/:id`

The page shows:

- total targeted students
- read and acknowledged count
- paper copies received
- scans attached
- overdue and incomplete counts
- filters by academic level, group, status, and search
- a table with one row per student and milestone timestamps
- individual and bulk paper-receipt actions
- individual scan upload directly into the student's private file
- Excel export of the current filtered register

Bulk receipt requires explicit selection and confirmation. Scan upload remains per student to prevent attaching a signed document to the wrong record.

## Student Experience

Route: `/portal/student-policies/:campaignPublicId`

1. The landing page identifies the Code version and deadline without exposing student data.
2. The student enters a university number.
3. The system sends an OTP to the resolved university email.
4. After verification, the official PDF appears with download and open controls.
5. The page clearly states that electronic acknowledgement does not replace the handwritten signature.
6. The student checks a statement confirming that the document was read and understood and types the full name.
7. The system records the document hash/version and acknowledgment evidence.
8. The completion screen shows printing and paper-return instructions and allows the student to reopen the same document during the campaign.

Acknowledgement cannot be submitted before a successful OTP verification and document open event. Repeat submissions are idempotent and show the original acknowledgement timestamp.

## Student File Integration

When a signed scan is attached from the campaign, it is also presented in the student's existing Documents tab as category `clinical_pledge`, with the campaign title, version, receipt date, and secure download URL. The campaign assignment remains the canonical tracking record; the student profile is a convenient view of the same stored file, not a duplicated upload.

## Permissions and Navigation

- `student_policies.view`: view campaigns, progress, exports, and authorized scans.
- `student_policies.manage`: upload versions, publish campaigns, record receipt, and attach scans.

Both permissions appear in the permission matrix under `Student Policies and Acknowledgements`. The sidebar entry appears under student and clinical administration when either permission is granted. Public student routes require campaign-scoped OTP access rather than staff permissions.

## Security and Audit Rules

- Published PDFs and signed scans use private storage.
- Public IDs are random and do not replace OTP verification.
- OTPs and access tokens are stored only as hashes, expire, and are rate-limited.
- Public errors do not disclose whether a university number exists.
- Every publish, close, acknowledgement, paper receipt, correction, scan upload, scan download, and export is audited.
- The document hash captured at acknowledgement proves which immutable version was displayed.
- A published document file cannot be overwritten. Corrections create a new version and campaign.
- Signed scans are never exposed from `/storage` or a permanent public URL.
- Deleting a student cannot cascade-delete policy evidence.

## Validation and Failure Handling

- A campaign cannot publish without a PDF, version, effective date, academic year, at least one target level, and at least one eligible student.
- Duplicate document version labels are rejected for the same policy type.
- Closed campaigns reject new acknowledgements and receipt edits unless reopened by a manager.
- Uploads accept PDF or image scans up to 10 MB and use server-side MIME validation.
- Failed emails allow a controlled resend after rate-limit cooldown and provide a generic support message.
- Concurrent acknowledgement and receipt updates use transactions and row locks to avoid lost milestones.

## Reporting

The Excel follow-up register contains student number, names, level, group, document version, opened timestamp, acknowledgement timestamp, paper receipt timestamp, scan status, and follow-up note. Summary metrics are calculated from assignments rather than entered manually.

No signature image, IP evidence, access token, or private storage path is exported.

## Testing

Backend feature tests cover permission separation, campaign publication and target snapshots, OTP privacy and expiry, version-bound acknowledgement, idempotency, paper receipt, secure scan access, audit records, and export content.

Frontend tests cover permission-based navigation, campaign creation validation, progress filters, bulk receipt confirmation, student OTP flow, the mandatory paper-signature notice, acknowledgement eligibility, and mobile table usability.

Production verification includes migrations, route caching, frontend build, protected-file access checks, and a controlled test campaign assigned to test students before the real campaign is published.

## Delivery Sequence

1. Add schema, models, permissions, secure storage, and backend tests.
2. Add staff campaign and follow-up screens.
3. Add student OTP portal and acknowledgement flow.
4. Integrate signed scans into student files and add Excel export.
5. Verify with a test campaign.
6. Upload the official bilingual letterheaded PDF and publish the real campaign only after College approval.

## Explicit Non-Goals

- The system will not generate or approve policy wording.
- Electronic acknowledgement will not be represented as a handwritten signature.
- Students will not receive full system user accounts.
- The first release will not include drawn signatures or third-party e-signature services.
- The first release will not OCR signed paper copies.
