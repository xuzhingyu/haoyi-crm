#!/usr/bin/env python3
"""Back up only the new workspace databases; verify restores without replacing data.

Run on the Linux Docker host as root. No SSH or env-file loading occurs.
Autoloop's signing key stays inside its container to verify its functional index.
Only an allowlisted Compose project's containers/volume may be used.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import subprocess
import sys
import uuid


PROJECT = "haoyi-workspace"
DATABASES = ("lead_core", "keycloak", "aihot")
BACKUP_ROOT = Path("/opt/haoyi-workspace/shared/backups")


class BackupError(RuntimeError):
    """Only fixed, non-secret operational messages should be passed here."""


def run(command, *, stage, timeout=1200, input=None, stdout=subprocess.PIPE):
    """Never print subprocess output/errors: dump contents can contain private data."""
    try:
        result = subprocess.run(
            command, input=input, stdout=stdout, stderr=subprocess.PIPE,
            timeout=timeout, check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as from_error:
        raise BackupError(f"{stage}: command did not complete") from from_error
    if result.returncode:
        raise BackupError(f"{stage}: command failed (exit {result.returncode}); output suppressed")
    return result.stdout


def docker_json(kind, target, field, stage):
    raw = run(["docker", kind, "inspect", "--format", "{{json " + field + "}}", target],
              stage=stage, timeout=30)
    try:
        return json.loads(raw)
    except (ValueError, TypeError) as error:
        raise BackupError(f"{stage}: invalid metadata") from error


def container_for(service):
    ids = run([
        "docker", "ps", "--filter", f"label=com.docker.compose.project={PROJECT}",
        "--filter", f"label=com.docker.compose.service={service}",
        "--filter", "status=running", "--format", "{{.ID}}",
    ], stage=f"Find {service}", timeout=30).decode().split()
    if len(ids) != 1 or not re.fullmatch(r"[a-f0-9]{12,64}", ids[0]):
        raise BackupError(f"Expected exactly one running {PROJECT}/{service} container")
    labels = docker_json("container", ids[0], ".Config.Labels", f"Validate {service}")
    if (labels.get("com.docker.compose.project") != PROJECT
            or labels.get("com.docker.compose.service") != service):
        raise BackupError(f"Unexpected {service} container ownership")
    return ids[0]


def owned_volume_path(container, destination, volume):
    expected_name = f"{PROJECT}_{volume}"
    mounts = docker_json("container", container, ".Mounts", f"Find {volume} volume")
    matches = [item for item in mounts if item.get("Destination") == destination]
    if (len(matches) != 1 or matches[0].get("Type") != "volume"
            or matches[0].get("Name") != expected_name):
        raise BackupError(f"{volume} must use the expected new-workspace named volume")
    labels = docker_json("volume", expected_name, ".Labels", f"Validate {volume} volume")
    if (labels.get("com.docker.compose.project") != PROJECT
            or labels.get("com.docker.compose.volume") != volume):
        raise BackupError(f"Unexpected {volume} volume ownership")
    mount = Path(matches[0]["Source"])
    if (not mount.is_absolute() or mount.resolve() != mount or mount == Path("/")
            or not mount.is_dir()):
        raise BackupError(f"Unexpected {volume} mount path")
    return mount


def sqlite_source(container):
    mount = owned_volume_path(container, "/data", "autoloop_data")
    source = mount / "hub.db"
    if not source.is_file() or source.is_symlink() or source.resolve() != source:
        raise BackupError("Autoloop hub.db is missing or not a regular volume file")
    return source


def require_disk_space(container, source, timeout):
    data_path = owned_volume_path(container, "/var/lib/postgresql/data", "database")
    raw = psql(container, "postgres", """
