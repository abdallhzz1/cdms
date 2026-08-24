# Student group self-registration and Gmail OTP

## Approved rules

- Fourth-year main groups: `L`, `M`, `N`.
- Fifth-year main groups: `A`, `B`, `C`.
- Sixth year remains available in the UI but no roster is imported yet.
- `academic_registration_status` is the student's general academic registration state: `registered` or `unregistered`.
- Student email is derived exclusively as `{university_number}@students.hebron.edu`.
- A student never receives group data before successful OTP verification.
- SMTP failure is fail-closed: the challenge is deleted, no session is issued, and no protected data is returned.

## Gmail SMTP setup

The committed `.env.example` contains no secret. In `backend/.env`, set:

```dotenv
MAIL_MAILER=smtp
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_SCHEME=smtp
MAIL_USERNAME=abdallhz@hebron.edu
MAIL_PASSWORD=YOUR_GMAIL_APP_PASSWORD
MAIL_FROM_ADDRESS=abdallhz@hebron.edu
MAIL_FROM_NAME="CDMS - Clinical Department"
```

Use a Gmail App Password, not the account's normal password. After changing `.env`, run:

```bash
php artisan config:clear
```

## Administrative workflow

1. Open `/distribution/groups`.
2. Create a cycle for the academic year and level.
3. Import CSV rows in this order: university number, Arabic name, main-group letter, `registered`/`unregistered`.
4. Add, edit, archive, or delete empty subgroups; capacity is restricted to 5 or 6.
5. Open registration and copy the generated public link.
6. Close the cycle at the deadline.

## Security controls

OTP codes expire after 10 minutes and are stored only as password hashes. Verified access tokens expire after 20 minutes and are stored only as SHA-256 hashes. Request and verification endpoints are rate-limited. Seat selection locks the subgroup row and performs the capacity check and assignment in one database transaction.
