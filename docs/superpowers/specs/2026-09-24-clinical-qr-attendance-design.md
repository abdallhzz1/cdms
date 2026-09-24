# Clinical QR Attendance Design

**Date:** 2026-09-24  
**Status:** Approved concept, implementation specification pending final user review

## 1. Objective

Add a secure, mobile-first QR attendance workflow for clinical training without creating student user accounts. A clinical supervisor manually controls the attendance session phases, while students verify their identity once, scan a short-lived QR using the live camera, and record check-in and check-out times. The existing attendance records remain the authoritative source for reports, warnings, dashboards, and manual review.

The system does not use geolocation and does not open attendance automatically from the academic schedule.

## 2. Scope

This feature includes:

- supervisor-controlled check-in and check-out phases;
- a QR value that rotates every 15 seconds without supervisor interaction;
- a public student scanner that uses the live camera only;
- student identification through the existing university-email OTP flow;
- optional trusted-browser access for 30 days using the existing secure schedule cookie pattern;
- server timestamps for check-in and check-out;
- automatic final attendance classification when the supervisor finalizes the session;
- manual exception handling with a mandatory reason and audit trail;
- live supervisor counts and student status updates;
- visibility in the existing attendance review screen and exports;
- dedicated permissions and rate limits.

Out of scope:

- GPS or geofencing;
- automatic opening from scheduled shift times;
- offline attendance recording;
- biometric or facial verification;
- selecting or uploading a QR image from the student's gallery;
- a full student login account.

## 3. Roles and access

### Clinical supervisor

The supervisor may manage QR attendance only for an active published assignment that belongs to them and only for students in that assignment's group. The workflow requires `supervisor.workspace.view` and `attendance.record`.

### Attendance reviewer

Users with `attendance.review` may inspect finalized records, timestamps, recording method, exceptions, and audit history within their existing scope.

### Student

The student uses a public page. Identity is established through university number plus email OTP, then optionally remembered in an HttpOnly secure cookie for 30 days. The public scanner never exposes another student's information.

## 4. Session state machine

One QR attendance session represents one supervisor assignment, group, training site, and calendar date. Its state is one of:

1. `check_in_open`
2. `check_in_closed`
3. `check_out_open`
4. `finalized`

Allowed transitions:

- create session -> `check_in_open`;
- `check_in_open` -> `check_in_closed`;
- `check_in_closed` -> `check_in_open` only through an explicit reopen action with a reason;
- `check_in_closed` -> `check_out_open`;
- `check_out_open` -> `check_in_closed` only through an explicit close/reopen correction with a reason;
- `check_out_open` -> `finalized`;
- a finalized session is immutable through ordinary endpoints.

Reopening a finalized session is reserved for a separately authorized review action and requires a reason. Every transition is transactional and audited.

Only one non-finalized QR attendance session may exist for the same assignment and date. A database uniqueness rule and transactional lock prevent duplicate sessions.

## 5. Roster snapshot

When the supervisor opens check-in, the backend resolves the supervisor-owned assignment and snapshots the eligible students. This snapshot is used for the full session even if group membership changes later that day. Every snapshot row starts in `not_checked_in` state.

The snapshot prevents students added later from silently becoming absent and prevents removed students from disappearing from an active attendance session.

## 6. QR security model

The displayed QR is generated from a short-lived signed token containing only opaque identifiers and security claims:

- attendance session identifier;
- current phase (`check_in` or `check_out`);
- issued-at time;
- expiration time;
- random nonce;
- server signature.

The QR rotates every 15 seconds. The backend is authoritative: a QR is accepted only when its signature is valid, its session is open in the encoded phase, and it has not expired. A maximum 5-second grace period is allowed only for scans initiated immediately before rotation.

The QR does not contain student data and is not a public URL that records attendance when opened. It is an opaque payload accepted only by the scanner endpoint together with a verified student session.

Forwarding cannot be eliminated completely without a physical-presence factor, but the short lifetime, direct camera scanner, verified browser, group membership check, and one-operation-per-phase rules substantially reduce practical misuse.

## 7. Student identity and scanner

The public route is `/clinical-attendance`.

On page load:

- if a valid 30-day trusted-browser cookie exists, the scanner opens for that student;
- otherwise the student enters the university number and completes the existing OTP verification flow;
- after successful OTP verification, the student is offered a clear modal to remember the browser for 30 days or continue without saving;
- changing the student or removing trusted access revokes the stored server token and clears the cookie.

The scanner uses `navigator.mediaDevices.getUserMedia` and an in-page QR decoder. There is no file input, gallery picker, paste field, or manual QR entry. Camera permission errors, unsupported browsers, insecure HTTP, and unavailable cameras produce specific guidance without recording attendance.

After a successful scan, the page shows the operation, server time, group, course, and training site. It does not display group-member names.

## 8. Scan validation

The scan endpoint performs all checks in one database transaction:

1. portal and scanner are enabled;
2. the student identity or trusted-browser session is valid;
3. the QR signature and expiration are valid;
4. the QR phase matches the current session state;
5. the student exists in the immutable session roster snapshot;
6. the requested operation has not already been recorded;
7. check-out is rejected when no check-in exists;
8. the server timestamp is saved;
9. a scan event is appended to the audit log.