SELECT json_build_object('database', datname, 'bytes', pg_database_size(oid))::text
FROM pg_database WHERE datname IN ('lead_core', 'keycloak', 'aihot') ORDER BY datname;
""", stage="Check database sizes", timeout=timeout)
    sizes = {row["database"]: row["bytes"]
             for row in (json.loads(line) for line in raw.decode().splitlines() if line.strip())}
    if set(sizes) != set(DATABASES) or any(not isinstance(size, int) or size < 0 for size in sizes.values()):
        raise BackupError("The three expected workspace databases were not found")
    # Conservative estimate, not a disk reservation. Leave headroom on each filesystem.
    dump_bytes = sum(sizes.values()) + source.stat().st_size * 2
    restore_bytes = max(sizes.values()) * 2
    margin = 512 * 1024 * 1024

    def free(path):
        info = os.statvfs(path)
        return info.f_bavail * info.f_frsize

    if BACKUP_ROOT.stat().st_dev == data_path.stat().st_dev:
        enough = free(BACKUP_ROOT) >= dump_bytes + restore_bytes + margin
    else:
        enough = (free(BACKUP_ROOT) >= dump_bytes + margin
                  and free(data_path) >= restore_bytes + margin)
    if not enough:
        raise BackupError("Insufficient free space for backup and isolated restore with headroom")


def pg_command(container, program, *arguments, timeout=1200):
    return ["docker", "exec", "--interactive", "--user", "postgres",
            "--env", "PGCONNECT_TIMEOUT=10",
            "--env", f"PGOPTIONS=-c statement_timeout={timeout * 1000}",
            container, program, "--username=postgres", "--no-password", *arguments]


def psql(container, database, sql, *, stage, timeout):
    return run(pg_command(container, "psql", "-X", "-A", "-t", "-q",
                          "--set=ON_ERROR_STOP=1", "--dbname=" + database, timeout=timeout),
               input=sql.encode(), stage=stage, timeout=timeout)


def quote_identifier(value):
    return '"' + value.replace('"', '""') + '"'


@contextmanager
def exported_snapshot(container, database, timeout):
    """Hold a read-only snapshot open for both pg_dump and source row counts."""
    command = pg_command(container, "psql", "-X", "-A", "-t", "-q",
                         "--set=ON_ERROR_STOP=1", "--dbname=" + database, timeout=timeout)
    # Discard stderr rather than retaining a pipe that could block the snapshot holder.
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.DEVNULL, bufsize=0)
    try:
        start = (f"SET idle_in_transaction_session_timeout = {(3 * timeout + 60) * 1000};\n"
                 "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"
                 "SELECT pg_export_snapshot();\n")
        process.stdin.write(start.encode())
        process.stdin.flush()
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            if not selector.select(timeout=30):
                raise BackupError(f"{database}: snapshot export timed out")
            snapshot = process.stdout.readline().decode().strip()
        if not re.fullmatch(r"[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+", snapshot):
            raise BackupError(f"{database}: invalid snapshot identifier")
        yield snapshot
    finally:
        if process.stdin:
            try:
                process.stdin.write(b"ROLLBACK;\n\\q\n")
                process.stdin.close()
            except (BrokenPipeError, OSError):
                pass
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)
        if process.stdout:
            process.stdout.close()


def pg_counts(container, database, timeout, snapshot=None):
    sql = "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"
    if snapshot:
        if not re.fullmatch(r"[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+", snapshot):
            raise BackupError("Invalid count snapshot")
        sql += f"SET TRANSACTION SNAPSHOT '{snapshot}';\n"
    # psql executes each safely quoted count within this same read-only transaction.
    sql += r"""
