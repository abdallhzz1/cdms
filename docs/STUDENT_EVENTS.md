# Student events / فعاليات الطلبة

The `/events` workspace schedules faculty conferences, seminars and lectures for fourth-, fifth- and sixth-year students. It is separate from clinical university lectures and does not alter clinical or basic-science attendance totals.

## Workflow

1. Staff with `student_events.manage` create a bilingual draft (both titles and locations are required), select the eligible years, event time and check-in window. New drafts appear in the Drafts tab.
2. Publishing makes the event eligible for check-in. Staff with `student_events.attendance.manage` display its rotating QR code **during the configured window**. The code changes every 15 seconds and expires after 20 seconds, with a five-second clock grace period.
3. A student scans the displayed QR with their phone camera. The server validates the signed code and issues a random, 15-minute scan intent bound to an HTTP-only browser cookie. On their first verified visit the student enters their university number and a six-digit code mailed to their university address; a separate trusted, HTTP-only browser cookie lasts 30 days. Subsequent event scans on that browser check in directly. The server rechecks active academic registration and event year eligibility. A unique database key prevents duplicate attendance per student/event.
4. The event register lists check-ins and their source, allows paginated review and CSV export. Authorized staff may add or void an attendance record only with a documented reason; both actions are audited. Voided records stay in the database and can be corrected again.
5. An empty draft can be permanently deleted. Published events are archived instead, preserving their registers and administrative audit history. Archived events are visible in the Archive tab.

## Permissions and safeguards

- `student_events.view`: list, details, register, CSV export.
- `student_events.manage`: create, edit, publish, archive, delete empty draft.
- `student_events.attendance.manage`: display rotating QR and correct attendance.

The migration grants these three permissions to SYS_ADMIN, CLINICAL_DIRECTOR and RTA on existing installations; system admins can adjust the matrix. Browser controls are presentation-only: every protected endpoint enforces the permission server-side. The public endpoint never trusts a typed university number by itself and does not expose the attendance register.

After any attendance is recorded, the event time, check-in window and eligible years cannot be changed. Titles and locations can still be corrected with an audit entry. A scan intent created while the window is open remains usable for at most 15 minutes so the email verification step cannot make a student miss check-in by a few minutes.

The QR is a proximity aid, not a proof of physical presence: a live image of it could be shared during its very short lifetime. Staff should keep the display in the event room and close check-in at the appropriate time.

Event-specific rate limits allow a full hall behind one campus network address while limiting repeated OTP requests by university number, failed verification by challenge and scans by verified device.
