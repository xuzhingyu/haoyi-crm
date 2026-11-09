#!/usr/bin/env bash
set -euo pipefail

if [[ "${CONFIRM_RESTORE:-}" != "haoyi-crm" ]]; then
  echo "set CONFIRM_RESTORE=haoyi-crm after verifying the target environment" >&2
  exit 2
fi
if [[ $# -ne 1 || "$1" != /* ]]; then
  echo "usage: CONFIRM_RESTORE=haoyi-crm $0 /absolute/backup-directory" >&2
  exit 2
fi

backup_dir="$1"
(cd "$backup_dir" && sha256sum --check SHA256SUMS)

echo "[1/5] restoring lead_core database"
docker compose exec -T postgres sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d lead_core' < "$backup_dir/lead_core.dump"
echo "[2/5] restoring keycloak database"
docker compose exec -T postgres sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d keycloak' < "$backup_dir/keycloak.dump"
echo "[3/5] restoring twenty database"
docker compose exec -T postgres sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d twenty' < "$backup_dir/twenty.dump"
echo "[4/5] restoring object storage"
docker compose exec -T minio sh -c "find /data -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +"
docker compose exec -T minio sh -c "tar -C /data -xzf -" < "$backup_dir/minio-data.tar.gz"
echo "[5/5] restore complete; start applications and run smoke checks"
