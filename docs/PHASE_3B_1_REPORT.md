# Phase 3B-1 Report: Clinical Structure Foundation

## Objective
Establish the core domain models for clinical rotations to serve as the foundation for the Clinical Distribution Engine in the upcoming Phase 3B-2. The scope was strictly limited to schema design, relationships, CRUD API endpoints, and validation, as dictated by the canonical ERD and Data Dictionary. No automated student distribution logic was implemented.

## Completed Work

### 1. Database Architecture
Four new tables were created in precise alignment with the Phase 3A/3B reference materials:

- **`rotations`**: The primary entity representing a clinical period (e.g., "Period 1", "First Trimester"). Fields include `academic_year_id`, `code`, `name`, `academic_level`, and `status`.
- **`rotation_blocks`**: Child entity of `rotations`, representing the specific weeks that comprise a rotation (e.g., Block B1 from week 1 to 4).
- **`department_rotation`**: A pivot table satisfying the M:N requirement between Rotations and Departments (many rotations serve multiple departments simultaneously).
- **`site_capacity_rules`**: A pivot/capacity table serving as the M:N relationship between Rotations and Training Sites, providing `max_students` rules for future distribution logic.

### 2. API Endpoints
A full suite of RESTful endpoints was built and registered in `routes/api.php` following the Phase 3A API Envelope:

- `GET /api/v1/rotations` (List with filters)
- `POST /api/v1/rotations` (Create rotation with nested blocks and departments)
- `GET /api/v1/rotations/{rotation}` (Show rotation with eager-loaded relationships)
- `PUT /api/v1/rotations/{rotation}` (Update rotation, syncing blocks and departments atomically)
- `DELETE /api/v1/rotations/{rotation}` (Delete rotation)

### 3. Permissions & Authorization
The following permissions were added to `Phase3PermissionSeeder` and enforced via `Gate::authorize()` via API route middleware:
- `rotations.view`
- `rotations.create`
- `rotations.update`
- `rotations.delete`

These permissions match the existing module conventions and are seeded explicitly without polluting production roles (other than `SYS_ADMIN` in tests).

### 4. Testing & Stability
- A new `RotationTest.php` suite was created with complete coverage for the new endpoints.
- The entire project test suite was verified: **65 tests passed (158 assertions)**.

## Outstanding Items for Phase 3B-2
With the foundation built, the next phase can safely introduce:
1. **Clinical Distribution Engine**: Algorithm logic to assign students to `rotation_blocks` while respecting `site_capacity_rules` and `department_rotation` constraints.
2. **Student Rotations (Pivot)**: Tracking individual individual assignments to rotations.
