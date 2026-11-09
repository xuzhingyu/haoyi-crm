"""Run on the existing server. Reuse only the required model settings, never print them."""
from pathlib import Path
import json, os, secrets, base64

SHARED=Path('/opt/haoyi-workspace/shared')
SHARED.mkdir(parents=True,exist_ok=True)
os.chmod(SHARED,0o700)

def read_env(path):
    out={}
    for raw in path.read_text(encoding='utf-8-sig').splitlines():
        if raw.strip() and not raw.lstrip().startswith('#') and '=' in raw:
            k,v=raw.split('=',1);out[k.strip()]=v.strip().strip('\"\'')
    return out

def save(name,values):
    path=SHARED/name
    if path.exists(): return
    content=''.join(f'{k}={v}\n' for k,v in values.items())
    path.write_text(content,encoding='utf-8');os.chmod(path,0o600)

state=SHARED/'bootstrap.json'
if state.exists():
    generated=json.loads(state.read_text())
else:
    generated={key:secrets.token_urlsafe(32) for key in ['postgres','app_db','auth_db','aihot_db','worker','source','owner','loop_worker','aihot_admin','session','image','kc_admin','xu_password','ceo_password']}
    generated['fernet']=base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()
    state.write_text(json.dumps(generated),encoding='utf-8');os.chmod(state,0o600)
g=generated
old=read_env(Path('/opt/haoyi-system/shared/.env'))
api_key=old.get('DEEPSEEK_API_KEY','')
if not api_key: raise SystemExit('Existing DeepSeek API configuration is missing; no secrets printed.')
origin=os.environ.get('WORKSPACE_ORIGIN','https://120.27.208.216').rstrip('/')
save('database.env',{'POSTGRES_USER':'postgres','POSTGRES_PASSWORD':g['postgres'],'LEAD_CORE_DB_PASSWORD':g['app_db'],'KEYCLOAK_DB_PASSWORD':g['auth_db'],'AIHOT_DB_PASSWORD':g['aihot_db']})
save('workspace.env',{
 'LEAD_CORE_ENVIRONMENT':'production','LEAD_CORE_AUTH_MODE':'oidc',
 'LEAD_CORE_DATABASE_URL':f"postgresql+psycopg://lead_core:{g['app_db']}@postgres:5432/lead_core",
 'LEAD_CORE_REDIS_URL':'redis://redis:6379/0','LEAD_CORE_AUTO_CREATE_SCHEMA':'false','LEAD_CORE_SENSITIVE_DATA_KEY':g['fernet'],
 'LEAD_CORE_OIDC_ISSUER':origin+'/haoyi-auth/realms/haoyi','LEAD_CORE_OIDC_JWKS_URL':'http://keycloak:8080/haoyi-auth/realms/haoyi/protocol/openid-connect/certs','LEAD_CORE_OIDC_AUDIENCE':'lead-core',
 'LEAD_CORE_CORS_ORIGINS':json.dumps([origin]),'LEAD_CORE_TWENTY_SYNC_ENABLED':'false','LEAD_CORE_SNAPSHOT_STORE_ENABLED':'false',
 'LEAD_CORE_LEGACY_CRM_DATABASE_PATH':'/app/legacy-crm/affiliate_workbench.db','LEAD_CORE_LEGACY_CRM_URL':'/workbench/',
 'LEAD_CORE_AIHOT_BASE_URL':'http://aihot-api:3001','LEAD_CORE_AIHOT_ADMIN_PASSWORD':g['aihot_admin'],
 'LEAD_CORE_AUTOLOOP_BASE_URL':'http://autoloop:3350','LEAD_CORE_AUTOLOOP_SOURCE_TOKEN':g['source'],'LEAD_CORE_AUTOLOOP_OWNER_TOKEN':g['owner'],
 'LEAD_CORE_WORKER_TOKEN':g['worker'],'LEAD_CORE_LLM_BASE_URL':old.get('DEEPSEEK_BASE_URL','https://api.deepseek.com'),
 'LEAD_CORE_LLM_API_KEY':api_key,'LEAD_CORE_LLM_MODEL':old.get('DEEPSEEK_MODEL','deepseek-v4-pro'),
 'LEAD_CORE_LLM_INPUT_CNY_PER_MILLION':'9','LEAD_CORE_LLM_OUTPUT_CNY_PER_MILLION':'27','LEAD_CORE_AI_DAILY_BUDGET_CNY':'20','LEAD_CORE_AI_TASK_BUDGET_CNY':'2','LEAD_CORE_AI_MAX_CONCURRENT_TASKS':'1'})
