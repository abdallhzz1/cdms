# Migrations — intentionally empty in Phase 1 (Foundation)

No business tables (students, staff, courses, distribution, grades, quality,
correspondence, etc.) are created in this phase — see `PROJECT_RULES.md` and
`Prompt 01 §8/§27`. The full ~84-table schema is implemented in a dedicated
database phase, built from `Clinical_Department_ERD_Database_Architecture_v1.xlsx`.

Running `php artisan migrate` in Phase 1 creates only Laravel's own internal
`migrations` tracking table — this is enough to prove the configured database
connection works end-to-end (see `GET /api/v1/health`), without inventing any
CDMS business schema ahead of its approved design phase.