Repeated submission of the same successful scan is idempotent: it returns the original successful time rather than creating another record. Invalid and suspicious attempts are rate-limited and logged without exposing private information.

## 9. Attendance classification

Finalization creates or updates the existing `attendance_records` rows for every rostered student:

- check-in and check-out: `present`;
- no check-in: `absent`;
- supervisor-approved excuse: `excused`;
- check-in without check-out: stored as `present` with an explicit incomplete flag and review state, so existing absence reports are not corrupted;
- late status: set manually by the supervisor in the first release; automatic lateness is excluded because sessions and shifts are manually controlled.

The existing status list remains compatible with current reports. Additional QR metadata is stored in dedicated columns/tables rather than encoding it in free-text notes.

## 10. Manual corrections

The supervisor can correct a roster row for phone failure, connectivity problems, missing OTP, no phone, forgotten check-out, or approved compensation attendance.

Every correction requires:

- the resulting attendance status;
- a non-empty reason;
- actor user ID;
- previous and new values;
- timestamp;
- source marked as `manual_override`.

QR-derived timestamps are never silently overwritten. The audit history remains available to attendance reviewers.

## 11. Data model

### `clinical_qr_attendance_sessions`

- assignment, rotation block, site, supervisor person, and clinical session references;
- session date and state;
- check-in opened/closed timestamps;
- check-out opened/closed timestamps;
- finalized timestamp and actor;
- optimistic version number for concurrent actions;
- unique active-session constraint by assignment and date.

### `clinical_qr_attendance_roster`

- QR attendance session and student;
- check-in/check-out server timestamps;
- current outcome and source;
- incomplete flag;
- manual reason and actor;
- unique student per QR session.

### `clinical_qr_scan_events`

- session, student when resolved, phase, result code, and server timestamp;
- hashed IP and limited user-agent metadata;
- QR nonce hash, never the raw QR token;
- append-only retention for security and troubleshooting.

The finalizer maps roster rows to the existing `clinical_sessions` and `attendance_records` tables, preserving all current consumers.

## 12. Supervisor interface

The existing supervisor attendance page gains a focused QR-session workspace. The supervisor chooses one of their groups and today's date, then uses one prominent state-aware action:

- Open check-in;
- Close check-in;
- Open check-out;
- Finalize session.

The active panel shows:

- course, group, site, date, and state;
- large rotating QR and countdown;
- online/offline indicator;
- totals for roster, checked in, checked out, not checked in, and incomplete;
- compact searchable student table with check-in, check-out, outcome, and correction action;
- explicit confirmations for closing, reopening, and finalizing.

Live changes use short polling initially rather than introducing WebSockets. Polling stops when the tab is hidden or the session is finalized.

## 13. Reviewer and reporting integration

The attendance review screen continues to use `attendance_records`, augmented with:

- check-in and check-out times;
- `qr` or `manual_override` source;
- incomplete indicator;
- supervisor/session details;
- correction reason and audit access.

Existing attendance warnings continue to depend on final statuses only. QR scan attempts do not affect warnings until the supervisor finalizes the session.

Excel/PDF exports include the new timestamps and source fields when available while retaining compatibility for older manual records.

## 14. Error handling and recovery

- Loss of supervisor connectivity freezes the displayed QR and clearly marks it inactive.
- The student receives success only after the server commits the scan.
- No offline queue is used.
- A stale QR receives an expiry message and the camera remains open for the next code.
- A wrong group receives a generic rejection without group-member information.
- Closing a phase invalidates every QR from that phase immediately.
- An abandoned non-finalized session remains recoverable by the owning supervisor and is visibly flagged.
- Finalization is atomic: either all attendance rows are written or none are.

## 15. Security and privacy

- all public endpoints are rate-limited;
- trusted-browser tokens and QR nonces are stored only as hashes;
- trusted-browser cookies are `HttpOnly`, `Secure` in production, `SameSite=Lax`, and expire after 30 days;
- server time is authoritative;
- raw OTPs and raw QR tokens are never logged;
- public responses reveal no other student details;
- camera access occurs only after a user gesture and over HTTPS;
- audit records retain only limited security metadata needed for investigation.

## 16. Testing and acceptance criteria

Backend feature tests must cover:

- supervisor ownership and permission checks;
- state transitions and forbidden transitions;
- duplicate-session concurrency protection;
- roster snapshot behavior;
- valid, expired, tampered, wrong-phase, and wrong-group QR scans;
- idempotent repeated scans;
- check-out without check-in rejection;
- trusted-browser and OTP authentication paths;
- finalization classification and atomic rollback;
- manual override audit requirements;
- preservation of existing attendance reports and warnings.

Frontend tests must cover:

- supervisor state-aware actions, rotating QR, countdown, and live counts;
- camera-only scanner with no gallery input;
- OTP and trusted-browser flows;
- clear success and rejection states;
- mobile layouts and keyboard/screen-reader accessibility;
- recovery after expired QR and network failures.

The implementation is accepted when a supervisor can complete the entire four-action workflow, students can check in and out from the camera-only public scanner, finalization correctly populates current attendance reporting, and the existing attendance and supervisor test suites remain green.