save('keycloak.env',{'KC_DB':'postgres','KC_DB_URL':'jdbc:postgresql://postgres:5432/keycloak','KC_DB_USERNAME':'keycloak','KC_DB_PASSWORD':g['auth_db'],'KC_HOSTNAME':origin+'/haoyi-auth','KC_HTTP_RELATIVE_PATH':'/haoyi-auth','KC_BOOTSTRAP_ADMIN_USERNAME':'workspace-admin','KC_BOOTSTRAP_ADMIN_PASSWORD':g['kc_admin'],'JAVA_OPTS_KC_HEAP':'-Xms64m -Xmx192m','JAVA_OPTS_APPEND':'-XX:MaxDirectMemorySize=64m -XX:MaxMetaspaceSize=192m -XX:ReservedCodeCacheSize=64m -Xss512k -XX:ActiveProcessorCount=2','KC_FEATURES_DISABLED':'organization','KC_CACHE':'local','KC_DB_POOL_INITIAL_SIZE':'1','KC_DB_POOL_MIN_SIZE':'1','KC_DB_POOL_MAX_SIZE':'5','KC_HTTP_POOL_MAX_THREADS':'20'})
save('aihot.env',{'NODE_ENV':'production','AIHOT_ENVIRONMENT':'production','SITE_URL':'http://aihot-api:3001','DATABASE_URL':f"postgres://aihot:{g['aihot_db']}@postgres:5432/aihot",'DATABASE_POOL_MAX':'3','AIHOT_DATA_DIR':'/data','ADMIN_PASSWORD':g['aihot_admin'],'SESSION_SECRET':g['session'],'IMG_PROXY_SIGN_SECRET':g['image'],'API_HOST':'0.0.0.0','API_PORT':'3001','COLLECT_ENABLED':'true','MODEL_CALLS_ENABLED':'false','FEISHU_CONTENT_PUSH_ENABLED':'false','FEISHU_INTERNAL_ENABLED':'false','INDEXNOW_SUBMIT_ENABLED':'false','LOG_LEVEL':'warn','AIHOT_RELEASE':'haoyi-20261105'})
save('autoloop.env',{'AUTOLOOP_SOURCE_TOKEN':g['source'],'AUTOLOOP_OWNER_TOKEN':g['owner'],'AUTOLOOP_WORKER_TOKEN':g['loop_worker'],'LEAD_CORE_WORKER_TOKEN':g['worker'],'LEAD_CORE_WORKSPACE_API_URL':'http://lead-core:8000'})
realm=json.loads((Path(__file__).parents[1]/'keycloak/haoyi-realm.json').read_text())
realm['displayName']='浩宜工作台';realm['verifyEmail']=False;realm['organizationsEnabled']=False
realm['roles']['realm'].append({'name':'hq_executive'})
client=realm['clients'][0];client['redirectUris']=[origin+'/haoyi/*'];client['webOrigins']=[origin];client['name']='浩宜工作台'
realm['users']=[{'id':f'00000000-0000-4000-8000-{n:012d}','username':username,'firstName':display,'enabled':True,'emailVerified':True,'attributes':{'org_id':['00000000-0000-4000-8000-000000000001']},'realmRoles':roles,'credentials':[{'type':'password','value':g[key],'temporary':False}]} for n,username,display,roles,key in [(11,'xuzhongyu','徐种宇',['hq_admin','hq_franchise_manager','hq_data_reviewer'],'xu_password'),(12,'ceo','CEO',['hq_executive'],'ceo_password')]]
rp=SHARED/'haoyi-realm.json'
if not rp.exists():rp.write_text(json.dumps(realm,ensure_ascii=False),encoding='utf-8');os.chmod(rp,0o644)
print('Prepared private service configuration and two independent accounts; values withheld.')
