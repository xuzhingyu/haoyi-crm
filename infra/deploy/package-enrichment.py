"""Package the intelligence increment only; private configuration is never included."""
from pathlib import Path
import tarfile

root = Path(__file__).resolve().parents[2]
target = root / ".runtime/intelligence-increment.tar.gz"
paths = ["services/lead-core/src", "services/lead-core/alembic", "services/lead-core/alembic.ini",
         "vendor/aihot/packages/backend/src/admin/haoyi-sync.ts", "vendor/aihot/apps/api/src/routes/admin.ts",
         "vendor/aihot/scripts/haoyi-backfill-rss.ts", "infra/deploy/haoyi-runner.mjs"]
with tarfile.open(target, "w:gz") as bundle:
    count = 0
    for name in paths:
        source = root / name
        for item in source.rglob("*") if source.is_dir() else [source]:
            if not item.is_file() or "__pycache__" in item.parts or item.suffix == ".pyc":
                continue
            bundle.add(item, arcname=item.relative_to(root).as_posix())
            count += 1
print(f"Packaged {count} source files ({target.stat().st_size} bytes); no secrets or customer data")
