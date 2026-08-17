# Phase 7C User Acceptance Test

## Development demonstration setup

This dataset is fictional and is available only in a local/development environment. Before rebuilding it, set `DEV_ADMIN_EMAIL` and `DEV_ADMIN_PASSWORD` in `backend/.env`. Then run:

```powershell
php artisan cdms:demo-reset
```

The command refuses non-development environments, asks before deleting the local database, and recreates the complete predictable demonstration dataset. Sign in using the values in the local environment file. Never copy those credentials to frontend code or production documentation.

## Checklist

- [ ] Reset the local demo environment and sign in as the development administrator.
- [ ] Confirm the dashboard shows student coverage, active rotations, actionable unassigned/capacity alerts, and quick actions.
- [ ] Open Students; search, filter by the available controls, paginate, and confirm Arabic/English names, university number, academic year, group, and status are readable.
- [ ] Open Departments and Training Sites; search and confirm loading, empty, error/retry, and pagination behavior.
- [ ] Open Supervisors and confirm capacity and active status are readable without raw record IDs.
- [ ] Open Clinical Distribution; review the suggested distribution, modify an assignment, validate it, and inspect conflicts/unassigned students.
- [ ] Approve an eligible distribution, publish it after reviewing the confirmation, and confirm it appears as the current clinical schedule.
- [ ] Confirm the older published version is not used by the operational schedule.
- [ ] Confirm dashboard capacity indicators show an over-capacity site, a full site, and a near-capacity site; confirm a supervisor workload warning is present.
- [ ] Reassign a supervisor on a published assignment and confirm the audit history records the action.
- [ ] Generate the available operational reports and verify export downloads.
- [ ] Switch to Arabic: confirm all visible labels, status text, controls, tables, and direction are RTL.
- [ ] Switch to English: confirm the same surfaces are translated and direction is LTR. Refresh and confirm preference persists.
- [ ] Test desktop, tablet, and mobile widths. Confirm navigation remains available and tables scroll only inside their table container.
- [ ] Test an empty database/page filter and an unavailable backend request. Confirm helpful empty/error states and Retry, without technical API, SQL, or database messages.
- [ ] Test a restricted user: actions and report navigation without permission must be hidden; backend authorization must still deny direct calls.
- [ ] Log out and confirm protected pages redirect to sign in.

## Expected demo inventory

- Four academic years: 2023/2024 through 2026/2027.
- 216 fictional students across Years 4–6, with Arabic and English names and group membership.
- 20 clinical supervisors, 10 active demonstration users, 9 clinical departments, and 10 training sites.
- Current published, superseded published, and suggested distribution versions.
- Twelve intentionally unassigned students, plus intentional near/full/over site-capacity and supervisor-workload scenarios.
