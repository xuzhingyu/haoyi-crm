"""Read deployment diagnostics, removing all known deployment secret values."""
import json,re,subprocess
from pathlib import Path

values=[]
root=Path('/opt/haoyi-workspace/shared')
if (root/'bootstrap.json').exists():values.extend(json.loads((root/'bootstrap.json').read_text()).values())
for p in root.glob('*.env'):
    for line in p.read_text().splitlines():
        key,_,value=line.partition('=')
        if re.search(r'PASSWORD|TOKEN|SECRET|API_KEY|SENSITIVE_DATA_KEY',key):values.append(value)
def clean(text):
    for value in values:
        if isinstance(value,str) and len(value)>5:text=text.replace(value,'[redacted]')
    return text
names=['haoyi-workspace-postgres-1','haoyi-workspace-auth','haoyi-workspace-aihot-setup-1','haoyi-workspace-aihot-api-1','haoyi-workspace-aihot-worker-1','haoyi-workspace-autoloop-1','haoyi-lead-core']
for name in names:
    result=subprocess.run(['docker','logs','--tail','25',name],capture_output=True,text=True)
    print('\n'+name+'\n'+clean(result.stdout+result.stderr))
