set -eu
umask 077
ROOT=/opt/haoyi-workspace
RELEASE="$ROOT/releases/20261105"
mkdir -p "$RELEASE"
tar -xzf "$ROOT/workspace-release.tar.gz" -C "$RELEASE"
find "$RELEASE" -type d -exec chmod 755 {} +
python3 "$RELEASE/infra/deploy/prepare-secrets.py"
# Keep existing services within available RAM; the new workload has explicit cgroup limits.
if ! grep -q '^/opt/haoyi-workspace/shared/swapfile ' /proc/swaps; then
  if [ ! -f "$ROOT/shared/swapfile" ]; then
    dd if=/dev/zero of="$ROOT/shared/swapfile" bs=1M count=2048 status=none
    chmod 600 "$ROOT/shared/swapfile"
    mkswap "$ROOT/shared/swapfile" >/dev/null
  fi
  swapon "$ROOT/shared/swapfile"
  if ! grep -q '/opt/haoyi-workspace/shared/swapfile' /etc/fstab; then
    printf '\n/opt/haoyi-workspace/shared/swapfile none swap sw 0 0\n' >> /etc/fstab
  fi
fi
printf 'Prepared release and bounded workload swap.\n'
cd "$RELEASE"
docker compose -f infra/deploy/compose.workspace.yaml pull postgres redis keycloak
docker compose -f infra/deploy/compose.workspace.yaml build aihot-api autoloop
