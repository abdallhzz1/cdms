# Secure cPanel deployment

The Git repository and Laravel application must remain outside the web document
root. The intended layout on the current host is:

```text
/home/alfajrhe/repositories/cdms/                 private repository and backend
/home/alfajrhe/domains/cdms.four7.ps/public_html/ public build only
```

`public_html` is deployed from an explicit allow-list and contains only:

```text
.htaccess
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

if [ ! -f backend/.env ] && [ -f /home/alfajrhe/domains/cdms.four7.ps/public_html/backend/.env ]; then
  cp /home/alfajrhe/domains/cdms.four7.ps/public_html/backend/.env backend/.env
fi

if [ ! -f backend/vendor/autoload.php ] && [ -f /home/alfajrhe/domains/cdms.four7.ps/public_html/backend/vendor/autoload.php ]; then
  mkdir -p backend/vendor
  cp -a /home/alfajrhe/domains/cdms.four7.ps/public_html/backend/vendor/. backend/vendor/
fi

if [ -d /home/alfajrhe/domains/cdms.four7.ps/public_html/backend/storage ]; then
  rsync -a /home/alfajrhe/domains/cdms.four7.ps/public_html/backend/storage/ backend/storage/
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
curl -I https://cdms.four7.ps/.git/config
curl -I https://cdms.four7.ps/backend/.env
curl -I https://cdms.four7.ps/frontend/package.json
curl -I https://cdms.four7.ps/README.md
curl -I https://cdms.four7.ps/api/v1/health
```

The first four requests must return `403` or `404`. The health endpoint must
return the application's expected successful response.
