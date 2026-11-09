set -eu
ROOT=/opt/haoyi-workspace
RELEASE="$ROOT/releases/20261105-integrated"
cd "$RELEASE"
python3 infra/deploy/tune-memory.py
test -f "$ROOT/shared/integration-validation/verified.json"
test -f "$ROOT/shared/integration-validation/legacy-rollback-verified.json"
test -f apps/franchise-portal/dist/report.html
python3 - <<'PY'
import json,subprocess,hashlib
from pathlib import Path
proof=json.loads(Path('/opt/haoyi-workspace/shared/integration-validation/verified.json').read_text())
assert proof['http_checks']==114 and proof['failed']==0
for image,expected in proof['images'].items():
 assert subprocess.check_output(['docker','image','inspect','--format','{{.Id}}',image],text=True).strip()==expected,'Verified image changed'
for path,expected in proof['files'].items():
 assert hashlib.sha256(Path(path).read_bytes()).hexdigest()==expected,'Verified release file changed'
print('Release image/file identities match the verified build.')
PY
ROLLBACK="$ROOT/shared/integration-rollback"
test ! -e "$ROLLBACK"
mkdir "$ROLLBACK"
chmod 700 "$ROLLBACK"
date -u +%FT%TZ > "$ROLLBACK/started"
restore_on_failure() {
    status=$?
    trap - EXIT
    if [ "$status" -ne 0 ] && [ -f "$ROLLBACK/ready" ]; then
        printf 'Cutover failed; restoring the previous application entry.\n' >&2
        if sh infra/deploy/rollback-integration.sh; then
            printf 'Previous entry restored; failed release was not activated.\n' >&2
        else
            printf 'Automatic recovery did not finish; retained backups require operator recovery.\n' >&2
        fi
    fi
    exit "$status"
}
trap restore_on_failure EXIT
cp -a /data/docker/nginx/html/haoyi "$ROLLBACK/html"
cp /data/docker/nginx/conf/haoyi-locations.conf.inc "$ROLLBACK/haoyi-locations.conf.inc"
cp /data/docker/nginx/conf/affiliate-workbench.locations.inc "$ROLLBACK/affiliate-workbench.locations.inc"
python3 infra/deploy/legacy-nginx-entry.py backup
touch "$ROLLBACK/ready"
docker stop haoyi-workspace-scheduler-1 haoyi-workspace-worker-1 haoyi-workspace-aihot-worker-1
docker stop affiliate-workbench-news
python3 infra/deploy/backup-verify.py
docker stop affiliate-workbench-api haoyi-lead-core
if docker inspect affiliate-workbench-api-rollback >/dev/null 2>&1; then docker stop affiliate-workbench-api-rollback; fi
# SQLite backup runs with the business writers stopped, including its WAL state.
docker run --rm -i -v /opt/affiliate-workbench/data:/source:ro -v "$ROLLBACK":/backup haoyi-legacy-crm:20261105-integrated python - <<'PY'
import sqlite3,json,hashlib,os
source=sqlite3.connect('file:/source/affiliate_workbench.db?mode=ro',uri=True)
backup=sqlite3.connect('/backup/affiliate_workbench.db');source.backup(backup);source.close()
assert backup.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
manifest={}
for (name,) in backup.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='alembic_version'"):
 columns=[r[1] for r in backup.execute('PRAGMA table_info("'+name+'")')]
 rows=sorted(json.dumps(list(r),ensure_ascii=False,default=str) for r in backup.execute('SELECT * FROM "'+name+'"'))
 manifest[name]={'columns':columns,'count':len(rows),'sha256':hashlib.sha256('\n'.join(rows).encode()).hexdigest()}
open('/backup/legacy-manifest.json','w').write(json.dumps(manifest))
os.chmod('/backup/affiliate_workbench.db',0o600);os.chmod('/backup/legacy-manifest.json',0o600)
print('Business writers paused; consistent SQLite backup verified:',len(manifest),'tables.')
PY
docker compose -f infra/deploy/compose.workspace.yaml run --rm --no-deps migrate
docker compose -f infra/deploy/compose.workspace.yaml up -d --no-deps legacy-crm lead-core
attempt=0
until docker exec haoyi-legacy-crm python -c "import urllib.request;urllib.request.urlopen('http://localhost:8000/api/health',timeout=3)" >/dev/null 2>&1 && docker exec haoyi-lead-core python -c "import urllib.request;urllib.request.urlopen('http://localhost:8000/health',timeout=3)" >/dev/null 2>&1; do
    attempt=$((attempt+1)); test "$attempt" -lt 30; sleep 2
done
docker run --rm -i -v /opt/affiliate-workbench/data:/app/data:ro -v "$ROLLBACK/legacy-manifest.json":/baseline.json:ro haoyi-legacy-crm:20261105-integrated python - <<'PY'
import sqlite3,json,hashlib
db=sqlite3.connect('file:/app/data/affiliate_workbench.db?mode=ro',uri=True)
manifest=json.load(open('/baseline.json'))
for name,old in manifest.items():
 columns=','.join('"'+c+'"' for c in old['columns'])
 rows=sorted(json.dumps(list(r),ensure_ascii=False,default=str) for r in db.execute('SELECT '+columns+' FROM "'+name+'"'))
 assert len(rows)==old['count'] and hashlib.sha256('\n'.join(rows).encode()).hexdigest()==old['sha256'],name
print('Production business records and relationships match the pre-cutover snapshot.')
PY
cp -a apps/franchise-portal/dist/. /data/docker/nginx/html/haoyi/
find /data/docker/nginx/html/haoyi -type d -exec chmod 755 {} +
find /data/docker/nginx/html/haoyi -type f -exec chmod 644 {} +
cp infra/deploy/haoyi-locations.conf.inc /data/docker/nginx/conf/haoyi-locations.conf.inc
cat > /data/docker/nginx/conf/affiliate-workbench.locations.inc <<'EOF'
location = /workbench { return 308 https://$host/haoyi/; }
location ^~ /workbench/api/ { return 410; }
location ^~ /workbench/ { return 308 https://$host/haoyi/; }
EOF
chmod 644 /data/docker/nginx/conf/haoyi-locations.conf.inc /data/docker/nginx/conf/affiliate-workbench.locations.inc
python3 infra/deploy/legacy-nginx-entry.py activate
docker exec nginx-project nginx -t
docker exec nginx-project nginx -s reload
docker compose -f infra/deploy/compose.workspace.yaml up -d --no-deps worker scheduler aihot-worker
date -u +%FT%TZ > "$ROLLBACK/activated"
trap - EXIT
printf 'Integrated workspace activated; previous versions and verified backups retained.\n'
