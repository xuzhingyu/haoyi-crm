set -eu
ROOT=/opt/haoyi-workspace
HELPERS=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROLLBACK="$ROOT/shared/integration-rollback"
test -f "$ROLLBACK/haoyi-locations.conf.inc"
test -f "$ROLLBACK/affiliate-workbench.locations.inc"
test -f "$ROLLBACK/html/index.html"
# Additive tables/ledger stay intact. Do not replace a database containing new writes.
for name in affiliate-workbench-api affiliate-workbench-news haoyi-legacy-crm haoyi-lead-core haoyi-workspace-worker-1 haoyi-workspace-scheduler-1; do
    if docker inspect "$name" >/dev/null 2>&1; then docker stop "$name"; fi
done
cd "$ROOT/releases/20261105"
docker compose -f infra/deploy/compose.workspace.yaml up -d --no-deps lead-core worker scheduler aihot-worker
python3 "$HELPERS/legacy-rollback.py" --apply
python3 "$HELPERS/tune-memory.py"
# The original news worker has direct model credentials; leave it stopped.
attempt=0
until docker exec affiliate-workbench-api-rollback python -c "import urllib.request;urllib.request.urlopen('http://localhost:8000/api/health',timeout=3)" >/dev/null 2>&1 && docker exec haoyi-lead-core python -c "import urllib.request;urllib.request.urlopen('http://localhost:8000/health',timeout=3)" >/dev/null 2>&1; do
    attempt=$((attempt+1));test "$attempt" -lt 30;sleep 2
done
cp -a "$ROLLBACK/html/." /data/docker/nginx/html/haoyi/
cp "$ROLLBACK/haoyi-locations.conf.inc" /data/docker/nginx/conf/haoyi-locations.conf.inc
cp "$ROLLBACK/affiliate-workbench.locations.inc" /data/docker/nginx/conf/affiliate-workbench.locations.inc
python3 "$HELPERS/legacy-nginx-entry.py" restore
docker exec nginx-project nginx -t
docker exec nginx-project nginx -s reload
printf 'Previous application entry restored; no business or AI ledger records were deleted.\n'