SELECT format('SELECT json_build_object(''schema'', %L, ''table'', %L, ''rows'', count(*))::text FROM %I.%I;',
              n.nspname, c.relname, n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'
ORDER BY n.nspname, c.relname
\gexec
ROLLBACK;
"""
    raw = psql(container, database, sql, stage=f"Count {database}", timeout=timeout)
    try:
        records = [json.loads(line) for line in raw.decode().splitlines() if line.strip()]
        return sorted(records, key=lambda row: (row["schema"], row["table"]))
    except (ValueError, KeyError, TypeError) as error:
        raise BackupError(f"{database}: invalid table-count result") from error


def safe_verify_name(run_id, database):
    name = f"haoyi_verify_{run_id}_{database}"
    if (database not in DATABASES or not re.fullmatch(r"[a-z0-9_]+", run_id)
            or len(name) > 63 or name in DATABASES):
        raise BackupError("Refusing an unsafe temporary database name")
    return name


def backup_postgres(container, database, destination, run_id, timeout):
    dump_file = destination / f"{database}.dump"
    with exported_snapshot(container, database, timeout) as snapshot:
        with dump_file.open("xb") as output:
            run(pg_command(container, "pg_dump", "--format=custom", "--compress=3",
                           "--snapshot=" + snapshot, "--dbname=" + database, timeout=timeout),
                stage=f"Dump {database}", timeout=timeout, stdout=output)
        expected = pg_counts(container, database, timeout, snapshot)
    temp_database = safe_verify_name(run_id, database)
    exists = psql(container, "postgres", f"SELECT 1 FROM pg_database WHERE datname='{temp_database}';\n",
                  stage="Check isolated restore target", timeout=timeout).strip()
    if exists:
        raise BackupError("Temporary restore database already exists; nothing was dropped")
    # This unique name was checked absent. Cleanup is restricted to exactly this name.
    try:
        run(pg_command(container, "createdb", "--template=template0", temp_database, timeout=timeout),
            stage=f"Create isolated {database} restore", timeout=timeout)
        psql(container, "postgres",
             f"REVOKE ALL ON DATABASE {quote_identifier(temp_database)} FROM PUBLIC;\n",
             stage="Restrict isolated restore access", timeout=timeout)
        # The artifact retains original owners/ACLs. Verification intentionally uses
        # postgres ownership and no restored ACLs, so app roles cannot use this clone.
        with dump_file.open("rb") as source:
            try:
                result = subprocess.run(
                    pg_command(container, "pg_restore", "--exit-on-error", "--single-transaction",
                               "--no-owner", "--no-privileges", "--dbname=" + temp_database,
                               timeout=timeout),
                    stdin=source, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                    timeout=timeout, check=False,
                )
            except (OSError, subprocess.TimeoutExpired) as error:
                raise BackupError(f"{database}: isolated restore did not complete") from error
            if result.returncode:
                raise BackupError(f"{database}: isolated restore failed; output suppressed")
        actual = pg_counts(container, temp_database, timeout)
        if actual != expected:
            raise BackupError(f"{database}: restored table counts differ from the exported snapshot")
    finally:
        # Never accept a caller-supplied target, wildcard, live DB name, or --clean restore.
        if temp_database != safe_verify_name(run_id, database):
            raise BackupError("Refusing unexpected cleanup target")
        run(pg_command(container, "dropdb", "--if-exists", "--force", temp_database, timeout=timeout),
            stage=f"Remove isolated {database} restore", timeout=timeout)
    print(f"Verified {database}: {len(expected)} tables", flush=True)
    return {"file": dump_file.name, "tables": expected, "restore_verified": True,
            "temporary_database_removed": True, "snapshot_scope": "one database"}


NODE_SQLITE_BACKUP = r"""
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync, backup } from 'node:sqlite';
import { cardHash, credential } from '/app/kernel/credentials.ts';
const [runId, timeoutText] = process.argv.slice(2);
if (!/^[a-z0-9_]{1,48}$/.test(runId)) throw new Error('Invalid backup run id');
const timeout = Number(timeoutText);
if (!Number.isInteger(timeout) || timeout < 60 || timeout > 3600) throw new Error('Invalid timeout');
process.umask(0o077);
const folder = '/tmp/haoyi-backup-' + runId;
const artifact = path.join(folder, 'autoloop.sqlite');
const verification = path.join(folder, 'verify.sqlite');
const source = '/data/hub.db';
// The persisted card_hash index must be checked with the real function. Import
// only the pure kernel helpers, never host/runtime (which would mutate the DB).
// This key is neither printed nor included in the backup artifact or metadata.
const masterKey = fs.readFileSync('/data/master.key', 'utf8').trim();
if (!/^[A-Za-z0-9_-]{43}$/.test(masterKey)) throw new Error('Invalid signing-key format');
const environment = { secret: masterKey, publicUrl: '' };
const deadline = Date.now() + timeout * 1000;
const guard = setTimeout(() => process.exit(124), timeout * 1000);
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const handles = new Set();
const open = (file, readOnly = false) => {
  const db = new DatabaseSync(file, { readOnly, timeout: 10000 });
  db.function('card_token', { deterministic: true }, (id, at) => credential(environment, 'card', id, at));
  db.function('card_hash', { deterministic: true }, (id, at) => cardHash(environment, id, at));
  handles.add(db);
  return db;
};
const close = db => { db.close(); handles.delete(db); };
const counts = db => db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
  .map(({ name }) => ({ table: name, rows: db.prepare('SELECT count(*) AS count FROM ' + quote(name)).get().count }));
