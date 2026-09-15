# Secure cPanel deployment

The Git repository and Laravel application must remain outside the web document
root. The intended layout on the current host is:

```text
/home/alfajrhe/repositories/cdms/                 private repository and backend
/home/alfajrhe/cdms.alfajrhealth.com/             public build only
```

The domain document root is deployed from an explicit allow-list and contains
only:

```text
.htaccess
.well-known/ (when managed by the host for TLS validation)
assets/
favicon.svg
index.html
index.php
robots.txt
storage -> /home/alfajrhe/repositories/cdms/backend/storage/app/public
templates/
```

Before the first secure deployment, preserve the Laravel environment, Composer
dependencies, and persistent storage from the old public copy. Run this block
before using **Deploy HEAD Commit**, because deployment intentionally removes
everything outside the public allow-list:

```bash
cd /home/alfajrhe/repositories/cdms

if [ ! -f backend/.env ] && [ -f /home/alfajrhe/cdms.alfajrhealth.com/backend/.env ]; then
  cp /home/alfajrhe/cdms.alfajrhealth.com/backend/.env backend/.env
fi

if [ ! -f backend/vendor/autoload.php ] && [ -f /home/alfajrhe/cdms.alfajrhealth.com/backend/vendor/autoload.php ]; then
  mkdir -p backend/vendor
  cp -a /home/alfajrhe/cdms.alfajrhealth.com/backend/vendor/. backend/vendor/
fi

if [ -d /home/alfajrhe/cdms.alfajrhealth.com/backend/storage ]; then
  rsync -a /home/alfajrhe/cdms.alfajrhealth.com/backend/storage/ backend/storage/
fi

mkdir -p backend/storage/app/public backend/storage/framework/{cache,sessions,views} backend/bootstrap/cache
chmod -R 775 backend/storage backend/bootstrap/cache
chmod 600 backend/.env

test -f backend/.env
test -f backend/vendor/autoload.php
```

Then use cPanel's **Deploy HEAD Commit** action. Deployment stops before changing
`public_html` if `.env`, Composer dependencies, or the locally generated frontend
build is missing.

After deployment, run:

```bash
cd /home/alfajrhe/repositories/cdms/backend
php artisan migrate --force
php artisan optimize:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache
php artisan queue:restart
```

Verify that public source paths are denied:

```bash
curl -I https://cdms.alfajrhealth.com/.git/config
curl -I https://cdms.alfajrhealth.com/backend/.env
curl -I https://cdms.alfajrhealth.com/frontend/package.json
curl -I https://cdms.alfajrhealth.com/README.md
curl -I https://cdms.alfajrhealth.com/api/v1/health
```

The first four requests must return `403` or `404`. The health endpoint must
return the application's expected successful response.

## Student Code of Conduct controlled rollout

After deploying the student-policy migration, confirm the two permissions
`student_policies.view` and `student_policies.manage` appear in the permission
matrix. The migration grants both to `SYS_ADMIN`; use the matrix to grant the
minimum required access to the staff responsible for circulation and filing.

Before publishing the real campaign:

1. Obtain the externally approved bilingual PDF printed on the official College
   of Medicine letterhead. Do not upload a draft or auto-translated version.
2. Create a short test campaign for a controlled academic-year/level dataset.
3. Verify OTP delivery from the production mail account, PDF opening, versioned
   acknowledgement, paper-receipt recording, private scan download, and Excel
   export.
4. Confirm the signed scan appears in the student's Documents tab and that its
   storage path is never returned by the API.
5. Close the test campaign, upload the final immutable version, and publish the
   real campaign. Corrections require a new version and campaign.

The electronic acknowledgement proves that the student opened and acknowledged
the exact stored document hash. It does not replace the required handwritten
signature or the physical copy retained in the student file.
