# Clinical period dates by academic level

## 2026-10-29 — Independent dates for fourth, fifth and sixth year

- A clinical period remains one logical record (`P1`, `P2`, and so on) for stable reporting and filtering.
- Each period now has an independent date range and week count for `fourth`, `fifth`, and `sixth` in `clinical_period_level_dates`.
- The migration copies every existing period date to all three levels. It does not update rotations, distribution versions, attendance, assessments, or publication state.
- `rotations.start_date` and `rotations.end_date` remain the immutable operational dates for existing schedules.
- Creating a new period-scoped distribution is validated against the selected academic level's dates, not the compatibility envelope stored on `clinical_periods`.
- Updating calendar dates never realigns an existing rotation automatically. Historical or published schedules require their existing explicit revision workflow.
- Period overlap is checked independently within each academic level.
- Decision source: user request on 2026-10-29. Dates will be entered by authorized staff from the academic calendar screen.
