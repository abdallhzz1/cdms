# Clinical distribution change log

## 2026-10-28 — Multiple supervisors per schedule row

- A draft schedule row may contain one or more clinical supervisors.
- Each supervisor has an explicit, non-empty set of weekdays, limited to that supervisor's active work schedule at the selected training site.
- A weekday may belong to only one supervisor inside the same row, preventing ambiguous day ownership.
- `course_schedule_rows.person_id` remains the primary/compatibility supervisor so existing attendance, assessment, reporting, and published data continue to work without a destructive rewrite.
- The additional supervisors and their weekdays are stored in `course_schedule_row_supervisors`; the migration does not update or republish existing schedules.
- Published and withdrawn versions remain immutable. The configuration can only be changed in an editable version, and supervisor rows are copied when a revision is explicitly created.
- Decision source: user request on 2026-10-28. Affects the clinical distribution schedule editor and revision copying.
