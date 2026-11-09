"""Preserve the original container; verify/start a separate old-image rollback API.

--verify uses an isolated SQLite backup and a network-disabled temporary container.
--apply requires that verification and stopped production API writers. It never
changes the original container, passwords, Alembic revision or existing ledger.
Environment values travel only over the local Docker socket, never argv/log files.
Direct model credentials/endpoints are cleared; rollback keeps manual/template work.
"""
import argparse
import datetime
import http.client
import json
import os
import socket
import subprocess
import time
from pathlib import Path

ROOT = Path('/opt/haoyi-workspace/shared')
SOURCE = 'affiliate-workbench-api'
TARGET = 'affiliate-workbench-api-rollback'
DATA = '/opt/affiliate-workbench/data'
PROOF = ROOT / 'integration-validation' / 'legacy-rollback-verified.json'


class DockerConnection(http.client.HTTPConnection):
    def __init__(self):
        super().__init__('localhost', timeout=30)

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect('/var/run/docker.sock')


def docker(method, path, data=None, allow_missing=False):
    connection = DockerConnection()
    try:
        connection.request(method, '/v1.41' + path,
                           body=json.dumps(data).encode() if data is not None else None,
                           headers={'Content-Type': 'application/json'})
        response = connection.getresponse()
        body = response.read()
        if response.status == 404 and allow_missing:
            return None
        if response.status >= 300:
            raise RuntimeError(f'Docker operation failed (HTTP {response.status}); response withheld')
        return json.loads(body) if body else None
    finally:
        connection.close()


def inspect(name, optional=False):
    return docker('GET', '/containers/' + name + '/json', allow_missing=optional)


def run(args, timeout=90):
    result = subprocess.run(args, capture_output=True, timeout=timeout, check=False)
    if result.returncode:
        raise RuntimeError('Container check failed; output withheld')
    return result.stdout


def source_config():
    source = inspect(SOURCE)
    mounts = source['Mounts']
    if len(mounts) != 1 or mounts[0]['Type'] != 'bind' or mounts[0]['Source'] != DATA or mounts[0]['Destination'] != '/app/data':
        raise RuntimeError('Unexpected original mount configuration')
    if source['HostConfig'].get('PortBindings'):
        raise RuntimeError('Unexpected original published ports')
    env = dict(value.split('=', 1) for value in source['Config'].get('Env', []))
    if env.get('DATABASE_URL') not in {'sqlite:////app/data/affiliate_workbench.db', 'sqlite+pysqlite:////app/data/affiliate_workbench.db'}:
        raise RuntimeError('Unexpected original database location')
    env['RUN_MIGRATIONS'] = '0'
    # Original ai_provider.py reads AI_*; studio_ai.py reads STUDIO_{channel}_*.
    # Never let the old image bypass the new workspace's shared model gateway.
    for key in ['AI_API_KEY', 'AI_BASE_URL', 'AI_MODEL']:
        env[key] = ''
    for channel in ['LOCAL', 'NEWS']:
        for suffix in ['URL', 'MODEL', 'KEY']:
            env[f'STUDIO_{channel}_{suffix}'] = ''
        env[f'STUDIO_{channel}_DAILY_LIMIT'] = '0'
    for key in list(env):
        if key.startswith('STUDIO_') and key.endswith(('_URL', '_MODEL', '_KEY')):
            env[key] = ''
        elif key.startswith('STUDIO_') and key.endswith('_DAILY_LIMIT'):
            env[key] = '0'
    return source, env


def create(source, env, name, data_path, validation):
    config = source['Config']
    networks = list(source['NetworkSettings']['Networks'])
    if not validation and not networks:
        raise RuntimeError('Original network unavailable')
    payload = {key: config[key] for key in ['Cmd', 'Entrypoint', 'User', 'WorkingDir', 'ExposedPorts'] if config.get(key) is not None}
    payload.update({'Image': source['Image'], 'Env': [key + '=' + value for key, value in env.items()],
                    'Labels': {'org.haoyi.rollback-source-image': source['Image'], 'org.haoyi.rollback-only': 'true'},
                    'HostConfig': {'Binds': [str(data_path) + ':/app/data'], 'NetworkMode': 'none' if validation else networks[0],
                                   'RestartPolicy': {'Name': 'no' if validation else 'unless-stopped'},
                                   'MemorySwappiness': 30,
                                   'Memory': source['HostConfig'].get('Memory', 0),
                                   'NanoCpus': source['HostConfig'].get('NanoCpus', 0)}})
    result = docker('POST', '/containers/create?name=' + name, payload)
    if not validation:
        for network in networks[1:]:
            docker('POST', '/networks/' + network + '/connect', {'Container': result['Id']})
    return result['Id']


def healthy(name):
    command = ['docker', 'exec', name, 'python', '-c',
               "import urllib.request;urllib.request.urlopen('http://localhost:8000/api/health',timeout=2).read()"]
    for _ in range(30):
        result = subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5, check=False)
        if result.returncode == 0:
            return
        time.sleep(1)
    raise RuntimeError('Rollback API health check did not pass')


