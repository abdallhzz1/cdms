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