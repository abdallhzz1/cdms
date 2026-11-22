# Supervisor profiles, excuses and administrative follow-up

Change request: 2026-11-22. Supervisors may submit their own excuses. Authorized
staff may submit excuses, record absence/administrative notes, and upload files
on their behalf. Review is performed by another authorized user.

## User flow

- A supervisor opens **My Excuses & Follow-up** from the sidebar. The existing
  **My Profile** professional record remains available, sharing the same
  professional documents, biography, publications and conferences.
- Staff open **Hospitals & Supervisors → Follow-up & excuses** for the review
  inbox, or open a supervisor profile and its **Follow-up and excuses** tab.
- An excuse starts as `submitted`. An authorized reviewer records `approved`
  or `rejected` with a mandatory review note. A reviewed excuse cannot be
  reviewed again. The author and subject cannot review their own submission.
- Absence, notes and administrative files are recorded as `recorded`; they do
  not modify the work schedule, grades or performance calculations.
- Excuses and their decision are visible to the subject. Other administrative
  records are internal by default and have an explicit sharing checkbox.
- Internal files are distinct from the supervisor's editable professional
  documents, so they cannot be removed through My Profile.
- Notifications are stored in the application's notification center. New
  excuses notify eligible, scoped reviewers. Review decisions notify the
  subject and, for on-behalf submissions, the author.

## Permissions

All appear under **Supervisor Profiles, Follow-up and Excuses** in the matrix.

| Code | Purpose |
| --- | --- |
| clinical_supervisors.view | Directory and profile access |
| clinical_supervisors.update | Professional and official profile fields |
| supervisor_documents.view | View/download professional documents |
| supervisor_documents.upload | Upload professional documents on behalf |
| supervisor_documents.delete | Delete professional documents |
| supervisor_records.view | View scoped administrative records |
| supervisor_records.create | Add administrative records and submit on behalf |
| supervisor_records.review | Approve/reject excuses |
| supervisor_records.delete | Remove an administrative record with a reason |

Initial grants: Clinical Director has all nine permissions; RTA has profile
view, professional document view/upload, record view/create/review; Administrative
Assistant has profile view/update, professional document view/upload and record
view/create. Other grants are configured in the matrix. Existing grants are
preserved. A supervisor's self-service excuse submission does not grant access
to colleagues or internal notes. Existing people.manage grants retain their
professional profile/document access, without granting administrative review.

Staff access consistently applies department/cohort boundaries on directory,
profile, record, download, mutation and notification recipient selection.

2026-11-22 correction: RTA access follows the assigned cohort across all
departments, independent of the assistant's administrative department. Cohort
links include primary and shared supervisors on schedule rows before student
enrolment, as well as legacy student assignments. Department heads retain their
department boundary; an RTA without an assigned cohort receives no cohort access.

## Storage and history

Migration `2026_11_22_150000_create_supervisor_followup_records` creates two new
tables and seeds additive permission grants. No existing documents are moved.
Attachments are private local-storage files, limited to five files per record,
10 MB each, using the existing content/MIME validation service. File metadata
never exposes storage paths. Downloads require record ownership or scoped staff
permission. Creation, review, profile/document operations and record deletion
are audited. Record deletion is soft deletion; files/history are retained and
are unavailable through ordinary download endpoints after deletion.

Run `php artisan migrate --force` when deploying; no npm installation on the
server is needed because compiled frontend assets are committed. Publish the
new frontend through the existing cPanel deployment configuration.

## Verification

Feature tests cover self submission with attachments, on-behalf submission,
independent review, duplicate-review rejection, internal-note/file privacy,
professional-document permissions and shared metadata consistency, soft
deletion/audit, department/cohort boundaries and scoped notifications.
Frontend tests cover excuse submission, expandable review inbox, staff profile
capabilities, upload result handling, retryable loading errors and authenticated
file requests. Existing profile, directory, workforce and supervisor-evaluation
tests are also exercised.
