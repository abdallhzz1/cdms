# Clinical Department Management System (CDMS)

**Hebron University — Faculty of Medicine — Clinical Department**

An internal administrative and academic platform that replaces fragmented
Excel/Word/email workflows with one system of record for the Clinical
Department. Core principle: **enter data once, reuse it everywhere.**

The repository now contains an advanced UAT-ready implementation: students,
staff, courses, clinical rotations and distribution, grades, attendance,
assessments, advising, correspondence, quality, meetings, reports, RBAC,
record-level scopes, audit logs, secure document storage, and operational
health checks. It is **not yet certified for production**: PHP tests and
migrations must pass in CI, backup dependencies must be installed, and a real
backup/restore drill must be completed. See the
[Arabic comprehensive audit](./docs/SYSTEM_COMPREHENSIVE_AUDIT_AR.md) and
[production operations guide](./docs/PRODUCTION_OPERATIONS.md).

## Project documentation

| Document | Purpose |
|---|---|
| [`PROJECT_RULES.md`](./PROJECT_RULES.md) | Binding engineering rulebook — Level 1 source of truth |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Approved high-level architecture — Level 2 source of truth |
| `Clinical_Department_*` documents (project root) | Detailed business/domain design — Level 3 source of truth |
| [`docs/`](./docs) | Implementation-phase notes and decision log |

## Technology stack

**Frontend** (`/frontend`): React, TypeScript, Vite, Tailwind CSS, React
Router, TanStack Query, React Hook Form, Zod.

**Backend** (`/backend`): PHP 8.3+, Laravel 12, REST API.

**Database:** MySQL 8.x.

**Architecture:** `React SPA → REST API (JSON) → Laravel → MySQL`. React
never talks to MySQL directly; Laravel is the only writer and the only place
authorization is enforced. See `ARCHITECTURE.md` for the full picture,
including why Laravel Inertia is explicitly not used.

## Prerequisites

- PHP 8.3 or newer, with the `pdo_mysql`, `mbstring`, `xml`, `curl`, and
  `zip` extensions
- Composer 2.x
- Node.js 20+ and npm 10+
- MySQL 8.x (a local server, or a remote instance you can point `.env` at)
- Git

## Project structure

```
/
├── backend/            Laravel API application
├── frontend/            React + TypeScript SPA
├── docs/                 Phase notes, decision log
├── Clinical_Department_*.docx / .xlsx   Approved detailed design documents
├── PROJECT_RULES.md
├── ARCHITECTURE.md
├── .gitignore
└── README.md
```

## Backend setup

```bash
cd backend
composer install
```

Copy the environment template — the command differs by shell (`cp` does not
exist in Windows `cmd.exe`, only in PowerShell/macOS/Linux):

```bash
# macOS/Linux/Git Bash/PowerShell
cp .env.example .env

# Windows cmd.exe
copy .env.example .env
```

Then generate the app key (this step fails with a `.env` "No such file or
directory" error if the copy above was skipped or silently failed — if you
hit that, just redo the copy step first):

```bash
php artisan key:generate
```

Edit `.env` and point it at your MySQL instance:

```
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=cdms
DB_USERNAME=cdms_user
DB_PASSWORD=your-local-password
```

Create the database and a user in MySQL (adjust to your local setup):

```sql
CREATE DATABASE cdms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'cdms_user'@'localhost' IDENTIFIED BY 'your-local-password';
GRANT ALL PRIVILEGES ON cdms.* TO 'cdms_user'@'localhost';
FLUSH PRIVILEGES;
```

Run all authentication, academic, clinical, workflow, audit, and operational
migrations:

```bash
php artisan migrate
```

