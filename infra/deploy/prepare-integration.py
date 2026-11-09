"""Server-only additive configuration; no upstream keys enter the legacy service."""
from pathlib import Path
import os
import secrets

ROOT = Path('/opt/haoyi-workspace/shared')

def read(path):
    return dict(line.split('=', 1) for line in path.read_text().splitlines()
                if '=' in line and not line.lstrip().startswith('#'))

def save(path, values):
    path.write_text(''.join(f'{key}={value}\n' for key, value in values.items()))
    os.chmod(path, 0o600)

workspace = read(ROOT / 'workspace.env')
workspace.setdefault('LEAD_CORE_AI_GATEWAY_TOKEN', secrets.token_urlsafe(48))
workspace.setdefault('LEAD_CORE_LEGACY_BRIDGE_TOKEN', secrets.token_urlsafe(48))
workspace['LEAD_CORE_LEGACY_CRM_API_URL'] = 'http://legacy-crm:8000'
workspace['LEAD_CORE_LEGACY_CRM_URL'] = '/haoyi/crm/leads'
workspace['LEAD_CORE_AI_MAX_CONCURRENT_TASKS'] = '1'
save(ROOT / 'workspace.env', workspace)
save(ROOT / 'legacy-crm.env', {
    'DATABASE_URL': 'sqlite:////app/data/affiliate_workbench.db',
    'RUN_MIGRATIONS': '1', 'AUTH_MODE': 'oidc', 'AUTH_DISABLED': '0',
    'LEGACY_PASSWORD_LOGIN_ENABLED': '0', 'SEED_DEMO_DATA': '0',
    'LEGACY_NEWS_WORKER_ENABLED': '0',
    'OIDC_ISSUER': workspace['LEAD_CORE_OIDC_ISSUER'],
    'OIDC_JWKS_URL': workspace['LEAD_CORE_OIDC_JWKS_URL'],
    'OIDC_AUDIENCE': workspace['LEAD_CORE_OIDC_AUDIENCE'],
    'AI_GATEWAY_URL': 'http://lead-core:8000/api/v1/internal/ai/chat-completions',
    'AI_GATEWAY_TOKEN': workspace['LEAD_CORE_AI_GATEWAY_TOKEN'],
    'CRM_BRIDGE_TOKEN': workspace['LEAD_CORE_LEGACY_BRIDGE_TOKEN'],
    'PUBLIC_API_PREFIX': '/haoyi/api/v1/crm',
})
print('Integrated service configuration prepared; values withheld.')
