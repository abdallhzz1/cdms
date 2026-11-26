# Architecture Decision Log — continued

Continues the ADR numbering started in the ERD workbook
(`Clinical_Department_ERD_Database_Architecture_v1.xlsx`, `Architecture_Decisions`
sheet, ADR-001–ADR-010) and `ARCHITECTURE.md` (ADR-011, Inertia rejected).
New decisions made while building each phase are appended here rather than
starting a second, competing log — see `PROJECT_RULES.md` §12.

## ADR-012 — Laravel 12, PHP 8.3+ minimum

**Decision:** Backend targets Laravel `^12.0` on PHP `^8.3` (composer.json).
**Rationale:** Matches the approved stack (PROJECT_RULES.md/ARCHITECTURE.md
say "PHP 8.3+"); Laravel 12 is the current stable major at time of writing
and uses the streamlined `bootstrap/app.php` configuration style (no
`app/Http/Kernel.php`), which keeps middleware/exception-handling
registration in one readable place.
**Status:** Adopted.

## ADR-013 — Centralized exception handling via `bootstrap/app.php` closures

**Decision:** All API exception-to-JSON translation lives in one
`withExceptions()` closure in `bootstrap/app.php`, calling the shared
`App\Http\Responses\ApiResponse` helper — not scattered `try/catch` blocks
per controller.
**Rationale:** PROJECT_RULES.md §6 requires one consistent response
envelope; centralizing is the only way to guarantee that holds for every
current and future endpoint, including errors nobody wrote an explicit
handler for.
**Status:** Adopted.

## ADR-014 — Hand-rolled minimal i18n instead of i18next

**Decision:** The frontend's bilingual foundation is a small custom React
context (`src/i18n/I18nContext.tsx`) with two plain TypeScript dictionaries
(`en.ts`/`ar.ts`) and a compile-time-checked `TranslationKey` type, rather
than adding `i18next` + `react-i18next` (+ typically `i18next-browser-languagedetector`,
`i18next-http-backend`, etc.).
**Rationale:** Prompt 01 §9 explicitly asks to "keep dependencies
intentional" and avoid unnecessary libraries. At Foundation scope (a
handful of keys, two languages, no pluralization/interpolation complexity
yet, no server-delivered translations), a ~90-line context does everything
needed and gives compile-time key safety i18next's string-based `t()` does
not provide out of the box. If a later phase needs pluralization rules,
ICU message formatting, or per-namespace lazy loading, revisit this
decision then — the migration path is a drop-in replacement of
`I18nContext`'s internals; the `useI18n()`/`t()` call sites would not need
to change.
**Status:** Adopted for Phase 1; open to revisiting once translation volume
grows.

## ADR-015 — Tailwind CSS v4 (`@tailwindcss/vite`, CSS-first config)

**Decision:** Use Tailwind v4's Vite plugin and `@theme` CSS block instead
of a `tailwind.config.js` + PostCSS pipeline.
**Rationale:** Fewer moving parts (no separate PostCSS config file), and
the calm/neutral palette (`ARCHITECTURE.md`/`PROJECT_RULES.md` §8 design
direction) is naturally expressed as a handful of CSS custom properties in
`src/styles/index.css`.
**Status:** Adopted.

## ADR-016 — SQLite for the automated backend test suite; MySQL for dev/production

