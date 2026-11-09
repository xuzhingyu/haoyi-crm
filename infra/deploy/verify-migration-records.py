"""Compare existing PostgreSQL columns across the original and its migrated clone."""
import json
from pathlib import Path
import subprocess

def query(database, sql):
    result=subprocess.run(['docker','exec','haoyi-workspace-postgres-1','psql','-X','-U','postgres','-At','-d',database,'-c',sql],capture_output=True,text=True)
    if result.returncode:raise RuntimeError('Read-only migration comparison failed; output withheld')
    return result.stdout.strip()

def quote(value):return '"'+value.replace('"','""')+'"'

tables=query('lead_core',"SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename!='alembic_version' ORDER BY tablename").splitlines()
for name in tables:
    columns=query('lead_core',"SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='"+name.replace("'","''")+"' ORDER BY ordinal_position").splitlines()
    sql="SELECT count(*), md5(coalesce(string_agg(row_to_json(t)::text,E'\\n' ORDER BY row_to_json(t)::text),'')) FROM (SELECT "+','.join(map(quote,columns))+" FROM "+quote(name)+") t"
    if query('lead_core',sql)!=query('haoyi_validation_upgrade',sql):
        raise RuntimeError('Existing records changed in migration comparison: '+name)
calls=query('haoyi_validation_upgrade','SELECT count(*) FROM ai_model_calls WHERE ai_job_id IS NULL')
assert calls=='0', 'Historical model calls must link to the generic ledger'
for db in ['haoyi_validation_upgrade','haoyi_validation_fresh']:
    query('postgres','REVOKE ALL ON DATABASE '+quote(db)+' FROM PUBLIC')
root=Path('/opt/haoyi-workspace/shared/integration-validation')
(root/'migration-records.json').write_text(json.dumps({'existing_tables_unchanged':len(tables),'historical_calls_linked':True}))
print('Migrated PostgreSQL:',len(tables),'existing tables/columns unchanged; historical AI calls linked.')
