set -eu
cd /opt/haoyi-workspace/releases/20261105
docker compose -f infra/deploy/compose.workspace.yaml up -d postgres redis keycloak aihot-api aihot-worker autoloop
docker compose -f infra/deploy/compose.workspace.yaml ps --format 'table {{.Service}}\t{{.State}}\t{{.Health}}'
