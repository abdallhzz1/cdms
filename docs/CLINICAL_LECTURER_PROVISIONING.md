# Provision lecturer-only accounts from the October 2026 clinical-department list

The reviewed source is `backend/resources/imports/clinical_lecturers_2026_10.csv`. It contains 20 distinct university emails. The three explicitly excluded lecturers (Abdallah Qasim, Motaz Tamimi, Rami Alaysiyeh) are omitted and hard-blocked by email in the command. The repeated `rasheda@hebron.edu` row was included once. Rows containing `-` instead of an email were not imported. The name for `karimant@hebron.edu` was confirmed as **أ. كاريمان طيطي**.

`BASIC_LECTURER` is the existing isolated lecture-attendance role. This command does not grant clinical supervisor, department head, administrator, or attendance-manager access. It does not enroll lecturers in sections; the attendance manager assigns sections separately.

The default command is read-only. Review the table and resolve any `REVIEW` rows before `--apply`. An existing account with another role, direct permission grant, or inactive status stops the entire write; existing passwords, roles, names, and active flags are never changed.

If the administrator has reviewed a conflicting account and wants to preserve it unchanged, `--skip-conflicts` must be specified explicitly together with `--apply`. This creates only missing accounts and prints a warning about the skipped rows. In particular, an existing `BASIC_ATTENDANCE_ADMIN` account is not downgraded to lecturer access.

```bash
cd /path/to/cdms/backend
php artisan clinical:provision-lecturers
```

After confirming the names and emails, take a database backup and run:

```bash
php artisan clinical:provision-lecturers --apply
```

For the reviewed case where `hasasneha@hebron.edu` already has `BASIC_ATTENDANCE_ADMIN`, while `zughaierh@hebron.edu` already has only `BASIC_LECTURER`, use the explicit skip option to create the other 18 accounts without changing either existing account:

```bash
php artisan clinical:provision-lecturers --apply --skip-conflicts
```

New accounts receive unique cryptographically random passwords. The command writes them **once** to a mode-0600 CSV in the shell user's home directory, outside the repository and web document root. It prints only the file path, never the passwords. The administrator should transfer each credential privately and delete the CSV after handoff. If `HOME` is unavailable, provide an existing private directory outside the site with `--credentials-dir=/absolute/private/path`. The command refuses repository/web-root paths.

Running `--apply` again is safe: accounts already holding only the lecturer role are skipped and no second credentials file is created. Do not run test suites with `RefreshDatabase` against either live server database.
