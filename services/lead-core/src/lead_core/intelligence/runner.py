"""Autoloop command adapter. Ignores prompts; invokes only the fixed internal worker API."""
import json
import os

import httpx


def main():
    base = os.environ.get("LEAD_CORE_WORKSPACE_API_URL", "http://lead-core:8000").rstrip("/")
    token = os.environ.get("LEAD_CORE_WORKER_TOKEN", "")
    if not token:
        print(json.dumps({"outcome": "failed", "error": "worker credential not configured"}))
        return
    try:
        response = httpx.post(base + "/api/v1/internal/research/run-next", headers={"Authorization": "Bearer " + token}, timeout=1250)
        response.raise_for_status()
        print(json.dumps(response.json(), ensure_ascii=False))
    except (httpx.HTTPError, ValueError):
        print(json.dumps({"outcome": "failed", "error": "controlled research service unavailable"}))


if __name__ == "__main__":
    main()
