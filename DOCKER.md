# CDMS Docker deployment

The production stack serves the React SPA and Laravel API from the same origin.
Set that origin in `.env.docker`; the examples use `https://cdms.hebron.edu`.
The long-lived state is held in the explicitly named
Docker volumes `cdms_mysql_data` and `cdms_laravel_storage`. Rebuilding or
recreating containers does not remove either volume.

The Laravel runtime uses PHP 8.4 because the committed Composer lock currently
contains Symfony 8.1 packages that require PHP 8.4.1 or newer.

## Server prerequisites

- Docker Engine with the Compose v2 plugin
- Git access to this repository
- DNS for `cdms.hebron.edu`
- An HTTPS reverse proxy/load balancer in front of port 80, or a locally managed
  TLS termination configuration supplied by the Computer Center
- At least two independent backup destinations, with one copy off the Docker host

## First deployment

```bash
git clone <repository-url> /opt/cdms
cd /opt/cdms
cp .env.docker.example .env.docker
chmod 600 .env.docker
# Replace every CHANGE_ME value and generate strong database passwords.

docker compose --env-file .env.docker build
docker compose --env-file .env.docker up -d db
docker compose --env-file .env.docker run --rm app php artisan migrate --force
docker compose --env-file .env.docker run --rm app php artisan db:seed --force
docker compose --env-file .env.docker up -d
docker compose --env-file .env.docker exec app php artisan migrate:status
curl -fsS https://cdms.hebron.edu/api/v1/health
```

Generate `APP_KEY` once, before the first deployment, without committing it:

```bash
docker compose --env-file .env.docker run --rm app php artisan key:generate --show
```

Copy the displayed value into `APP_KEY` in `.env.docker`. Never regenerate it
after users or encrypted application data exist.

The seed command is intended for initial roles/permissions/reference data. Do not
run development seeding in production; `SEED_DEV_ADMIN` must remain false.

If this deployment replaces an existing non-Docker installation, restore or copy
its existing `backend/storage/app` contents into `cdms_laravel_storage` before
accepting traffic. A fresh Git clone does not contain uploads because they are
correctly ignored by Git. For a local checkout that still contains those files:

```bash
docker volume create cdms_laravel_storage
docker run --rm -v cdms_laravel_storage:/target -v "$PWD/backend/storage/app:/source:ro" alpine:3.22 sh -c 'cp -a /source/. /target/'
docker compose --env-file .env.docker run --rm storage-init
```

## Updating from Git

Create and verify backups before every update, then:

```bash
cd /opt/cdms
git fetch --all --prune
git pull --ff-only
docker compose --env-file .env.docker build --pull
docker compose --env-file .env.docker run --rm app php artisan migrate --force
docker compose --env-file .env.docker up -d --remove-orphans
docker compose --env-file .env.docker exec app php artisan migrate:status
docker compose --env-file .env.docker ps
```

Do not run `docker compose down -v`, `docker volume rm cdms_mysql_data`, or
`docker volume rm cdms_laravel_storage`. Those commands destroy persistent data.

## Backups

Create a host directory that is itself backed up off-server:

```bash
install -d -m 700 /var/backups/cdms
```

Database backup:

```bash
docker compose --env-file .env.docker exec -T db sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers --events "$MYSQL_DATABASE"' | gzip > /var/backups/cdms/mysql-$(date +%F-%H%M%S).sql.gz
```

Uploaded files backup:

```bash
docker run --rm -v cdms_laravel_storage:/source:ro -v /var/backups/cdms:/backup alpine:3.22 sh -c 'tar -czf /backup/uploads-$(date +%F-%H%M%S).tar.gz -C /source .'
```

Copy both resulting archives to independent off-host storage and regularly test
a restore on a separate environment. Docker volumes are persistence, not backup.

## Operational checks

```bash
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs --tail=200 app worker scheduler nginx db
curl -fsS https://cdms.hebron.edu/api/v1/health
```

`php artisan cdms:readiness` intentionally reports a failure while
`BACKUP_ENABLED=false`. Run it as the final production gate after the missing
backup packages, S3-compatible destination, and restore drill have been completed.

TLS termination must forward `Host`, `X-Forwarded-Host`, `X-Forwarded-Port`, and
`X-Forwarded-Proto: https`. Only the Nginx HTTP port should be published; MySQL
and PHP-FPM remain reachable only through the Compose network.
