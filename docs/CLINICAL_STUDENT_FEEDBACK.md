# Clinical student assessments and confidential feedback

Student link: `/portal/clinical-assessments`. Staff workspace: `/clinical-student-feedback`.

## Enabling a course

The clinical director initially has configuration, publication, summary, comment and moderation permissions. Dean/Vice Dean have summary and redacted-comment access. Quality has summary, redacted-comment and moderation access. Technical administrators receive no automatic feedback access. The administrator can change these grants under **Clinical Student Feedback** in the permission matrix, including individual permissions through the existing user tools. Permission revocation is enforced on every API request.

1. Open the staff workspace, select the course/year/cohort/period, then **Access and publication**.
2. Enable that rotation from the desired assessment week. Every rotation starts disabled; the migration enables none. Previously configured rotations remain in the staff selector for historical review even after unpublication.
3. Publish official marks for a selected week range after reviewing them in the existing assessment review. Draft, returned, missing, future and superseded marks are excluded. Period-based courses use the period ending in that range. Mini-OSCE and final OSCE are outside this release channel.
4. Share the student link. No QR, new student account, or password is required.
5. After the full training period and rescheduled weeks end, release eligible feedback batches. Each slot/supervisor batch needs five responses. Publication is a manual staff action, not a live feed.

## Student flow

The portal always verifies an emailed one-time code independently of `GROUP_REGISTRATION_OTP_ENABLED` and the schedule portal. Changing that test setting cannot bypass grade authentication. Only active, academically registered clinical students are eligible. An unknown/ineligible number receives the same response shape. Codes expire after ten minutes and five failed attempts; successful codes cannot be replayed. Mail failure consumes the challenge and logs only the exception class. The configured student university email domain is reused.

The grade cookie is encrypted independently of Sanctum, HttpOnly, SameSite=Lax, secure in production, and restricted to the student API path. The normal cookie is browser-session scoped with an eight-hour server expiry. Optional remembering lasts thirty days. Sign-out revokes it on the server; changing eligibility also prevents access. Public requests enforce exact same-origin and a non-simple custom header on mutations, independently of Sanctum's domain configuration. No grade/session tokens appear in URLs or local storage.

A student sees only their own current published course assignments. They choose a course/period and an assessment slot. Two short ratings are required; each can explicitly be “Unable to assess” (stored as null, never as zero rating). Free text is optional. Participation can precede mark entry once a slot ends and its supervisor is unambiguous. Replies are immutable and are not retrieved by student endpoints.

The server omits the mark entirely until participation and official mark publication are both complete. It never sends the internal supervisor notes, criteria, other students or assessment records. A corrected/returned/superseded mark is hidden until an eligible current mark is republished. The same logical slot's participation stays complete, so correction/republication does not request another reply. Weekly keys survive distribution version changes within a rotation. All student and staff feedback responses are private/no-store.

## Confidentiality and reporting

Participation is a separate student/rotation/slot/day ledger. Answers have random UUIDs, slot and assigned-supervisor context, two ratings and encrypted free text. They contain no student ID/number, grade ID, participation ID, respondent hash, device, IP or precise timestamp; no key connects the two records. Student participation is not added to the staff audit feed. This is application-level separation and controlled disclosure, not a claim of cryptographic anonymity against database administrators, backups, database transaction logs or self-identifying writing. Privileged infrastructure access remains governed by the institution's security policy.

Reporting is frozen in batches of at least five students **for the same slot and supervisor**, so one student's five different weeks never meets the threshold. Late replies wait for another qualifying batch; they do not change already released statistics one at a time. An average is suppressed unless five students in that batch answered that question numerically. Low-response slots remain unavailable; a student's own mark access does not depend on their classmates participating. There are no participant-name lists, exact reply times, per-student drill-downs, exports or delete endpoints.

Reviewers cannot access batches/comments about their own linked person, even if they hold multiple administrative roles. Course/department and RTA cohort scope also apply. Moderators can read originals only in released batches, remove identifying details, and explicitly save a redacted copy for comment readers. Empty redacted copies stay hidden. Concurrent moderation is protected by a version fingerprint so stale edits cannot overwrite a newer redaction. Originals remain encrypted; audit entries record the action and status, never comment contents. Text renders as plain React text, never HTML. Urgent concerns use the department's separate direct channel and should not wait for delayed feedback reporting.

Published mark/participation history prevents directory force deletion of that student; schedule deletion also refuses to erase feedback history even when no mark has been entered. Empty configuration windows cascade with an otherwise deletable schedule; changing their status is supported. Ephemeral authentication records cascade on deletion of an otherwise deletable student. Disabling a window hides its student portal records without rewriting academic data or feedback. Historical records remain retained; rollback of the migration is deliberately blocked to avoid dropping confidential academic evidence.

## Operations and validation

Run the additive migration before deploying the compiled frontend. There is no backfill and no grading formula, existing supervisor dashboard or assessment-entry workflow change. Existing SMTP delivery and HTTPS must be working. The student page uses one column, touch-sized controls and 16px inputs to prevent iOS focus zoom; Arabic/English and narrow phone/tablet/desktop layouts are checked with synthetic data.

`clinical-portal:prune` removes challenges expired for two days and sessions expired/revoked for thirty days. It is scheduled daily at 03:45 through the existing Laravel scheduler; academic records and feedback are retained. Limits distinguish challenge/student-cookie buckets and permit a shared classroom network, while code verification also has a database attempt limit.

Feature tests cover authentication, real encrypted cookie round trips without Sanctum domain assumptions, revocation/expiry, shared-network limits, cross-student keys, CSRF origin/port restrictions, duplicate requests, grade gating, corrections, historical/future marks, bulk publication query growth, period-based marks, encrypted identity-free answer schema, distinct-participant batching, suppressed small averages, self-review denial, scope, raw/redacted permissions, safe deletion and credential cleanup. UI tests cover required short answers, optional text/remembering, retries preserving answers, keeping the selected week after submission, and restricted reviewer controls. These are local automated and synthetic browser checks, not a claim of a production penetration test or a production load benchmark.