SNAPSHOT = r'''
import sqlite3,json,hashlib,os
src=sqlite3.connect('file:/source/affiliate_workbench.db?mode=ro',uri=True)
dst=sqlite3.connect('/backup/affiliate_workbench.db');src.backup(dst);src.close()
assert dst.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
manifest={}
for (name,) in dst.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"):
 cols=[r[1] for r in dst.execute('PRAGMA table_info("'+name+'")')]
 rows=sorted(json.dumps(list(r),ensure_ascii=False,default=str) for r in dst.execute('SELECT * FROM "'+name+'"'))
 manifest[name]={'columns':cols,'count':len(rows),'sha256':hashlib.sha256('\n'.join(rows).encode()).hexdigest()}
open('/backup/baseline.json','w').write(json.dumps(manifest));dst.close()
os.chmod('/backup/affiliate_workbench.db',0o600);os.chmod('/backup/baseline.json',0o600)
'''

VERIFY = r'''
import sqlite3,json,hashlib,os
from sqlalchemy import select,func
from app.main import app
from app.database import Base
from app.studio_ai import configured
assert not os.getenv('AI_API_KEY') and not os.getenv('AI_BASE_URL')
assert not configured('LOCAL') and not configured('NEWS')
db=sqlite3.connect('file:/app/data/affiliate_workbench.db?mode=ro',uri=True)
assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
baseline=json.load(open('/app/data/baseline.json'))
assert {'external_operations','external_lead_links'} <= set(baseline),'New ledgers missing'
for name,old in baseline.items():
 cols=[r[1] for r in db.execute('PRAGMA table_info("'+name+'")')]
 assert cols==old['columns'],'Schema changed'
 rows=sorted(json.dumps(list(r),ensure_ascii=False,default=str) for r in db.execute('SELECT * FROM "'+name+'"'))
 assert len(rows)==old['count'] and hashlib.sha256('\n'.join(rows).encode()).hexdigest()==old['sha256'],'Existing data changed'
assert set(baseline)=={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")},'Table set changed'
with app.state.engine.connect() as connection:
 for table in Base.metadata.sorted_tables:
  connection.execute(select(func.count()).select_from(table)).scalar()
  connection.execute(select(table).limit(1)).first()
print(json.dumps({'tables':len(baseline),'existing_data_unchanged':True,'schema_unchanged':True,'ledger_preserved':True,'old_models_readable':True,'cloud_ai_disabled':True}))
'''


def verify():
    source, env = source_config()
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S')
    stage = ROOT / 'rollback-compat-validation' / stamp
    stage.parent.mkdir(mode=0o700, exist_ok=True)
    stage.mkdir(mode=0o700)
    name = 'haoyi-legacy-rollback-check-' + stamp.lower()
    run(['docker', 'run', '--rm', '--network', 'none', '-v', DATA + ':/source:ro', '-v', str(stage) + ':/backup', source['Image'], 'python', '-c', SNAPSHOT])
    created = False
    try:
        create(source, env, name, stage, True)
        created = True
        docker('POST', '/containers/' + name + '/start')
        healthy(name)
        checks = json.loads(run(['docker', 'exec', name, 'python', '-c', VERIFY]))
        proof = {'verified_at': stamp, 'source_image': source['Image'], 'clone': str(stage), **checks}
        PROOF.parent.mkdir(mode=0o700, exist_ok=True)
        PROOF.write_text(json.dumps(proof, indent=2) + '\n')
        os.chmod(PROOF, 0o600)
        print(json.dumps({'result': 'verified', **checks}))
    finally:
        if created:
            docker('DELETE', '/containers/' + name + '?force=true&v=false')


def apply():
    source, env = source_config()
    proof = json.loads(PROOF.read_text())
    if proof.get('source_image') != source['Image'] or not all(proof.get(key) for key in ['existing_data_unchanged', 'schema_unchanged', 'ledger_preserved', 'old_models_readable', 'cloud_ai_disabled']):
        raise RuntimeError('Matching isolated rollback verification required')
    for name in [SOURCE, 'haoyi-legacy-crm']:
        current = inspect(name, True)
        if current and current['State']['Running']:
            raise RuntimeError('Production API writers must be stopped before rollback')
    current = inspect(TARGET, True)
    if current is not None:
        current_env = dict(value.split('=', 1) for value in current['Config'].get('Env', []))
        mounts = current['Mounts']
        expected_mount = len(mounts) == 1 and mounts[0]['Type'] == 'bind' and mounts[0]['Source'] == DATA and mounts[0]['Destination'] == '/app/data' and mounts[0]['RW']
        config_matches = all(current['Config'].get(key) == source['Config'].get(key) for key in ['Cmd', 'Entrypoint', 'User', 'WorkingDir'])
        networks_match = set(current['NetworkSettings']['Networks']) == set(source['NetworkSettings']['Networks'])
        if (current['Image'] != source['Image'] or current['Config'].get('Labels', {}).get('org.haoyi.rollback-only') != 'true'
                or current_env != env or not expected_mount or not config_matches or not networks_match or current['HostConfig'].get('PortBindings')):
            raise RuntimeError('Unexpected rollback container; preserved for review')
    else:
        create(source, env, TARGET, DATA, False)
    if not inspect(TARGET)['State']['Running']:
        docker('POST', '/containers/' + TARGET + '/start')
    healthy(TARGET)
    print('Verified old-image rollback API healthy; original container configuration unchanged.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--verify', action='store_true')
    modes.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    try:
        verify() if args.verify else apply()
    except Exception as error:  # noqa: BLE001 -- do not leak Docker responses or inherited environment on any failure.
        raise SystemExit(f'Rollback compatibility operation failed ({type(error).__name__}); details withheld, original container and database version retained.') from None