**Decision:** `phpunit.xml` configures `DB_CONNECTION=sqlite`,
`DB_DATABASE=:memory:` for the test environment only. `.env`/`.env.example`
and every non-test environment use MySQL, per the approved stack.
**Rationale:** This is standard Laravel practice: an in-memory SQLite
database makes the test suite fast and fully self-contained (no shared
test database to reset between runs), while the actual health-check logic
(`DB::connection()->getPdo()` + a live query) is driver-agnostic — it
exercises the exact same code path against whichever connection is
configured. Prompt 01 §23 ("the health endpoint must actually test the
configured MySQL connection") is satisfied at runtime in every real
environment; the test suite's job is to verify the *logic*, not to
re-prove that MySQL itself is reachable from CI.
**Status:** Adopted.

## ADR-017 — No Sanctum/Passport package added yet

**Decision:** No authentication package (`laravel/sanctum`, `laravel/passport`,
or similar) is included in `composer.json` for Phase 1.
**Rationale:** Prompt 01 §3 explicitly excludes authentication from this
phase ("Authentication and authorization will be implemented in a separate
phase"). Adding the package now without wiring it up would be dead
dependency weight and could bias the later phase's design before it is
actually scoped.
**Status:** **Superseded by ADR-019 item 1** (Phase 2). The revisit this ADR
called for has happened: the authentication phase scoped Sanctum's SPA
cookie/session mode, so `laravel/sanctum` is now a real, wired dependency in
`composer.json` rather than dead weight. The reasoning above is retained as
the record of why Phase 1 deliberately shipped without it — it is no longer
a description of the current codebase.

## ADR-018 — Bugs found from the first real local test run (post-delivery fix)

The Phase 1 report was upfront that nothing had been executed with real
dependencies installed (§0/§11 of that report). The first actual local run
(`npm run test`, `php artisan test` on Windows) surfaced two real bugs,
fixed here:

1. **Frontend: `@/*` path alias not resolved at runtime.** `tsconfig.app.json`
   declares `"@/*": ["./src/*"]`, which satisfies the *type checker*, but
   Vite/Vitest do their own module resolution independently of
   `tsconfig.json` — they need a matching `resolve.alias` in
   `vite.config.ts`, which was missing. Every file importing something via
   `@/...` (i.e. anything pulling in `App.tsx`) failed to resolve at
   dev/test time even though `tsc` was silent about it. **Fixed** by adding
   `resolve.alias` to `vite.config.ts`.

2. **Backend: `RefreshDatabase` + a mid-test connection swap corrupted the
   next test.** `HealthEndpointTest`'s "database unreachable" test
   temporarily pointed `database.default` at a closed port to simulate an
   outage. `RefreshDatabase` wraps every test in a transaction on the
   *default* connection and rolls it back in its own teardown; with
   `default` now pointing at an unreachable host during that teardown, the
   rollback itself threw, and the still-open transaction on the original
   SQLite in-memory connection was never closed — which then broke the
   *next* test with "cannot start a transaction within a transaction".
   **Fixed** by dropping `RefreshDatabase` from this test class (there are
   no migrations in this phase for it to usefully refresh anyway) and
   adding an explicit `tearDown()` that restores `database.default` to
   `sqlite` and purges the `mysql` connection unconditionally.

3. **`@types/node` missing from `devDependencies`.** Fixing bug 1 above
   required `vite.config.ts` to import `fileURLToPath`/`URL` from
   `node:url` (the standard Vite-recommended way to resolve `@/*`). That
   needs `@types/node` for TypeScript to recognize Node's built-in
   modules, which was never added — `npm run build`'s `tsc -b` step would
   have failed on this file. **Fixed** by adding `@types/node` to
   `package.json` devDependencies. (Caught by static review, not a second
   local run — flagging in case anything still looks off once you
   `npm install` again.)

**Lesson applied:** `docs/DECISIONS.md` and `README.md` are the place this
kind of finding gets recorded, not just a chat reply — so the reasoning
survives for whoever touches this code next.

## ADR-019 — Phase 2 authentication/authorization design decisions

Five related decisions made while building the auth/authz foundation
(Prompt 02), recorded together since they interlock:

1. **Sanctum SPA cookie/session auth, not personal access tokens.**
   `laravel/sanctum` is added to composer.json and wired for its SPA mode
   only (`bootstrap/app.php`'s `statefulApi()`, `config/sanctum.php`'s
   `stateful` domain list, `config/cors.php`'s `supports_credentials`).
   `App\Models\User` deliberately does NOT use the `HasApiTokens` trait, and
   no `personal_access_tokens` migration exists: nothing in this phase
   issues a token, so the trait/table would sit unused. Add both back
   without breaking anything the day a token-based client (mobile app,
   third-party integration) is actually needed.

2. **`role_permissions.scope_type` instead of the ERD workbook's full
   `permission_scopes` table.** That table's columns (department_id,
   academic_year_id, staff_id, ...) reference Departments/Academic
   Years/Staff tables that don't exist yet. Prompt 02 §12 explicitly allows
   building "the minimal extensible foundation" instead. `scope_type` is a
   plain string (not a MySQL ENUM) read by
   `App\Services\AuthorizationService`; `resolveScope()` there is the one
   seam a future business-module phase extends — see that method's own doc
   comment.

3. **Role_Permission_Matrix column ambiguity — grants deliberately
   incomplete.** Re-verified directly against the source workbook for this
   phase (not a re-run of a lossy earlier pass): the `Role_Permission_Matrix`
   sheet has 8 unlabeled ✓/— columns for 10 actual roles, with no header
   row, legend, comment, or defined name anywhere in the workbook resolving
   which column is which role. `database/seeders/RolePermissionSeeder.php`
   seeds only the four grants stated unambiguously in prose across three
   sheets (SYS_ADMIN: users.manage, roles.manage, audit.view,
   settings.manage) and documents the rest as pending — see that file's own
   extensive doc comment, and the Phase 2 report's "Decisions Requiring
   Approval" section. This does not block Phase 2 (no business module
   exists yet to protect with the missing grants) but will block whichever
   phase builds the first business module, unless resolved first.

4. **Login failure routed through `ValidationException` (422), not a
   bespoke 401/error shape.** `AuthController::login()` throws
   `ValidationException::withMessages(['email' => [...]])` on a failed
   `Auth::attempt()`, reusing the exact same centralized handling
   `bootstrap/app.php` already has for every other form. `is_active` is
   passed as a condition INSIDE `Auth::attempt()`'s credentials array
   (rather than checked separately after a successful password match), so
   a disabled account fails identically to a wrong password — no
   account-existence or account-status disclosure (Prompt 02 §11) without
   any extra branching to get right or accidentally leak through.

5. **Permission-code-based authorization (Gate + `permission:<code>`
   middleware), no Policy classes yet.** Policies attach to specific
   Eloquent models; no business model (Student, Grade, ...) exists in this
   phase for one to protect. The `permission` Gate
   (`AppServiceProvider::boot()`, backed by `AuthorizationService`) and
   `App\Http\Middleware\EnsurePermission` are the reusable
   `can(user, permission, scope)` mechanism Prompt 02 §8 asks for. Each
   future business-module phase adds its own Policy class(es) on top of
   this foundation as real models are built — it does not replace this
   layer.

**Status:** Adopted for Phase 2. Item 3 is flagged for explicit user
sign-off, not silently treated as resolved.


## ADR-020 — Phase 1 + Phase 2 consolidated into a single canonical project

**Decision:** The two sequential implementation snapshots
(`cdms-phase1-foundation`, `cdms-phase2-auth`) are consolidated into one
canonical working project at `D:\react\hebron\cdms`, which is the only
directory future development happens in. Both snapshots are retained
untouched as read-only reference backups.

**Rationale:** Two parallel copies of the same project is an ambiguity that
gets more expensive every phase — it invites edits landing in the wrong
tree and makes "which one is current?" a question every contributor has to
re-answer. A single tree with real Git history is the normal way to carry
this forward.

**How the merge was resolved:** A file-by-file SHA-256 comparison of both
snapshots (excluding `vendor/`, `node_modules/`, and regenerable caches)
established that Phase 2 is a strict superset of Phase 1: zero files exist
only in Phase 1, and all 24 files that differ are Phase 2 evolving a Phase 1
file additively (auth wiring on top of foundation code) with no Phase 1
functionality removed. Phase 2 was therefore taken as the base wholesale,
which preserves both phases by construction rather than by hand-merging.
`frontend/package.json` is byte-identical between the two snapshots;
`backend/composer.json` differs only by the added `laravel/sanctum` require.

**Documentation consolidation:** `PROJECT_RULES.md`, `ARCHITECTURE.md`, and
the six approved `Clinical_Department_*` design documents previously sat one
level above both project folders, so the READMEs' links to
`./PROJECT_RULES.md` and `./ARCHITECTURE.md` resolved to nothing. They now
live in the project root, matching the structure the README already
documented. The raw source workbook ("بيانات الدائرة السريرية الشاملة") was
deliberately NOT moved into the repository: it is migration input containing
real department data, and `PROJECT_RULES.md` §13 forbids real personal data
in development. It stays outside the repo at `D:\react\hebron\`.

**Content changed during consolidation (no rules or architecture altered):**
the stale `Status:` metadata line in `PROJECT_RULES.md` and
`ARCHITECTURE.md` (both still claimed nothing was built), and ADR-017's
status (marked superseded by ADR-019 item 1, since Sanctum is now a real
dependency). No rule, actor, architectural decision, or business logic was
modified.

**Status:** Adopted 2026-08-14.

## ADR-021 — Phase 2 auth/authz test fixtures corrected during consolidation

**Context:** Consolidation ran the full backend suite for the first time
against a clean dependency install. Four tests failed. The Phase 2
snapshot's own `.phpunit.result.cache` records the *same* four as already
failing there, and Phase 1's records zero defects — so these are
pre-existing Phase 2 defects, not consolidation damage.

**Finding: both were test-harness bugs. No production defect existed.**
Verified with a throwaway diagnostic test (written, run, deleted — not part
of the suite):

1. `AuthorizationMiddlewareTest` (3 errors,
   `Call to undefined method User::withAccessToken()`) used
   `Sanctum::actingAs($user)`. That helper builds a `TransientToken` and
   calls `withAccessToken()`, which only exists on the `HasApiTokens`
   trait — a trait ADR-019 item 1 *deliberately* omits, because this
   application is Sanctum SPA cookie/session mode and never issues a token.
   The fixture could therefore never work by construction, and the tests
   died during setup **without ever reaching the middleware they existed to
   test** — meaning Prompt 02 §30's authorization cases 7-9 had never
   actually executed. Swapped to `$this->actingAs($user, 'web')`, the guard
   Sanctum's request guard delegates to for stateful requests, matching what
   `AuthenticationTest` already did and documented.

2. `AuthenticationTest::test_user_can_logout` (1 failure, `/auth/me`
   returned 200 instead of 401 after logout) — `auth:sanctum` is an
   `Illuminate\Auth\RequestGuard`, which memoizes the user resolved on its
   first call for the lifetime of that guard object. In production this is
   invisible: every HTTP request builds a fresh container and a fresh
   guard. Inside one test all three calls share one container, so the third
   request was served the user cached by the first. `AuthController::logout()`
   itself is correct — the diagnostic confirmed `Auth::guard('web')->check()`
   is false and `user()` null immediately after it runs. Added
   `$this->app['auth']->forgetGuards()` (what a real subsequent request does
   implicitly) plus an `assertGuest('web')` that checks server-side state
   directly rather than inferring it from a status code.

**Not changed:** no production authentication, authorization, model,
middleware, service, route, or config file was modified. The changes are
confined to two files under `tests/`. The authorization design
(Role + Permission + Scope, backend-enforced) is exactly as Phase 2 shipped
it — it is simply now actually covered by executing tests.

**Result:** 16 passed, 66 assertions, 0 failures.

**Status:** Adopted 2026-08-14.

## ADR-022 — vite.config.ts typing fixed so the production build compiles

**Context:** Consolidation ran `npm run build` for the first time. It failed
at the `tsc -b` step with TS2769: "'test' does not exist in type
'UserConfigExport'". `vite.config.ts` is byte-identical in both phase
snapshots, so the production build had never succeeded in either — the
Phase 1 report's ADR-018 item 3 anticipated a `tsc -b` failure in this exact
file and fixed a different cause (`@types/node`), evidently without a
follow-up build run. `npm run test` and `npm run typecheck` both passed
throughout and still do, which is why this went unnoticed: Vitest reads the
config regardless of its typing, and `tsc --noEmit` on the root tsconfig
does not include this file — only `tsc -b` (via tsconfig.node.json) does.

**Root cause:** a genuine duplicate Vite install, not a typo. The project
depends on `vite@6` (6.4.3 installed) while `vitest@2.1` peer-depends on
`vite@5` and therefore gets its own nested copy (5.4.21 under
node_modules/vitest). Vitest's `test`-key module augmentation targets the
copy Vitest resolves, never reaching the `UserConfig` the project actually
builds against. The obvious alternative — importing `defineConfig` from
`vitest/config` — was tried and is worse: it drags the other copy's types in
wholesale, making every plugin structurally incompatible (`Plugin<any>` vs
`Plugin<any>` from two module paths).

**Decision:** declare the Vitest options' shape locally and type the config
as `UserConfig & { test: VitestOptions }`, assigned to a variable before
being passed to Vite's own `defineConfig`. Typing it as a variable rather
than an inline literal is what sidesteps TypeScript's excess-property check.
This avoids crossing the two Vite copies entirely while keeping the four
options actually used type-checked.

**Deliberately NOT done:** upgrading `vitest` to a release that shares
`vite@6`, which would remove the duplicate and let the idiomatic
`vitest/config` import work. That is a dependency-version decision with test-
behavior implications, out of scope for a consolidation task whose brief was
to preserve both phases' dependencies rather than re-resolve them. Worth
doing deliberately in a later phase; noted here so the workaround above can
be deleted when it happens.

**Verification:** `npm run build` succeeds (120 modules, dist emitted);
`npm run typecheck` and `npm run test` (19 tests) remain green.

**Status:** Adopted 2026-08-14.

## ADR-023 — `php artisan serve` needs `--no-reload` on Windows + Herd

**Symptom:** `php artisan serve` fails on every port it tries:
`Failed to listen on 127.0.0.1:8000 (reason: ?)`, 8001, ... 8010. The ports
are genuinely free — `netsh interface ipv4 show excludedportrange` shows no
reservation covering them, nothing is listening, and both PHP's own
`stream_socket_server()` and .NET's `TcpListener` bind 127.0.0.1:8000
without complaint. Running the underlying `php -S 127.0.0.1:8000 -t public`
by hand also works.

**Root cause:** Laravel's `ServeCommand::startProcess()` rebuilds the child
environment before spawning `php -S`, mapping every `$_ENV` key that is not
in `ServeCommand::$passthroughVariables` to `false` — which Symfony's
`Process` treats as "remove this variable". That allow-list includes
`SYSTEMROOT`, but Windows names the variable `SystemRoot`, and `in_array()`
is case-sensitive, so it does not match and the variable is dropped. Winsock
cannot initialize in a process without `SystemRoot`, so the built-in server
fails to create its socket and reports an errno it has no string for —
hence the empty `reason: ?`.

Two conditions have to coincide, which is why this is not universal: Herd's
`php.ini` sets `variables_order=EGPCS` (so `$_ENV` is populated at all — 97
entries here; with the PHP default of `GPCS` it is empty and the stripping
is a no-op), and the platform has to be Windows (case-mismatched variable
name). Confirmed by reproducing it directly: spawning `php -S` with only
`SystemRoot` removed from an otherwise complete environment reproduces the
exact message, and restoring it fixes it.

**Resolution:** use `php artisan serve --no-reload`, documented in
`README.md`. `--no-reload` takes the `return [$key => $value]` branch in
`startProcess()`, forwarding the environment unmodified. Verified: server
starts, and `GET /api/v1/health` answers over real HTTP.

**Not done:** patching `vendor/`, or changing `variables_order` globally.
The first is overwritten by the next `composer install`; the second is a
machine-wide PHP change with unrelated side effects. Neither is warranted
for a documented one-flag workaround.

**Scope:** not a defect in this project — it affects any Laravel 11/12
project on this machine, including both phase snapshots. Recorded here
because `README.md` instructs developers to run `php artisan serve`, and
that instruction fails as written on a Windows + Herd setup.

**Status:** Adopted 2026-08-14.

## ADR-024 — Public student group registration uses email OTP and normalized records

**Date:** 2026-08-24.

**Decision:** The approved fourth-year group letters are L/M/N and fifth-year letters are A/B/C. Academic registration is a general student attribute (`registered`/`unregistered`). Students do not receive accounts; the public cycle link requires a one-time code delivered to `{university_number}@students.hebron.edu` through Gmail SMTP. Credentials exist only in `.env`. Group rosters, cycles, challenges, and assignments are persisted in normalized MySQL tables rather than browser storage or generic JSON payloads.

**Security:** SMTP delivery failure is fail-closed. OTP and access tokens are stored hashed, expire quickly, and are rate-limited. No student identity or group option is returned before OTP verification. Capacity is enforced inside a locking transaction.

**Status:** Adopted 2026-08-24 by explicit Clinical Department direction.

## ADR-025 — Correspondence is internal mail, not an approval workflow

**Date:** 2026-09-12.

**Decision:** By explicit system-owner direction, the correspondence module is a secure internal email replacement for all active system users. Correspondence never enters the configurable approval center and has no approve/return/final-approval action. Messages support To, CC, FYI, reply-all, forwarding, per-user read/star/archive state, drafts, templates, attachments, action deadlines, audit history, reporting, and printable official copies. Academic approvals remain unchanged in their own modules.

**Migration impact:** Existing non-draft correspondence is normalized to `sent`; existing closed correspondence becomes archived for its participants. Existing participants and attachments are preserved. Pending legacy correspondence approval requests are cancelled and the correspondence approval workflow is disabled and hidden.

**Status:** Adopted 2026-09-12 by explicit owner direction.

## ADR-026 — Assessment reviewers may enter marks on behalf of assigned supervisors

**Date:** 2026-11-04.

**Decision:** Users with `assessment.review` may submit a missing clinical assessment from the clinical assessment review screen on behalf of the supervisor assigned to that student and assessment slot in the current published distribution. The backend derives the evaluator from that assignment, enforces the reviewer's existing student/department/academic scope, and uses the same template, score validation, current-version lock, and workflow audit as supervisor entry. Submitted or approved assessments remain read-only in this screen.

**Rationale:** By explicit Clinical Department direction, research and teaching assistants and other users granted review access need to enter supervisor assessments directly from the review screen.

**Impact:** No database migration. A new scoped API write endpoint and a review-screen entry form; assessment and grade records continue to use the assigned supervisor as evaluator and the authenticated reviewer as workflow actor.

**Status:** Adopted 2026-11-04 by explicit owner direction.

## ADR-027 — University lecture attendance supports classroom traffic and delegated staff access

**Date:** 2026-11-24.

**Decision:** At the system owner's request, university lecture attendance has separate global permissions to view registers (`university_lectures.attendance.view`) and operate registers/QR (`university_lectures.attendance.manage`). The migration grants these to the system administrator, clinical director, research and teaching assistants, and administrative assistants. Administrators can change these grants in the permission matrix. Lecture planning and permanent deletion retain their existing separate permissions. Assigned active clinical supervisors and RTAs can operate their own lectures with `attendance.record`; an RTA may be selected as lecturer even before a Person profile exists, with a single linked profile created transactionally when assigning the lecture.

**Attribution and preservation:** Registers retain the assigned lecturer; the authenticated staff member is recorded as the actual actor. Existing register snapshots, audit history, QR date restrictions, roster eligibility, closed-session rules, and correction validation remain enforced.

**Traffic:** Public clinical/university attendance limits distinguish student access tokens or trusted devices and OTP challenges. A missing identity or a shared classroom QR never becomes one student bucket. Generous network ceilings remain alongside strict student/challenge limits. Rate-limit responses retain HTTP 429 and Retry-After; the scanner prevents overlapping scans and respects the cooldown. Remembering a browser is optional and cannot block successful attendance.

**Migration impact:** Adds permission rows and role grants only; no attendance records or historical assignments are rewritten. The frontend is built into the repository's production assets for cPanel deployment without npm on the server.

**Validation:** Automated classroom scenario covers 100 students on one network, OTP/identity/scan routes, duplicate-scan idempotence, QR closure, permission revocation, attribution, and RTA lecturer assignment. Existing register and API exception tests are retained.

**Status:** Adopted 2026-11-24 by explicit owner direction.

## ADR-028 — University attendance approval seals registers; same-day lectures are limited by time conflicts

**Date:** 2026-11-24.

**Decision:** At the system owner's direction, the attendance action is now approval: manual entry saves the complete roster and seals the register atomically, and QR approval closes scanning, records absences and seals the register in the same transaction. Reopening a saved register shows attendance statuses without editing controls. Existing manual and closed QR registers are also treated as sealed; their original attendance rows are preserved and no historical approver or timestamp is invented.

**Correction permission:** Only an active `ADMIN_ASSISTANT` with `university_lectures.attendance.correct_approved` can correct a sealed register. This permission is seeded/granted to that role and configurable by the administrator. A correction requires a reason, preserves the original approval metadata and unchanged student records, and records before/after values, actor and reason in the existing audit log. General attendance management and clinical supervisor access do not permit corrections after approval. The API enforces these checks while locking the lecture and session.

**Scheduling:** Removes the previous maximum of two lectures per main group per day. Any number of lectures is permitted when their time intervals do not overlap on an actual common occurrence. Adjacent intervals are allowed; create and update retain the existing group lock and overlap validation.

**Migration impact:** Adds nullable `approved_at` and `approved_by_user_id` to university sessions, with a short named user foreign key, and adds the dedicated correction permission. No attendance rows, membership snapshots or prior approval metadata are backfilled. New approvals record the real timestamp and user.

**UI:** Lecture management actions open in a small responsive dialog so the last row's actions cannot be clipped by the lecture list. Approved registers have compact read-only student rows. Authorized administrative corrections require an explicit edit action and return to read-only after saving.

**Status:** Adopted 2026-11-24 by explicit owner direction.

## ADR-029 — Grade sheets display course groups and photos without changing approval scope

**Date:** 2026-11-24.

**Decision:** At the owner's request, `/grades` displays student photos, clinical main groups and subgroups, dependent group filters and grouped student rows. Group metadata comes from distinct subgroups in current published distributions for the selected course and academic year, restricted to the already authorized grade roster. Students without published course assignments use their latest membership in the selected academic year, preferring an open membership. Missing membership remains explicitly unassigned. Multiple course memberships remain metadata on one student grade row.

**Workflow and UI:** Filtering preserves drafts keyed by student ID. Saving retains the existing editable-row rules; submission and approval still apply to the complete course/year sheet, with that scope stated beside filtered views. Automatically calculated clinical marks and existing approval permissions are unchanged. A sheet cannot be labelled approved while unsaved student rows remain. The same student fields render as cards on phones/tablets and a table on desktop, with photos that can be enlarged.

**Export:** Excel exports the displayed students with clinical group and subgroup columns, frozen headings and column filters. No photo images are embedded. Main groups and subgroups are display metadata, not new approval units.

**Migration impact:** No schema or permission changes. Adds bulk-loaded group metadata and `photo_url` to the existing scoped grade roster API.

**Status:** Adopted 2026-11-24 by explicit owner direction.

## ADR-030 — Clinical dashboards use scoped current-year records and actionable follow-ups

**Date:** 2026-11-26.

**Decision:** At the owner's request, the general role dashboard and the distribution operations dashboard report clinical students (fourth, fifth and sixth years) only. Basic attendance retains its separate workspace and tables. The clinical supervisor portal, its routing, queries and interface are unchanged.

**Academic scope:** Resolve the explicitly current academic year, falling back to the year covering today's date; when neither exists, do not silently sum historical records. Hospital attendance requires a clinical course and rotation in that year, dates through today, and students visible to the user. Clinical university attendance is a separate chart and includes approved registers and historical sealed registers, not open QR registers; its own viewing permissions apply. Excused absence is not presence in the attendance rate. Risk notices explicitly describe field-training absence cases for review, not previously issued official warnings. Grade charts count saved student grade records for the year, not complete course sheets. Assessments and placements use current published distributions in that year. Distribution coverage uses the same active, visible clinical-student population as its denominator and shows unassigned students even before publication; an explicit year filter is respected.

**Permissions and operations:** Dashboard permission resolution includes direct user grants. Technical data requires the matching technical permission. Advising respects student scope and year. Mail totals and activity exclude the user's archived/deleted items, while unread replies to sent mail are counted. Overdue tasks include created and assigned work; upcoming meetings are scheduled meetings only. Approval follow-ups respect the current step, requester separation and distinct-approver rules. Existing operational histories remain all-time status summaries; academic-year scope is stated separately.

**UI:** Zero values stay visible with an empty state. Clinical labels distinguish the two attendance sources, chart notes identify record counts, permitted links open their registers, and urgent follow-ups appear first with expansion for remaining actions. Arabic cohort names are localized, and Arabic trend coordinates follow the same direction as month labels.

**Migration impact:** No schema, permissions, source records, grading formulas or approval transitions change. Production frontend assets are committed for cPanel deployment without server-side npm.

**Validation:** Regression tests cover mixed basic/clinical roles, direct permissions, inactive accounts, cohort/year/course boundaries, open versus sealed university registers, historical distributions and grades, operation counts, approval separation, empty distribution coverage, zero-valued charts and Arabic/English trend direction. Existing supervisor portal tests are retained. Responsive browser checks use synthetic data on phone, tablet and desktop.

**Status:** Adopted 2026-11-26 by explicit owner direction.

## ADR-031 — Students verify identity, give confidential feedback, then view released clinical marks

**Date:** 2026-11-26.

**Decision:** Explicit owner direction extends the accountless student portal with `/portal/clinical-assessments`, and adds `/clinical-student-feedback` for authorized staff. The owner requested a link only, no QR. Each course rotation starts disabled; staff select a start week and explicitly publish official marks. Ended weekly slots or actual period-based assessments use the existing current-publication/official-assessment selection. Drafts, returns, future slots, Mini-OSCE and final OSCE are excluded. Marks remain absent from student API payloads until the verified owner completes that slot's short feedback and a matching official mark is published. Corrections require republication while preserving participation. Grade calculations and the supervisor workspace are unchanged.

**Identity:** Real email OTP is mandatory independently of schedule test bypass and Sanctum domain assumptions. Codes are hashed, limited, expiring and single-use. Dedicated encrypted HttpOnly cookies have server expiry, optional thirty-day remembering and revocation. Public mutation requests require exact same-origin and a custom non-simple header. Student IDs are derived from this session, never accepted as grade-access authority. Responses are private/no-store.

**Feedback:** Two ratings permit explicit inability to assess; free text is optional. A student/rotation/logical-slot/day ledger prevents duplicates. Random-UUID answers have no student, participation, grade, device, IP, timestamp or persistent respondent identifier. Comments are encrypted and never returned through student endpoints. Transactions and unique constraints preserve idempotence. This separation is an application privacy measure, not cryptographic anonymity against privileged database/log/backup access or identifying free text.

**Review:** Frozen batches need at least five students for the same slot/supervisor and are released only after the full training period and break-adjusted weeks end. Late responses cannot change a published batch individually. Each numeric average separately needs five numerical answers. Staff cannot read their own feedback despite mixed roles. Department/course and RTA cohort scope remain enforced. Moderators redact originals before comment readers can see them. No identity lists, precise reply times, response bundles with ratings, exports or deletes are exposed.

**Permissions and history:** Five separate permissions cover aggregates, redacted comments, moderation, setup/report release, and mark publication. Defaults are documented in `docs/CLINICAL_STUDENT_FEEDBACK.md`; technical administrators receive no automatic feedback-reading access. Student records with publication/participation history cannot be force-deleted; expired authentication records are ephemeral and cannot prevent deletion of otherwise deletable directory records. Scheduled pruning never deletes academic or feedback history.

**Migration impact:** Seven additive tables and permission rows/grants. No existing marks, formulas, workflow states or source assessments are rewritten or automatically published. DDL uses short identifiers and can resume after already-created tables. Confidential history is deliberately protected from destructive rollback; disable the course window for operational rollback.

**Validation:** Identity/cookie round trips, bypass resistance, authorization/scope, same-origin protection, hidden grade payloads, correction/republication, duplicate submissions, encrypted unlinked comments, low-count and per-question suppression, late batches, self-review denial, redaction permissions, safe deletion, credential cleanup, bulk query growth, existing grade/review and supervisor behavior, and responsive Arabic/English student journeys are checked locally. The existing schedule-cookie test harness now actually sends its cookies; production schedule code is unchanged.

**Status:** Adopted by explicit owner instruction.

## ADR-032 — Separate clinical feedback filters and persist week publication

**Date:** 2026-11-26.

**Decision:** Staff use separate clinical-period, cohort and course selectors. Following the owner's clarification, students use only clinical-period and week selectors. All owned assessments sharing that week/range and dates appear together, with separate feedback/mark gates and a course heading only when multiple courses apply. Period keys contain academic-year and clinical-period IDs, grouping the same period across courses/cohorts without mixing years. Unlinked rotations have an explicit unassigned-period label. Dependent choices reset on parent changes and stay stable during background refreshes.

**Publication:** The owner's updated instruction replaces ADR-031's snapshot-only behavior for newly published ranges. A unique window/week ledger records standing publication, even for missing or future grades. The student sees pending owned weeks, but cannot submit feedback or obtain a mark until a valid current official assessment exists and the week ends. Once ready, feedback precedes grade disclosure. Later official corrections follow standing authorization without requiring another response. Returned, draft, invalid and superseded assessments stay hidden. Existing snapshot releases retain their matching rules until staff publish their range again; no authorization is inferred by migration. Period-based assessments use their ending week; grading formulas and supervisor workflows are unchanged.

**History and validation:** The additive migration retains publisher/time, uses short MySQL identifiers and refuses destructive rollback. Publication history also blocks rotation deletion. Tests cover pending/future weeks, draft-to-official entry, corrections/returns, unpublished ranges, start/duration bounds, idempotence, selector metadata and dependency resets. Existing authentication, privacy batching, scope and grade/supervisor regression checks remain in place. Deployment requires the migration and one explicit range publication to adopt the new behavior for existing courses.

**Status:** Adopted by explicit owner instruction.

## ADR-033 — Display clinical feedback immediately from the first response

**Date:** 2026-11-26.

**Decision:** The owner explicitly requests immediate results without the five-student threshold. This supersedes ADR-031's delayed/frozen-batch reporting. Authorized results use all responses, grouped by window, assessment slot and supervisor, including formerly waiting and batched legacy data. Each question averages its available numeric responses; null answers are excluded and an entirely unanswered question stays null. Late replies update the same summary. Staff results/comments refresh every five seconds while their tab is active, without replacing an existing view or draft during refresh. Manual report-release controls and threshold/period-end text are removed.

**Access and privacy:** Existing permissions, course/department/cohort scope, self-review exclusions, encryption, redacted-comment reader access and optimistic moderation guards remain enforced directly on answers. Student identity and precise submission time remain absent; small-count live reporting can permit timing/context inferences, so no threshold-based anonymity guarantee is made. Student grade publication and feedback-before-mark gates are unchanged.

**Compatibility and validation:** No migration or data rewrite is required. Historical batch records remain retained; the old scoped release endpoint returns `automatic: true` without mutating data. Tests verify a first reply before period end, later live averages, null denominators, separate slots, old and waiting replies without duplication, own-feedback denial, permission/cohort scope, automatic UI refresh and absence of release controls.

**Status:** Adopted by explicit owner instruction.

## ADR-034 — Staff can test an existing student without creating a real student response

**Date:** 2026-11-26.

**Decision:** The owner identifies as an administrative assistant and requests live-installation testing with an existing student plus deletion of test replies. Add separate configurable `clinical_feedback.test` and `clinical_feedback.delete_test` permissions, defaulted only to administrative assistants. Staff open the shared student portal in an explicitly labeled test dialog, using their authenticated staff session. Public student OTP/cookies remain unchanged.

**Isolation:** Two test-only tables retain creator, student, eight-hour expiry, and encrypted test replies. Tests use the same official-assessment, published-week and week-end gates as real participation, while substituting only the test completion ledger. A real student's completion and confidential reply are not revealed or reused. Test data is excluded from real reports and cannot modify grades, publications or real participation. Deleting an answer resets only that test gate; deleting a run cascades its test answers. Test records do not add academic-history deletion restrictions.

**Authorization:** Every preview read/answer requires current test permission, creator ownership, active session expiry and eligible student/course/cohort scope. Cleanup requires its separate permission and ownership, including after expiry. UUIDs are references, not bearer credentials. Private/no-store and exact-origin mutation checks apply. Audits record the staff actor, action and run UUID without reply content. Native modal focus containment, separate query caches, dependent period/week selectors and touch-sized controls support phone/tablet/desktop use.

**Validation and deployment:** Tests cover migration grants/idempotence, permission revocation, ownership, expiry, scope, unpublished/ungraded/foreign slot rejection, feedback-before-mark, duplicate submissions, encryption, exclusion from reports, reply/full-run deletion and preservation of real student records. The shared public student journey and grade/supervisor regressions remain checked. Run the additive migration before deploying built assets; no production test records or student data are created by deployment.

**Status:** Adopted by explicit owner instruction.
