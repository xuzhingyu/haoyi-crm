#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 /absolute/backup-directory" >&2
  exit 2
fi

backup_dir="$1"
if [[ "$backup_dir" != /* ]]; then
  echo "backup directory must be absolute" >&2
  exit 2
fi
mkdir -p "$backup_dir"

echo "[1/5] backing up lead_core database"
docker compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" lead_core' > "$backup_dir/lead_core.dump"
echo "[2/5] backing up keycloak database"
docker compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" keycloak' > "$backup_dir/keycloak.dump"
echo "[3/5] backing up twenty database"
docker compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" twenty' > "$backup_dir/twenty.dump"
echo "[4/5] backing up object storage"
docker compose exec -T minio sh -c "tar -C /data -czf - ." > "$backup_dir/minio-data.tar.gz"
echo "[5/5] writing checksums"
(cd "$backup_dir" && sha256sum lead_core.dump keycloak.dump twenty.dump minio-data.tar.gz > SHA256SUMS)
echo "backup complete: $backup_dir"
