from pathlib import Path
import tarfile

root=Path(__file__).resolve().parents[2]
target=root/'.runtime/workspace-release.tar.gz'
target.parent.mkdir(parents=True,exist_ok=True)
exclude={'.git','node_modules','.venv','__pycache__','.pytest_cache','.ruff_cache','.runtime','.cache','.data','tests','artifacts'}
roots=['infra','services/lead-core','services/legacy-crm','vendor/aihot','vendor/agent-autoloop','apps/franchise-portal/dist']
count=0
with tarfile.open(target,'w:gz') as tar:
    for name in roots:
        folder=root/name
        if not folder.exists():continue
        for p in folder.rglob('*'):
            if not p.is_file() or any(part in exclude for part in p.relative_to(folder).parts):continue
            if p.name.startswith('.env') and p.name!='.env.example':continue
            if p.suffix in {'.log','.db','.sqlite','.sqlite3','.pyc'}:continue
            tar.add(p,arcname=str(p.relative_to(root)).replace('\\','/'));count+=1
print(f'Packaged {count} files, {target.stat().st_size/1024/1024:.1f} MiB; secrets excluded.')
