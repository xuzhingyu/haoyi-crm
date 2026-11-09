#!/usr/bin/env bash
set -euo pipefail

create_database() {
  local database="$1"
  local username="$2"
  local password="$3"
  psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
    --set database="$database" --set username="$username" --set password="$password" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'username', :'password')
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = :'username') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'database', :'username')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'database') \gexec
SQL
}

create_database lead_core lead_core "$LEAD_CORE_DB_PASSWORD"
create_database keycloak keycloak "$KEYCLOAK_DB_PASSWORD"
create_database twenty twenty "$TWENTY_DB_PASSWORD"