const check = db => {
  const rows = db.prepare('PRAGMA integrity_check').all();
  if (rows.length !== 1 || Object.values(rows[0])[0] !== 'ok') throw new Error('Integrity failure');
};
const copy = (db, target) => backup(db, target, {
  rate: 256,
  progress() { if (Date.now() > deadline) throw new Error('Backup timeout'); },
});
let stage = 'initialization';
try {
  if (fs.realpathSync(source) !== source || !fs.lstatSync(source).isFile()) throw new Error('Invalid source');
  fs.mkdirSync(folder, { mode: 0o700 });
  const live = open(source, true);
  live.exec('PRAGMA query_only=ON; BEGIN');
  const expected = counts(live);
  stage = 'online backup';
  await copy(live, artifact);
  live.exec('ROLLBACK');
  close(live);
  const saved = open(artifact);
  saved.exec('PRAGMA journal_mode=DELETE');
  check(saved);
  if (JSON.stringify(counts(saved)) !== JSON.stringify(expected)) throw new Error('Snapshot count mismatch');
  stage = 'isolated restore';
  await copy(saved, verification);
  close(saved);
  const restored = open(verification);
  check(restored);
  if (JSON.stringify(counts(restored)) !== JSON.stringify(expected)) throw new Error('Restore count mismatch');
  close(restored);
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const file = verification + suffix;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  fs.chmodSync(artifact, 0o600);
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(artifact)) hash.update(chunk);
  console.log(JSON.stringify({ file: 'autoloop.sqlite', tables: expected, restore_verified: true,
    integrity_check: 'ok', snapshot_scope: 'autoloop SQLite', engine: 'node:sqlite',
    node_version: process.version, sha256: hash.digest('hex') }));
} catch {
  process.stderr.write('Autoloop SQLite ' + stage + ' failed; details suppressed.\n');
  process.exitCode = 1;
} finally {
  clearTimeout(guard);
  for (const db of handles) { try { db.close(); } catch {} }
}
"""

NODE_SQLITE_CLEANUP = r"""
import fs from 'node:fs';
const runId = process.argv[1];
if (!/^[a-z0-9_]{1,48}$/.test(runId)) throw new Error('Invalid cleanup id');
const folder = '/tmp/haoyi-backup-' + runId;
if (fs.existsSync(folder)) {
  if (fs.realpathSync(folder) !== folder || !fs.lstatSync(folder).isDirectory()) throw new Error('Invalid cleanup folder');
  for (const name of ['autoloop.sqlite', 'verify.sqlite']) {
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      const target = folder + '/' + name + suffix;
      if (fs.existsSync(target)) {
        if (!fs.lstatSync(target).isFile()) throw new Error('Invalid cleanup target');
        fs.unlinkSync(target);
      }
    }
  }
  fs.rmdirSync(folder);
}
"""


def backup_sqlite(container, destination, run_id, timeout):
    """Use the existing Node 24 SQLite engine; the host need not have _sqlite3."""
    if not re.fullmatch(r"[a-z0-9_]{1,48}", run_id):
        raise BackupError("Invalid SQLite backup run identifier")
    artifact = destination / "autoloop.sqlite"
    if artifact.exists() or artifact.is_symlink():
        raise BackupError("SQLite backup artifact already exists")
    container_file = f"{container}:/tmp/haoyi-backup-{run_id}/autoloop.sqlite"
    try:
        raw = run(["docker", "exec", "--interactive", "--user=0", container,
                   "node", "--input-type=module", "-", run_id, str(timeout)],
                  input=NODE_SQLITE_BACKUP.encode(), stage="Autoloop online backup and isolated restore",
                  timeout=timeout + 15)
        try:
            result = json.loads(raw)
            if (result["file"] != artifact.name or result["restore_verified"] is not True
                    or result["integrity_check"] != "ok"
                    or not re.fullmatch(r"[a-f0-9]{64}", result["sha256"])):
                raise ValueError("Invalid result")
        except (ValueError, KeyError, TypeError) as error:
            raise BackupError("Autoloop returned invalid backup verification metadata") from error
        run(["docker", "cp", container_file, str(artifact)],
            stage="Copy verified SQLite artifact", timeout=timeout)
        artifact.chmod(0o600)
        digest = hashlib.sha256()
        with artifact.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != result["sha256"]:
            raise BackupError("SQLite artifact checksum changed during transfer")
    finally:
        run(["docker", "exec", "--user=0", container, "node", "--input-type=module",
             "--eval", NODE_SQLITE_CLEANUP, run_id],
            stage="Remove isolated SQLite backup files", timeout=30)
    print(f"Verified autoloop: {len(result['tables'])} tables", flush=True)
    return result


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    path.chmod(0o600)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--timeout", type=int, default=1200,
                        help="Per-command / SQLite timeout seconds (60..3600; default 1200)")
    args = parser.parse_args()
    if not 60 <= args.timeout <= 3600:
        parser.error("--timeout must be between 60 and 3600")
    if sys.platform != "linux" or os.geteuid() != 0:
        parser.error("Run on the Linux Docker host as root")
    import fcntl
    os.umask(0o077)
    if (not BACKUP_ROOT.parent.is_dir() or BACKUP_ROOT.is_symlink()
            or BACKUP_ROOT.resolve() != BACKUP_ROOT):
        raise BackupError("Backup parent is missing or the fixed backup path contains a symlink")
    BACKUP_ROOT.mkdir(mode=0o700, exist_ok=True)
    if BACKUP_ROOT.stat().st_uid != 0:
        raise BackupError("The fixed backup directory must be owned by root")
    BACKUP_ROOT.chmod(0o700)
    lock_path = BACKUP_ROOT / ".backup.lock"
    if lock_path.is_symlink():
        raise BackupError("Backup lock must not be a symlink")
    with lock_path.open("a") as lock:
        os.chmod(lock_path, 0o600)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise BackupError("Another backup verification is already running") from error
        postgres = container_for("postgres")
        autoloop = container_for("autoloop")
        source = sqlite_source(autoloop)
        require_disk_space(postgres, source, args.timeout)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        run_id = stamp.lower() + "_" + uuid.uuid4().hex[:8]
        destination = BACKUP_ROOT / run_id
        destination.mkdir(mode=0o700)
        manifest = {"format": 1, "project": PROJECT, "run_id": run_id,
                    "started_at": datetime.now(timezone.utc).isoformat(), "status": "in_progress",
                    "scope": [*DATABASES, "autoloop SQLite"],
                    "consistency": "Each database has its own online snapshot; no cross-database atomic snapshot.",
                    "databases": {}}
        write_json(destination / "manifest.json", manifest)
        try:
            for database in DATABASES:
                manifest["databases"][database] = backup_postgres(
                    postgres, database, destination, run_id, args.timeout)
                write_json(destination / "manifest.json", manifest)
            manifest["databases"]["autoloop"] = backup_sqlite(autoloop, destination, run_id, args.timeout)
            for entry in manifest["databases"].values():
                artifact = destination / entry["file"]
                artifact.chmod(0o600)
                digest = hashlib.sha256()
                with artifact.open("rb") as stream:
                    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                        digest.update(chunk)
                entry["sha256"] = digest.hexdigest()
                entry["bytes"] = artifact.stat().st_size
            checksums = "".join(f"{entry['sha256']}  {entry['file']}\n"
                                for entry in manifest["databases"].values())
            (destination / "SHA256SUMS").write_text(checksums, encoding="ascii")
            manifest["status"] = "verified"
        except BaseException as error:
            manifest["status"] = "failed"
            # Never serialize arbitrary database exceptions or their SQL/record contents.
            manifest["failure_type"] = type(error).__name__
            raise
        finally:
            manifest["finished_at"] = datetime.now(timezone.utc).isoformat()
            write_json(destination / "manifest.json", manifest)
        print(f"Verified backup: {destination}", flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except BackupError as error:
        print(f"Backup verification failed: {error}", file=sys.stderr)
        raise SystemExit(1)
    except KeyboardInterrupt:
        print("Backup verification interrupted; inspect the failed manifest before retrying.", file=sys.stderr)
        raise SystemExit(130)
    except Exception:
        print("Backup verification failed unexpectedly; private diagnostic output suppressed.", file=sys.stderr)
        raise SystemExit(1)