Seed the 10 roles and 53 permissions from the approved Permission Matrix
document, plus (in a local environment only, and only if you opt in — see
`.env.example`'s `SEED_DEV_ADMIN`) a development admin account to log in
with:

```bash
php artisan db:seed
```

If `SEED_DEV_ADMIN=true` and `DEV_ADMIN_PASSWORD` is left blank, the seeder
prints a randomly generated password to the console once — copy it before
it scrolls away; it is not stored anywhere and re-running the seeder will
not show it again (it detects the account already exists and leaves its
password alone).

Start the API:

```bash
php artisan serve
```

**Windows + Laravel Herd:** if that fails with `Failed to listen on
127.0.0.1:8000 (reason: ?)` — retrying every port up to 8010 — the port is
not actually in use. Use this instead:

```bash
php artisan serve --no-reload
```

Herd's `php.ini` sets `variables_order=EGPCS`, which populates PHP's `$_ENV`.
Laravel's `serve` command then strips every `$_ENV` variable that is not in
its passthrough allow-list before spawning the underlying `php -S` process.
That list contains `SYSTEMROOT`, but Windows actually names the variable
`SystemRoot`, and the comparison is case-sensitive — so it gets stripped, and
without it Winsock cannot initialize in the child process, leaving `php -S`
unable to open a socket and reporting an empty `reason: ?`. Passing
`--no-reload` makes Laravel forward the environment unmodified.

The only thing given up is the automatic server restart when `.env` changes;
restart it by hand after editing `.env`. This is a Laravel-on-Windows
interaction, not a defect in this project — it affects any Laravel 11/12
project on a Herd machine.

Verify the health check:

```bash
curl http://localhost:8000/api/v1/health
```

Expected response once MySQL is reachable:

```json
{
  "success": true,
  "data": {
    "application": "ok",
    "database": "ok",
    "queue": "ok",
    "storage": "ok",
    "failed_jobs_count": 0
  },
  "message": null,
  "meta": { "checked_at": "2026-08-13T12:00:00+00:00" }
}
```

Run the backend test suite:

```bash
php artisan test
```

## Frontend setup

```bash
cd frontend
npm install
cp .env.example .env.local
```

`.env.local` should point at the backend you just started:

```
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

Start the dev server:

```bash
npm run dev
```

Open the printed local URL (default `http://localhost:5173`) and sign in with
an authorized account. The dashboard calls the backend health endpoint through
the centralized API client.

Run the frontend test suite:

```bash
npm run test
```

Type-check:

```bash
npm run typecheck
```

## Development commands reference

| Task | Backend | Frontend |
|---|---|---|
| Install dependencies | `composer install` | `npm install` |
| Run dev server | `php artisan serve` | `npm run dev` |
| Run tests | `php artisan test` | `npm run test` |
| Type-check | PHPUnit + framework boot/cache checks in CI | `npm run typecheck` |

Before any production deployment, run from `/backend`:

```bash
php artisan cdms:readiness
php artisan migrate:status
php artisan test
```

`cdms:readiness` intentionally fails until production security, queue, CORS,
S3, encrypted backups, and the backup package are configured.

## API response format

Every endpoint returns one of two envelope shapes (see
`app/Http/Responses/ApiResponse.php`):

```json
// success
{ "success": true, "data": {}, "message": null, "meta": {} }

// error
{ "success": false, "data": null, "message": "…", "errors": {}, "meta": {} }
```

## Current API endpoints (Phase 2)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/v1/health` | Public | Application + database connectivity check |
| GET | `/up` | Public | Laravel's built-in liveness probe (framework default) |
| GET | `/sanctum/csrf-cookie` | Public | Issues the XSRF-TOKEN cookie a login request needs (registered by Sanctum's service provider) |
| POST | `/api/v1/auth/login` | Public, rate-limited | Session-cookie login |
| POST | `/api/v1/auth/logout` | Session required | Ends the session |
| GET | `/api/v1/auth/me` | Session required | Current user + roles + permissions |

No business endpoints exist yet. Authentication is Sanctum's SPA
cookie/session mode — there is no bearer token anywhere in this API; the
frontend authenticates every request with `credentials: 'include'`
(`frontend/src/api/client.ts`).

## Bilingual / RTL support

Arabic and English are both supported from this phase onward. The language
switcher in the app header toggles the UI language, `document.dir`
(`rtl`/`ltr`), and `document.lang` together. All frontend copy goes through
translation keys (`src/i18n/locales/{en,ar}.ts`) — see
`PROJECT_RULES.md` §7.

## Next phase

See the Phase 2 report delivered alongside this repository for the
recommended Phase 3 scope, and for a decision this project needs from a
human before real role-permission grants can be seeded (the
Role_Permission_Matrix source sheet's column-to-role mapping is
ambiguous — see `docs/DECISIONS.md` ADR-019, item 3). Do not start Phase 3
without explicit sign-off — see `PROJECT_RULES.md` §2 ("no phase
auto-continues into the next").
