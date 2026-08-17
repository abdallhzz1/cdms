# PHASE 6D — PRE-IMPLEMENTATION AUDIT AND BUSINESS RULES SPECIFICATION

## 1. PHASE OBJECTIVE
Establish a resilient operational layer for the Clinical Distribution Management System (CDMS) encompassing database backups, disaster recovery, queue/storage health monitoring, logging retention, and operational observability.

## 2. PRE-IMPLEMENTATION AUDIT FINDINGS

### 2.1 Existing Infrastructure
* **Health Checks**: An initial `/api/v1/health` endpoint exists (`HealthController`) that verifies the `database` connection using a live `SELECT 1` query.
* **Queues**: Phase 6C implemented a `database` queue connection. The `jobs` and `failed_jobs` tables exist.
* **Storage**: The application uses the `local` filesystem disk (`FILESYSTEM_DISK=local`).
* **Logging**: Uses Laravel's `daily` log channel with a 14-day retention limit (`LOG_DAILY_DAYS=14`).
* **Scheduled Tasks**: No custom scheduled tasks exist in `routes/console.php` or `app/Console/Kernel.php`.

### 2.2 Identified Risks & Gaps
* **Missing Backups**: There is no automated database or application backup strategy implemented. `spatie/laravel-backup` (the Laravel industry standard) or equivalent is absent from `composer.json`.
* **Queue Blindness**: The `HealthController` does not verify if the queue worker is actively processing jobs. If the worker crashes, notification events will silently build up in the `jobs` table.
* **Storage Blindness**: The `HealthController` does not verify if the filesystem has adequate free space or is writable, risking silent failures for any file uploads or PDF/Excel exports.
* **Single Point of Failure**: Local backups (if implemented without external storage) will be lost if the primary server fails.
* **No Restore Verification**: Backups are useless without a documented, verified restore process.

---

## 3. BUSINESS RULES SPECIFICATION

### 3.1 Backup & Disaster Recovery Architecture
**Mandatory Requirements:**
1. **Automated Backups**: The system MUST perform automated daily backups of the production database at 02:00 AM (configured via Laravel Scheduler).
2. **Storage Redundancy**: Backups MUST NOT be stored solely on the application server. They MUST be duplicated to an off-site disk (e.g., AWS S3, local network NAS, or SFTP).
3. **Sensitive Data Protection**: Database backups MUST NOT include unhashed credentials. (Currently, Laravel handles this via Eloquent, but SQL dumps contain hashed passwords. Encryption at rest for the backup files themselves is highly recommended).
4. **Retention Policy**: 
   - Daily backups MUST be retained for 7 days.
   - Weekly backups MUST be retained for 4 weeks.
   - Monthly backups MUST be retained for 3 months.
5. **RPO (Recovery Point Objective)**: 24 hours (maximum acceptable data loss).
6. **RTO (Recovery Time Objective)**: 4 hours (maximum acceptable downtime for restoration).

**Recommendations:**
* Implement the `spatie/laravel-backup` package to orchestrate database dumps, compression, off-site transit, and retention cleaning natively within Laravel.

### 3.2 Operational Monitoring (Health Checks)
**Mandatory Requirements:**
1. **Expanded Health Endpoint**: The existing `/api/v1/health` endpoint MUST be expanded to check:
   - **Database**: Ensure connectivity (already implemented).
   - **Queue**: Ensure the oldest job in the `jobs` table is not older than 5 minutes (indicating a crashed worker).
   - **Storage**: Verify that the `local` storage disk is writable and has > 1GB of free space.
2. **Graceful Degradation**: Health check failures MUST log the exact internal exception to the application logs but MUST NOT expose stack traces or internal paths to the HTTP response.
3. **Status Codes**: The endpoint MUST return HTTP 200 if all checks pass, and HTTP 503 (Service Unavailable) if any critical check fails.

### 3.3 Logging & Retention
**Mandatory Requirements:**
1. **Log Format**: Application logs MUST continue to use the `daily` driver to prevent single monolithic log files.
2. **Retention Validation**: The 14-day retention limit (`LOG_DAILY_DAYS=14`) MUST be strictly enforced to prevent disk exhaustion.
3. **Sanitization**: Logs MUST NOT record plain-text passwords, authentication tokens, or personally identifiable health information (PHI).

---

## 4. REQUIRED INFRASTRUCTURE & MIGRATIONS

* **Packages**: `spatie/laravel-backup` (or equivalent) will need to be installed.
* **Migrations**: No new database migrations are strictly required for backups or health checks, as the queue tables and standard schemas already exist.
* **Scheduled Tasks**: The Laravel Scheduler MUST be activated (e.g., via a system CRON job `* * * * * cd /path-to-project && php artisan schedule:run >> /dev/null 2>&1`) to trigger the backup routines.

---

## 5. SECURITY & FAILURE-HANDLING RULES

1. **Backup Failure Handling**: If a backup fails to run or transit to off-site storage, the system MUST log a critical error. (If an email/notification system exists, an alert MUST be sent to the system administrator).
2. **Queue Failure Handling**: If the queue health check fails, the API will return 503. A load balancer or uptime monitor (e.g., Uptime Kuma, Pingdom) should consume this endpoint and trigger alerts.
3. **Restore Verification**: The system administrator MUST manually perform a test restore of the database on a staging environment at least once every 6 months to guarantee backup integrity.

---

## 6. OPEN BUSINESS DECISIONS (Requires User Approval)

1. **Backup Storage Destination**: Which off-site storage provider should we configure for the backups? (e.g., Amazon S3, external SFTP server, or a secondary local disk).
2. **Alerting Mechanism**: When a backup fails, or the queue worker dies, should the system send an email alert? If so, what email address should be the recipient, and do we have an SMTP server configured?
3. **Backup Package**: Do you approve the installation of `spatie/laravel-backup` for handling the backup orchestration?

**Awaiting approval to proceed with the implementation.**
