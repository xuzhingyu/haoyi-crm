"""Use the existing swap before global OOM on the small workspace host."""
from pathlib import Path
import json
import subprocess

saved=Path('/opt/haoyi-workspace/shared/memory-tuning-before.json')
target=Path('/etc/sysctl.d/99-haoyi-workspace-memory.conf')
if not saved.exists():
    saved.write_text(json.dumps({'vm.swappiness':Path('/proc/sys/vm/swappiness').read_text().strip(),
        'existing_drop_in':target.read_text() if target.exists() else None}))
    saved.chmod(0o600)
target.write_text('# Allow existing swap to absorb workspace peaks before OOM kills login.\nvm.swappiness = 30\n')
target.chmod(0o644)
subprocess.run(['sysctl','-w','vm.swappiness=30'],check=True)
containers=subprocess.check_output(['docker','ps','--filter','label=com.docker.compose.project=haoyi-workspace','--format','{{.ID}}'],text=True).split()
rollback=subprocess.run(['docker','inspect','--format','{{.Id}}','affiliate-workbench-api-rollback'],capture_output=True,text=True)
if rollback.returncode==0:containers.append(rollback.stdout.strip())
# Docker's update API does not persist MemorySwappiness on this engine. Update
# the live v1 control files and its parent inheritance; Compose records the
# explicit value for subsequent recreation, and sysctl restores it at boot.
parent=Path('/sys/fs/cgroup/memory/docker')
if not (parent/'memory.swappiness').exists():raise RuntimeError('Expected Docker cgroup v1 memory controller')
saved_parent=Path('/opt/haoyi-workspace/shared/docker-swappiness-before.json')
if not saved_parent.exists():
    saved_parent.write_text(json.dumps({'docker.memory.swappiness':(parent/'memory.swappiness').read_text().strip()}));saved_parent.chmod(0o600)
(parent/'memory.swappiness').write_text('30\n')
for container in containers:
    ident=subprocess.check_output(['docker','inspect','--format','{{.Id}}',container],text=True).strip()
    cgroup=parent/ident/'memory.swappiness'
    cgroup.write_text('30\n')
    assert cgroup.read_text().strip()=='30','Live cgroup swap setting differs'
print('Earlier reclaim configured for',len(containers),'workspace containers without restarting; prior host setting saved.')
