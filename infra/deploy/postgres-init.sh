#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres --set=app_password="$LEAD_CORE_DB_PASSWORD" --set=auth_password="$KEYCLOAK_DB_PASSWORD" --set=aihot_password="$AIHOT_DB_PASSWORD" <<'SQL'
CREATE ROLE lead_core LOGIN PASSWORD :'app_password' NOSUPERUSER NOBYPASSRLS;
CREATE ROLE keycloak LOGIN PASSWORD :'auth_password' NOSUPERUSER;
CREATE ROLE aihot LOGIN PASSWORD :'aihot_password' NOSUPERUSER;
CREATE DATABASE lead_core OWNER lead_core;
CREATE DATABASE keycloak OWNER keycloak;
CREATE DATABASE aihot OWNER aihot;
SQL
