# CDMS Production Operations Guide

**Document:** `docs/PRODUCTION_OPERATIONS.md`
**Phase:** 6E
**Version:** 1.0
**Date:** 2026-08-15
**Status:** APPROVED

> This document is the authoritative operations reference for the Clinical Distribution Management System (CDMS). It covers environment configuration, deployment, queue workers, scheduled tasks, backup and disaster recovery, monitoring, and incident response. All operators and DevOps personnel responsible for CDMS production environments MUST read this document before performing any production operation.

---

## Table of Contents

1. [System Requirements](#1-system-requirements)
2. [Environment Configuration](#2-environment-configuration)
3. [Initial Deployment Procedure](#3-initial-deployment-procedure)
4. [Queue Workers](#4-queue-workers)
5. [Laravel Scheduler](#5-laravel-scheduler)
6. [Database Configuration](#6-database-configuration)
7. [S3-Compatible Backup Configuration](#7-s3-compatible-backup-configuration)
8. [Backup Retention Policy](#8-backup-retention-policy)
9. [Backup Verification](#9-backup-verification)
10. [Restore Procedure — RTO 4 Hours](#10-restore-procedure--rto-4-hours)
11. [RPO and RTO Targets](#11-rpo-and-rto-targets)
12. [Health Monitoring](#12-health-monitoring)
13. [Failed Jobs Monitoring](#13-failed-jobs-monitoring)
14. [Deployment Procedure (Updates)](#14-deployment-procedure-updates)
15. [Rollback Procedure](#15-rollback-procedure)
16. [Incident Response](#16-incident-response)
17. [Accepted Limitations](#17-accepted-limitations)

---

## 1. System Requirements

| Component | Minimum Version | Recommended |
|---|---|---|
| PHP | 8.3 | 8.3 (latest patch) |
| Laravel | 12.x | 12.x |
| MySQL | 8.0 | 8.0 (latest patch) |
| Node.js | 20 LTS | 20 LTS |
| Composer | 2.x | 2.x |
| Storage free space | 1 GB | 10 GB |
| PHP extensions | pdo_mysql, zip, gd, mbstring, openssl, bcmath, xml | See `composer check-platform-reqs` |

---

## 2. Environment Configuration

### 2.1 Required `.env` Variables

Copy `.env.example` to `.env` and configure **all** of the following. **Never commit `.env` to version control.**

#### Application

```ini
APP_NAME="CDMS"
APP_ENV=production
APP_KEY=base64:...          # Generated with: php artisan key:generate
APP_DEBUG=false             # MUST be false in production
APP_URL=https://your-domain.com
```

> **CRITICAL:** `APP_DEBUG=false` is mandatory in production. Any value of `true` exposes stack traces, configuration values, and internal paths in HTTP error responses.

#### Database

```ini
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=cdms
DB_USERNAME=cdms_user
DB_PASSWORD=<strong-password>
```

#### Session (SPA Authentication)

```ini
SESSION_DRIVER=database
SESSION_LIFETIME=120
SESSION_SECURE_COOKIE=true    # MUST be true in production (requires HTTPS)
SESSION_SAME_SITE=lax
SESSION_COOKIE=cdms_session
```

> **CRITICAL:** `SESSION_SECURE_COOKIE=true` requires HTTPS. The session cookie will not be sent over HTTP.

#### CORS (Frontend Origin)

```ini
FRONTEND_URLS="https://your-frontend-domain.com"
```

For multiple frontend origins (e.g., staging):
```ini
FRONTEND_URLS="https://app.example.com,https://staging.example.com"
```

> Never set `FRONTEND_URLS=*`. The CORS configuration will reject wildcard origins.

#### Queue

```ini
QUEUE_CONNECTION=database
```

#### Mail (Backup Alerts + Notifications)

```ini
MAIL_MAILER=smtp
MAIL_HOST=smtp.your-provider.com
MAIL_PORT=587
MAIL_USERNAME=your-smtp-user
MAIL_PASSWORD=<smtp-password>
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS=noreply@your-domain.com
MAIL_FROM_NAME="CDMS Notifications"
```

#### Backup Alert Recipient

```ini
BACKUP_ALERT_EMAIL=ops-team@your-domain.com
```

#### S3-Compatible Backup Storage

```ini
AWS_ACCESS_KEY_ID=<key-id>
AWS_SECRET_ACCESS_KEY=<secret-key>
AWS_DEFAULT_REGION=us-east-1        # or your provider's region
AWS_BUCKET=your-cdms-backups-bucket
AWS_ENDPOINT=https://s3.your-provider.com  # Set for non-AWS providers; omit for AWS S3
```

> **Security:** All credentials are read exclusively from environment variables. No credentials appear in source code, `config/` files, or `routes/`. Rotate credentials using your cloud provider's key management system.

---

## 3. Initial Deployment Procedure

Execute the following steps in order on first deployment:

```bash
# 1. Clone repository
git clone https://github.com/your-org/cdms.git /var/www/cdms
cd /var/www/cdms

# 2. Install PHP dependencies (production — no dev packages)
cd backend
composer install --optimize-autoloader --no-dev

# 3. Copy and configure environment
cp .env.example .env
# Edit .env with all production values (see Section 2)
nano .env

# 4. Generate application key
php artisan key:generate

# 5. Run database migrations
php artisan migrate --force

# 6. Seed roles, permissions, and initial data
php artisan db:seed --force

# 7. Create storage symlink
php artisan storage:link

# 8. Clear and cache configuration for performance
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache

# 9. Build frontend
cd ../frontend
npm ci --production=false
npm run build
# Serve the built frontend/dist/ directory from your web server

# 10. Set file permissions
cd /var/www/cdms/backend
chown -R www-data:www-data storage bootstrap/cache
chmod -R 775 storage bootstrap/cache

# 11. Configure web server to point to backend/public/ (see Section 2.2)
# 12. Configure queue worker (see Section 4)
# 13. Configure scheduler (see Section 5)
```

### 2.2 Web Server Configuration (Nginx example)

```nginx
server {
    listen 443 ssl;
    server_name api.your-domain.com;
    root /var/www/cdms/backend/public;

    ssl_certificate     /etc/ssl/certs/your-domain.crt;
    ssl_certificate_key /etc/ssl/private/your-domain.key;

    index index.php;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
    }
}
```

---

## 4. Queue Workers

> **CRITICAL:** CDMS Phase 6C domain events (DistributionPublished, SupervisorReassigned, ApprovalRevoked) dispatch queued listeners. Without a running queue worker, **all clinical notifications will silently accumulate in the `jobs` table and never be delivered.**

### 4.1 Recommended: Supervisor Daemon

Install Supervisor on the server:

```bash
sudo apt-get install supervisor
```

Create `/etc/supervisor/conf.d/cdms-worker.conf`:

```ini
[program:cdms-worker]
process_name=%(program_name)s_%(process_num)02d
command=php /var/www/cdms/backend/artisan queue:work database --sleep=3 --tries=3 --max-time=3600
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
user=www-data
numprocs=2
redirect_stderr=true
stdout_logfile=/var/log/supervisor/cdms-worker.log
stdout_logfile_maxbytes=10MB
stopwaitsecs=3600
```

Apply and start:

```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start cdms-worker:*
```

### 4.2 Alternative: systemd

Create `/etc/systemd/system/cdms-worker.service`:

```ini
[Unit]
Description=CDMS Queue Worker
After=network.target mysql.service

[Service]
User=www-data
WorkingDirectory=/var/www/cdms/backend
ExecStart=/usr/bin/php artisan queue:work database --sleep=3 --tries=3 --max-time=3600
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable cdms-worker
sudo systemctl start cdms-worker
```

### 4.3 Restarting the Worker After Deployment

After every code deployment, restart the queue worker to pick up new code:

```bash
# Supervisor
sudo supervisorctl restart cdms-worker:*

# systemd
sudo systemctl restart cdms-worker

# Or, gracefully (drains current jobs first):
php artisan queue:restart
```

### 4.4 Queue Worker Configuration

| Setting | Value | Reason |
|---|---|---|
| `--sleep=3` | 3 seconds | Poll interval when queue is empty |
| `--tries=3` | 3 attempts | Matches listener `$tries = 3` |
| `--max-time=3600` | 1 hour | Prevents memory leaks by recycling the worker hourly |
| `--queue=default` | default queue | All CDMS listeners use the default queue |

---

## 5. Laravel Scheduler

The CDMS backup system uses the Laravel scheduler. The scheduler MUST be running for backups to execute.

### 5.1 Crontab Entry

Add to the server crontab (`sudo crontab -e -u www-data`):

```cron
* * * * * cd /var/www/cdms/backend && php artisan schedule:run >> /dev/null 2>&1
```

This single entry runs every minute and the scheduler internally manages which tasks run and when.

### 5.2 Scheduled Tasks

| Task | Schedule | Purpose |
|---|---|---|
| `backup:run --only-db` | Daily at **02:00** | Create database backup and upload to S3 |
| `backup:clean` | Daily at **02:30** | Remove backups exceeding retention policy |

---

## 6. Database Configuration

### 6.1 Creating the Production Database and User

```sql
-- Connect as root/admin
CREATE DATABASE cdms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'cdms_user'@'127.0.0.1' IDENTIFIED BY '<strong-password>';
GRANT ALL PRIVILEGES ON cdms.* TO 'cdms_user'@'127.0.0.1';
FLUSH PRIVILEGES;
```

### 6.2 Recommended MySQL Configuration (`/etc/mysql/mysql.conf.d/mysqld.cnf`)

```ini
[mysqld]
innodb_buffer_pool_size = 1G       # Adjust to 70% of available RAM
innodb_log_file_size = 256M
max_connections = 150
slow_query_log = 1
long_query_time = 1
slow_query_log_file = /var/log/mysql/slow.log
```

### 6.3 Database Backup User (Read-Only — for backup tool)

The `spatie/laravel-backup` package uses the application DB connection (cdms_user) which has full privileges. This is acceptable for a single-server deployment. For segregated environments, create a dedicated backup user:

```sql
CREATE USER 'cdms_backup'@'127.0.0.1' IDENTIFIED BY '<backup-password>';
GRANT SELECT, LOCK TABLES, SHOW VIEW, TRIGGER ON cdms.* TO 'cdms_backup'@'127.0.0.1';
FLUSH PRIVILEGES;
```

---

## 7. S3-Compatible Backup Configuration

The CDMS backup system is provider-agnostic. It works with:
- **AWS S3** (omit `AWS_ENDPOINT`)
- **DigitalOcean Spaces** (set `AWS_ENDPOINT=https://nyc3.digitaloceanspaces.com`)
- **Backblaze B2** (set `AWS_ENDPOINT=https://s3.us-west-002.backblazeb2.com`)
- **MinIO** (set `AWS_ENDPOINT=https://your-minio.internal`)

### 7.1 Creating the Backup Bucket

The bucket should be:
- **Private** (no public access)
- **Versioning disabled** (spatie/laravel-backup manages its own retention)
- In a **different region** from the primary database server (geographic redundancy)

### 7.2 IAM Policy for Backup User (AWS S3)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-cdms-backups-bucket",
        "arn:aws:s3:::your-cdms-backups-bucket/*"
      ]
    }
  ]
}
```

---

## 8. Backup Retention Policy

| Retention | Value | Effective Period |
|---|---|---|
| Daily backups | 7 days | Last 7 daily backups retained |
| Weekly backups | 4 weeks | Last 4 Sunday backups retained |
| Oldest backup | ~4 weeks | After 4 weeks, only weekly snapshots survive |

The `backup:clean` command (daily at 02:30) automatically enforces these policies.

> **Note:** The DB-only backup scope is an **accepted limitation** per the Phase 6E audit. Application code is version-controlled in Git and does not require S3 backup. Restore of application code is achieved via `git checkout`. Re-evaluate if Phase 7+ introduces user-uploaded files.

---

## 9. Backup Verification

As of Phase 6E, `verify_backup = true` is enabled in `config/backup.php`. After every backup run:

1. `spatie/laravel-backup` creates the ZIP archive.
2. It attempts to open the ZIP and verify it contains at least one file.
3. If verification fails, `BackupHasFailed` event fires and an alert email is sent to `BACKUP_ALERT_EMAIL`.

### 9.1 Manual Backup Verification

To manually trigger and verify a backup:

```bash
# Run backup immediately
php artisan backup:run --only-db

# List all backups (shows destination, size, age)
php artisan backup:list

# Attempt a test restore (see Section 10)
```

### 9.2 Backup Health Check

```bash
# Check backup health (uses spatie's built-in freshness check)
php artisan backup:monitor
```

This checks that a backup exists and is fresh (created within the configured freshness threshold).

---

## 10. Restore Procedure — RTO 4 Hours

> **RTO target: 4 hours.** Follow this procedure to restore CDMS from a database backup.

### 10.1 Pre-Restore Checklist

- [ ] Identify the target backup file in S3 (most recent valid backup)
- [ ] Provision or verify the restore target server meets system requirements
- [ ] Confirm the application server is isolated from production traffic (maintenance mode)
- [ ] Notify stakeholders of the outage window

### 10.2 Step-by-Step Restore

```bash
# Step 1: Download the backup from S3
aws s3 cp s3://your-cdms-backups-bucket/cdms/2026-08-15-02-00-00.zip /tmp/restore/

# Or for non-AWS providers:
aws --endpoint-url https://s3.your-provider.com s3 cp \
  s3://your-cdms-backups-bucket/cdms/latest.zip /tmp/restore/

# Step 2: Verify the ZIP integrity
unzip -t /tmp/restore/latest.zip

# Step 3: Extract the SQL dump
unzip /tmp/restore/latest.zip -d /tmp/restore/extracted/

# Step 4: Deploy application code to the restore target
git clone https://github.com/your-org/cdms.git /var/www/cdms-restore
cd /var/www/cdms-restore/backend
composer install --optimize-autoloader --no-dev

# Step 5: Configure environment
cp .env.example .env
# Set all production variables (see Section 2), pointing to the RESTORE database

# Step 6: Create the database on the restore target
mysql -u root -p -e "CREATE DATABASE cdms CHARACTER SET utf8mb4;"

# Step 7: Restore the database dump
mysql -u cdms_user -p cdms < /tmp/restore/extracted/db-dumps/mysql-cdms.sql

# Step 8: Verify migration status matches (do NOT re-run all migrations)
php artisan migrate:status

# If migrations are ahead of the dump, run ONLY the new migrations:
# php artisan migrate --force

# Step 9: Clear and cache configuration
php artisan config:cache
php artisan route:cache

# Step 10: Start queue worker and verify
supervisorctl start cdms-worker:*
php artisan queue:work --once  # Process one job to verify worker is healthy

# Step 11: Start scheduler
# Add crontab entry (see Section 5.1)

# Step 12: Smoke test critical endpoints
curl -s https://your-domain.com/api/v1/health | jq .

# Step 13: Switch traffic to restore target
# Update load balancer / DNS to point to restore target

# Step 14: Verify with a clinical user
# Log in and confirm the distribution schedule reflects the restored state
```

### 10.3 Expected Data Loss

Given RPO = 24 hours and daily backups at 02:00:
- **Worst case:** 23 hours and 59 minutes of transactions since the last backup are lost.
- **Best case:** Near-zero loss if failure occurs just after 02:00.

This is acceptable per the approved Phase 6D/6E business rules. Inform affected clinical staff of the data loss window and have them re-enter or re-approve any distributions created after the last backup.

---

## 11. RPO and RTO Targets

| Target | Value | How Achieved |
|---|---|---|
| **RPO** (Recovery Point Objective) | **24 hours** | Daily backup at 02:00 to S3 |
| **RTO** (Recovery Time Objective) | **4 hours** | Documented restore procedure (Section 10) |

---

## 12. Health Monitoring

### 12.1 Health Endpoint

```
GET /api/v1/health
```

This endpoint is **public** (no authentication required) and safe for load balancer and uptime monitor polling.

**Response (all healthy):**
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
  "meta": { "checked_at": "2026-08-15T02:00:00+03:00" }
}
```

**HTTP 200** = all checks pass. **HTTP 503** = database, queue, or storage is unhealthy.

**Field definitions:**

| Field | Values | Meaning |
|---|---|---|
| `application` | `ok` | Application is running |
| `database` | `ok` \| `unreachable` | MySQL connection status |
| `queue` | `ok` \| `stalled` \| `unreachable` | Queue health (stalled = job > 5 min old) |
| `storage` | `ok` \| `unwritable` \| `low_space` \| `unreachable` | Storage writability |
| `failed_jobs_count` | `integer ≥ 0` or `-1` | Failed jobs count; `-1` = count unavailable |

### 12.2 Recommended Monitoring Setup

```
# Poll every 60 seconds
GET /api/v1/health

# Alert if:
# - HTTP status is 503
# - data.database = "unreachable"
# - data.queue = "stalled"
# - data.storage = "unwritable" or "low_space"
# - data.failed_jobs_count > 0 (investigate failed listeners)
```

Compatible with: UptimeRobot, Pingdom, Datadog HTTP check, Prometheus Blackbox Exporter, AWS CloudWatch Synthetics.

---

## 13. Failed Jobs Monitoring

When a queued notification listener fails after 3 retries, the job is moved to the `failed_jobs` table. The health endpoint exposes `failed_jobs_count` for monitoring.

### 13.1 Listing Failed Jobs

```bash
php artisan queue:failed
```

### 13.2 Retrying Failed Jobs

```bash
# Retry a specific failed job by UUID
php artisan queue:retry <uuid>

# Retry all failed jobs
php artisan queue:retry all
```

### 13.3 Clearing Failed Jobs

After confirming failed jobs have been investigated and do not need retry:

```bash
php artisan queue:flush
```

### 13.4 Common Failure Causes

| Cause | Resolution |
|---|---|
| SMTP misconfiguration | Check `MAIL_*` env vars; test with `php artisan tinker` → `Mail::raw('test', fn($m) => $m->to('test@example.com')->subject('test'))` |
| Mail quota exceeded | Contact SMTP provider; switch to alternative SMTP |
| Database connection lost during notification | Queue worker auto-retries; check DB health |
| Notification recipient has no email | Normal — check `User::is_active` and email setup |

---

## 14. Deployment Procedure (Updates)

For subsequent code updates (not initial deployment):

```bash
# 1. Enable maintenance mode (prevents clinical users from making changes during migration)
php artisan down --render="errors/503" --secret="your-bypass-token"

# 2. Pull latest code
git pull origin main

# 3. Install/update PHP dependencies
composer install --optimize-autoloader --no-dev

# 4. Run any new database migrations
php artisan migrate --force

# 5. Re-cache configuration, routes, and events
php artisan config:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache

# 6. Build frontend (if frontend changed)
cd ../frontend
npm ci --production=false
npm run build

# 7. Restart queue worker (CRITICAL — must pick up new code)
php artisan queue:restart
# Then verify Supervisor/systemd restarts workers automatically

# 8. Disable maintenance mode
php artisan up

# 9. Verify health endpoint
curl -s https://your-domain.com/api/v1/health | jq .
```

---

## 15. Rollback Procedure

If a deployment causes failures:

```bash
# 1. Enable maintenance mode
php artisan down

# 2. Roll back to the previous commit
git checkout <previous-commit-sha>
# or
git revert HEAD

# 3. Roll back the last migration (if a migration was applied)
php artisan migrate:rollback

# 4. Re-install dependencies for the old code
composer install --optimize-autoloader --no-dev

# 5. Clear caches
php artisan config:clear
php artisan config:cache
php artisan route:cache

# 6. Restart queue worker
php artisan queue:restart

# 7. Restore maintenance mode
php artisan up

# 8. Verify health endpoint
curl -s https://your-domain.com/api/v1/health | jq .
```

> **Note:** Rolling back migrations that dropped columns or tables requires a full database restore (see Section 10). Always back up the database before any migration that modifies existing tables.

---

## 16. Incident Response

### 16.1 Database Unreachable

1. Check MySQL status: `sudo systemctl status mysql`
2. Check disk space: `df -h`
3. Check MySQL error log: `sudo tail -100 /var/log/mysql/error.log`
4. Restart MySQL if safe: `sudo systemctl restart mysql`
5. If data corruption: proceed to Section 10 (Restore Procedure)

### 16.2 Queue Stalled

1. Check queue worker status: `sudo supervisorctl status`
2. If worker crashed: `sudo supervisorctl restart cdms-worker:*`
3. Check for lock issues: `php artisan queue:failed`
4. If stalled jobs are genuine failures: `php artisan queue:retry all`

### 16.3 Backup Failure Alert

1. Check `storage/logs/backup.log` for the specific error
2. Verify S3 credentials: `aws s3 ls s3://your-cdms-backups-bucket/`
3. Check disk space (temporary ZIP is written to `storage/` before upload): `df -h /var/www/cdms`
4. Manually run a backup: `php artisan backup:run --only-db`
5. If S3 is unavailable: contact cloud provider; implement local emergency backup:
   ```bash
   mysqldump -u cdms_user -p cdms | gzip > /var/backups/cdms-emergency-$(date +%Y%m%d).sql.gz
   ```

### 16.4 Storage Low Space

1. Check: `df -h /var/www/cdms/backend/storage`
2. Clear log files older than 14 days: `find storage/logs -name "*.log" -mtime +14 -delete`
3. Clear old cached views: `php artisan view:clear`
4. Check for large temporary files: `du -sh storage/app/*`

### 16.5 High Failed_Jobs Count

1. List failed jobs: `php artisan queue:failed`
2. Examine the failure reason (check `exception` column)
3. Fix the root cause (SMTP config, permissions, etc.)
4. Retry failed jobs: `php artisan queue:retry all`
5. Monitor `failed_jobs_count` via health endpoint

---

## 17. Accepted Limitations

The following risks were explicitly classified as **Accepted** in the Phase 6E audit. They are documented here for operator awareness.

| Limitation | Rationale | Re-evaluate when |
|---|---|---|
| **DB-only backup** | No user-uploaded files exist. Application code is in Git. | Phase 7+ introduces file uploads |
| **Manual restore verification** | Automated restore of production DB is inherently unsafe. Restore procedure (Section 10) is manually executed. | Staging environment available for automated testing |
| **Session persist across browser close** | Clinical staff sessions must survive browser restart. `expire_on_close = false` is correct. | New session requirements introduced |
| **RPO = 24 hours** | Approved business requirement. | Data criticality increases or real-time replication is funded |

---

*CDMS Production Operations Guide — Phase 6E — Version 1.0*
*Maintained by the CDMS Engineering Team*
