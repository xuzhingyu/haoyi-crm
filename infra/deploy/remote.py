"""Use the existing, pinned Haoyi SSH connection without printing credentials."""
import argparse
import importlib.util
from pathlib import Path
import sys
import paramiko

DEFAULT_HELPER = Path(r"E:\code\project\haoyi-system\.runtime\deploy\remote.py")

def connect(helper=DEFAULT_HELPER):
    spec = importlib.util.spec_from_file_location("haoyi_existing_connection", helper)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    values = module.credentials()
    client = paramiko.SSHClient()
    client.load_host_keys(str(helper.parent / "known_hosts"))
    client.set_missing_host_key_policy(paramiko.RejectPolicy())
    client.connect(values["SSH_HOST"], port=int(values["SSH_PORT"]),
                   username=values["SSH_USER"], password=values["SSH_PASSWORD"],
                   timeout=20, auth_timeout=30, banner_timeout=30,
                   look_for_keys=False, allow_agent=False)
    return client

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--command-file", type=Path)
    parser.add_argument("--upload", type=Path)
    parser.add_argument("--destination")
    parser.add_argument("--timeout", type=int, default=90)
    args = parser.parse_args()
    client = connect()
    try:
        if args.upload:
            destination = args.destination or ""
            if not destination.startswith("/opt/haoyi-workspace/") or ".." in Path(destination).parts:
                raise ValueError("Upload must stay inside /opt/haoyi-workspace/")
            with client.open_sftp() as sftp:
                sftp.put(str(args.upload), destination)
                sftp.chmod(destination, 0o600)
            print("Uploaded workspace deployment file")
        if args.command_file:
            command = args.command_file.read_text(encoding="utf-8-sig")
            _, stdout, stderr = client.exec_command(command, timeout=args.timeout)
            for line in stdout:
                print(line.rstrip(), flush=True)
            errors = stderr.read().decode("utf-8", errors="replace")
            if errors:
                print(errors, file=sys.stderr, end="")
            return stdout.channel.recv_exit_status()
        return 0
    finally:
        client.close()

if __name__ == "__main__":
    raise SystemExit(main())
