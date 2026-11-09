"""Server-side isolated restores and additive-migration checks. Prints counts only."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path('/opt/haoyi-workspace/shared/integration-validation')
ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
os.chmod(ROOT, 0o700)
PG = 'haoyi-workspace-postgres-1'
IMAGE = 'haoyi-workspace-api:20261105-integrated'
LEGACY = 'haoyi-legacy-crm:20261105-integrated'

def run(args, data=None):
    result = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError('Validation subprocess failed: ' + ' '.join(args[:3]) + '; output withheld')
    return result.stdout

def env_read(path):
    return dict(line.split('=', 1) for line in path.read_text().splitlines() if '=' in line and not line.startswith('#'))

def env_save(path, data):
    path.write_text(''.join(f'{k}={v}\n' for k,v in data.items()))
    os.chmod(path, 0o600)

LEGACY_SNAPSHOT = r'''
import sqlite3,json,hashlib
from pathlib import Path
src=sqlite3.connect('/app/data/affiliate_workbench.db')
dst=sqlite3.connect('/tmp/haoyi-validation.db');src.backup(dst);src.close()
assert dst.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
manifest={}
for (name,) in dst.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='alembic_version'"):
 cols=[r[1] for r in dst.execute('PRAGMA table_info("'+name+'")')]
 rows=sorted(json.dumps(list(r),ensure_ascii=False,default=str) for r in dst.execute('SELECT * FROM "'+name+'"'))
 manifest[name]={'columns':cols,'count':len(rows),'sha256':hashlib.sha256('\n'.join(rows).encode()).hexdigest()}
Path('/tmp/haoyi-validation-manifest.json').write_text(json.dumps(manifest))
dst.close()
'''

run(['docker','exec','-i','affiliate-workbench-api','python','-c',LEGACY_SNAPSHOT])
run(['docker','cp','affiliate-workbench-api:/tmp/haoyi-validation.db',str(ROOT/'legacy-before.db')])
run(['docker','cp','affiliate-workbench-api:/tmp/haoyi-validation-manifest.json',str(ROOT/'legacy-before.json')])
for path in [ROOT/'legacy-before.db',ROOT/'legacy-before.json']:os.chmod(path,0o600)
stage=ROOT/'legacy-data';stage.mkdir(exist_ok=True)
shutil.copy2(ROOT/'legacy-before.db',stage/'affiliate_workbench.db')
# Copy attachments and generated files independently of the live SQLite/WAL files.
attachment_hashes={}
for path in Path('/opt/affiliate-workbench/data').rglob('*'):
    if not path.is_file() or path.name.endswith(('.db','.db-wal','.db-shm','.sqlite','.sqlite3')):continue
    relative=path.relative_to('/opt/affiliate-workbench/data')
    target=stage/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,target)
    digest=hashlib.sha256(path.read_bytes()).hexdigest()
    assert hashlib.sha256(target.read_bytes()).hexdigest()==digest
    attachment_hashes[str(relative)]=digest
(ROOT/'attachment-hashes.json').write_text(json.dumps(attachment_hashes));os.chmod(ROOT/'attachment-hashes.json',0o600)

legacy_env=env_read(ROOT.parent/'legacy-crm.env')
legacy_env['AI_GATEWAY_URL']='http://haoyi-core-validation:8000/api/v1/internal/ai/chat-completions'
env_save(ROOT/'legacy.env',legacy_env)
run(['docker','run','--rm','--network','haoyi-workspace-net','--env-file',str(ROOT/'legacy.env'),'-v',str(stage)+':/app/data',LEGACY,'python','-c',"import os;from app.main import app;from app.database import apply_schema;apply_schema(app.state.engine,os.environ['DATABASE_URL']);print('schema ready')"])
VERIFY = r'''
import sqlite3,json,hashlib
db=sqlite3.connect('/app/data/affiliate_workbench.db')
assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
m=json.load(open('/baseline.json'))
for name,expected in m.items():
 cols=','.join('"'+c+'"' for c in expected['columns'])
 rows=sorted(json.dumps(list(r),ensure_ascii=False,default=str) for r in db.execute('SELECT '+cols+' FROM "'+name+'"'))
 assert len(rows)==expected['count'] and hashlib.sha256('\n'.join(rows).encode()).hexdigest()==expected['sha256'],name
print('Legacy restore/migration verified:',len(m),'tables; existing records unchanged.')
'''
print(run(['docker','run','--rm','-v',str(stage)+':/app/data','-v',str(ROOT/'legacy-before.json')+':/baseline.json:ro',LEGACY,'python','-c',VERIFY]).decode().strip())
print('Attachment restore verified:',len(attachment_hashes),'files.')

workspace=env_read(ROOT.parent/'workspace.env')
for database in ['haoyi_validation_upgrade','haoyi_validation_fresh']:
    exists=run(['docker','exec',PG,'psql','-U','postgres','-Atc',"SELECT count(*) FROM pg_database WHERE datname='"+database+"'"]).strip()
    if exists==b'1':raise RuntimeError('Validation database already exists; inspect previous run before retry')
    run(['docker','exec',PG,'createdb','-U','postgres','-O','lead_core',database])
    if database.endswith('upgrade'):
        dump=run(['docker','exec',PG,'pg_dump','-U','postgres','-Fc','lead_core'])
        (ROOT/'lead-core-before.dump').write_bytes(dump);os.chmod(ROOT/'lead-core-before.dump',0o600)
        run(['docker','exec','-i',PG,'pg_restore','-U','postgres','-d',database],dump)
    copy=dict(workspace)
    copy['LEAD_CORE_DATABASE_URL']=workspace['LEAD_CORE_DATABASE_URL'].rsplit('/',1)[0]+'/'+database
    copy['LEAD_CORE_LEGACY_CRM_API_URL']='http://haoyi-legacy-validation:8000'
    copy['LEAD_CORE_LLM_API_KEY']=''
    copy['LEAD_CORE_AUTOLOOP_BASE_URL']=''
    path=ROOT/(database+'.env');env_save(path,copy)
    result=run(['docker','run','--rm','--network','haoyi-workspace-net','--env-file',str(path),IMAGE,'python','-m','lead_core.intelligence.migrate'])
    print('PostgreSQL migration verified:',database)
    run(['docker','run','--rm','--network','haoyi-workspace-net','--env-file',str(path),IMAGE,'python','-m','lead_core.intelligence.pg_smoke'])
print('Isolated restore and migrations completed; validation databases retained for integration checks.')
