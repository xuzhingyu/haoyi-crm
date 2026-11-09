set -eu
ROOT=/opt/haoyi-workspace
RELEASE="$ROOT/releases/20261105"
cd "$RELEASE"
docker compose -f infra/deploy/compose.workspace.yaml up -d
docker compose -f infra/deploy/compose.workspace.yaml exec -T lead-core python -m lead_core.intelligence.bootstrap --org 00000000-0000-4000-8000-000000000001 --admin 00000000-0000-4000-8000-000000000011 --executive 00000000-0000-4000-8000-000000000012
if [ "${RUN_PG_SMOKE:-1}" = "1" ]; then
  docker compose -f infra/deploy/compose.workspace.yaml exec -T lead-core python -m lead_core.intelligence.pg_smoke
fi

attempt=0
until docker exec haoyi-lead-core python -c "import urllib.request; urllib.request.urlopen('http://keycloak:8080/haoyi-auth/realms/haoyi/.well-known/openid-configuration',timeout=5)" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    printf 'Authentication startup did not finish; routes have not been changed.\n' >&2
    exit 1
  fi
  sleep 5
done
python3 infra/deploy/provision-auth.py
docker network connect haoyi-workspace-net nginx-project 2>/dev/null || docker inspect nginx-project --format '{{json .NetworkSettings.Networks}}' | grep -q 'haoyi-workspace-net'
test -f apps/franchise-portal/dist/index.html
test -f apps/franchise-portal/dist/report.html
mkdir -p /data/docker/nginx/html/haoyi
cp -a apps/franchise-portal/dist/. /data/docker/nginx/html/haoyi/
find /data/docker/nginx/html/haoyi -type d -exec chmod 755 {} +
find /data/docker/nginx/html/haoyi -type f -exec chmod 644 {} +
cp infra/deploy/haoyi-locations.conf.inc /data/docker/nginx/conf/haoyi-locations.conf.inc
chmod 644 /data/docker/nginx/conf/haoyi-locations.conf.inc
python3 - <<'PY'
from pathlib import Path
import shutil,re
root=Path('/data/docker/nginx/conf')
backup=Path('/opt/haoyi-workspace/shared/nginx-backup');backup.mkdir(exist_ok=True)
for name in ['default.conf','haoyi-ip.conf']:
 p=root/name
 if not p.exists():continue
 text=p.read_text()
 if not (backup/name).exists():shutil.copy2(p,backup/name)
 if 'include /etc/nginx/conf.d/haoyi-locations.conf.inc;' not in text:
  text=re.sub(r'(server_name\s+(?:qiushuihao\.fun|120\.27\.208\.216)\s*;)',r'\1\n    include /etc/nginx/conf.d/haoyi-locations.conf.inc;',text)
 if name=='haoyi-ip.conf' and 'include /etc/nginx/conf.d/affiliate-workbench.locations.inc;' not in text:
  text=text.replace('include /etc/nginx/conf.d/haoyi-locations.conf.inc;', 'include /etc/nginx/conf.d/haoyi-locations.conf.inc;\n    include /etc/nginx/conf.d/affiliate-workbench.locations.inc;')
 p.write_text(text)
PY
if ! docker exec nginx-project nginx -t; then
  cp "$ROOT/shared/nginx-backup/default.conf" /data/docker/nginx/conf/default.conf
  cp "$ROOT/shared/nginx-backup/haoyi-ip.conf" /data/docker/nginx/conf/haoyi-ip.conf
  exit 1
fi
docker exec nginx-project nginx -s reload
printf 'Workspace routes activated; existing routes retained.\n'
