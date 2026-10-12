# Flexible clinical assessment plan

The course detail screen owns the official 100-point split. Clinical and written
components are required; final OSCE may be zero. A course can therefore use
20 clinical + 0 final OSCE + 80 written. Legacy courses keep their existing
weights, weekly assessment frequency, and shared final-OSCE entry until an
authorized manager changes the plan.

The clinical component can use one supervisor assessment every week or one
assessment per training period. Consecutive one-week distribution blocks for
the same rotation, subgroup, supervisor, site and cohort form a single period;
an explicit multi-week block and a gap start separate periods. The supervisor
sees one group per such period, and the review matrix has one period column.
The supervisor's
entry scale may be /10 or the clinical component's direct maximum. Saved
assessments retain their original entry maximum so historical marks are
normalized correctly.

Mini OSCE is optional and is recorded once per student and training period by
an assigned clinical supervisor. Its configured maximum is part of the
clinical share, not an additional grade component. For example, with clinical
/20 and mini OSCE /5, the mean of the period's submitted supervisor
assessments contributes /15 and the mini OSCE contributes /5. The student's
clinical mark is the mean of completed period marks. Every currently assigned
period needs both a supervisor assessment and a mini OSCE before the official
clinical mark becomes available.

Final OSCE entry is configured independently: research/teaching assistant,
clinical supervisor, or a supervisor panel. In panel mode, one assigned
supervisor records the agreed course-level mark; no electronic approvals from
the other supervisors are required. The recorder and assigned supervisor
snapshot are retained in the grade record and audit log. When final OSCE is
zero, it is omitted from the entry screen and treated as zero in the grade
sheet.

Users with `assessment.review` can inspect final OSCE on the existing clinical
assessment review screen. Its separate tab shows one mark per assigned student,
course and academic year, grouped by subgroup, including missing marks, the
course maximum, the recorder when known, and the *grade-sheet* status. It is
read-only; this status is not an independent OSCE approval. It uses the same
published-assignment, course and student access boundaries as the weekly
assessment review. Mini OSCE remains visible in each period's assessment
details.

Changing course weights after grade entries exist, or changing assessment
frequency/mini OSCE share after clinical assessments exist, is rejected to
avoid retroactive regrading. Changing the mini OSCE share after mini marks
exist or the final OSCE owner after final marks exist is also rejected.

Deploy the backend migration `2026_10_04_110000_add_flexible_clinical_assessment_plan`
before serving the new frontend. Do not run tests against production data;
feature tests use a separate testing database.

## Distribution revisions and official marks

Only a student assignment in the **current published distribution version**
can supply a clinical assessment or mini OSCE to the supervisor workspace,
review screens, reports, and grade calculation. The evaluator must still be
the supervisor assigned to that student. When a new revision is published,
saved clinical and mini-OSCE marks on an *unchanged* student, supervisor,
rotation block, training site, subgroup and department are relinked in the
same publication transaction, preserving their mark IDs and scores with an
audit log. If any scored assignment changed or a target mark would conflict,
publication is rejected before superseding the current version. A changed
supervisor's historical mark is never silently reused. Duplicate
current-version records for the same student, doctor,
course rotation and evaluation slot display/count only the latest official
entry; older records remain available in the database for investigation.

Post-publication supervisor reassignment, membership sync, unpublication and
schedule deletion also refuse changes that would hide or detach saved marks.
Membership sync preserves the assignment ID for unchanged placements. A
supervisor batch sends a UUID receipt and the UI reads the saved records back
from the server before claiming the submission was verified. If read-back
fails, the UI warns that the marks may already be saved and asks for a refresh
before retrying. The mini-OSCE entry similarly reads back its current mark.

Run `php artisan clinical:audit-assessment-continuity` to scan *all*
superseded published distributions for submitted clinical or mini-OSCE marks
hidden despite an unchanged current assignment. It is read-only and returns
a nonzero exit code when such marks exist. `--details` also lists marks with
changed assignments or a current replacement. This audit identifies older
issues; it never relinks data automatically.

Migration `2026_10_11_100000_version_clinical_mini_osce_scores` adds a
distribution-version key to mini-OSCE marks. A pre-migration mini mark is
attributed to a version only when its student, block and entering supervisor
identify exactly one published version. Ambiguous marks remain unversioned
and cannot be used as current marks automatically; they require human review
and re-entry by the currently assigned supervisor. Do not delete those rows.

A submitted grade sheet is checked against the current calculated clinical
score at every approval step. A mismatch or missing current score blocks
approval; the grade roster flags the affected students. Previously approved
grade entries are not silently rewritten and need administrative review if a
later distribution revision changes their official clinical scores.

### Explicit recovery of an unchanged supervisor assignment

`php artisan clinical:restore-assessments EMAIL FROM_VERSION TO_VERSION`
previews saved marks without changing data. It is intended only for a direct
published revision when the student, supervisor, rotation block, training
site, subgroup, and department are unchanged. Any existing mark in the
current version, ambiguous match, out-of-block week, or approved grade entry
blocks the *whole* apply operation. The command cannot reconstruct a week
for which no saved assessment exists.

If a supervisor has both unchanged and changed assignments in the old
version, append `--only-ids=ID1,ID2,...` to preview and restore only the
explicitly reviewed assessment IDs. Every ID must belong to the specified
evaluator and source version; missing, repeated, blocked, or extra records
abort the apply transaction. Do not include marks whose current assignment
has a different supervisor or already has a current mark.

After reviewing the preview and taking the normal database backup, an
operator may run the same command with `--apply --expect=N
--actor-email=OPERATOR_EMAIL`. The exact count is mandatory. Inside a single
transaction it changes only the assignment link; the assessment ID, score,
evaluator, status and original submission time remain unchanged. Each relink
gets an `assessment.assignment_relinked` audit entry containing both version
and assignment IDs. A failed check rolls back everything. This is an explicit,
audited recovery of an unchanged assignment, not automatic reuse of a former
supervisor's mark after reassignment. Mini-OSCE scores are not changed by this
command.
