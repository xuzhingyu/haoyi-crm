from __future__ import annotations

import concurrent.futures
import gzip
import hashlib
import json
import shutil
import tarfile
import time
from pathlib import Path

import requests

import argparse
parser=argparse.ArgumentParser(); parser.add_argument('image');args=parser.parse_args()
IMAGE=args.image
REPOSITORY, TAG = IMAGE.rsplit(':',1)
if '/' not in REPOSITORY: REPOSITORY='library/'+REPOSITORY
ROOT=Path(__file__).resolve().parents[2]/'.runtime'/'image-cache'/IMAGE.replace('/','_').replace(':','_')
ARCHIVE=ROOT.parent.parent/(IMAGE.replace('/','_').replace(':','_')+'.tar.gz')
REGISTRY = "https://registry-1.docker.io/v2/" + REPOSITORY
ACCEPT = ", ".join((
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
))


def sha256_file(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return "sha256:" + hasher.hexdigest()


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    authorization = requests.get(
        "https://auth.docker.io/token",
        params={"service": "registry.docker.io", "scope": f"repository:{REPOSITORY}:pull"},
        timeout=(30, 60),
    )
    authorization.raise_for_status()
    headers = {"Authorization": "Bearer " + authorization.json()["token"], "Accept": ACCEPT}

    def manifest(reference: str) -> tuple[dict, str]:
        response = requests.get(REGISTRY + "/manifests/" + reference, headers=headers, timeout=(30, 90))
        response.raise_for_status()
        actual_digest = "sha256:" + hashlib.sha256(response.content).hexdigest()
        expected_digest = response.headers.get("Docker-Content-Digest", reference if reference.startswith("sha256:") else actual_digest)
        if actual_digest != expected_digest:
            raise RuntimeError("Manifest digest mismatch")
        (ROOT / (actual_digest.split(":")[1] + ".manifest.json")).write_bytes(response.content)
        return response.json(), actual_digest

    index, index_digest = manifest(TAG)
    if "manifests" in index:
        candidates = [item for item in index["manifests"] if item.get("platform", {}).get("os") == "linux" and item.get("platform", {}).get("architecture") == "amd64"]
        if len(candidates) != 1:
            raise RuntimeError("Expected exactly one linux/amd64 manifest")
        image_manifest, image_digest = manifest(candidates[0]["digest"])
    else:
        image_manifest, image_digest = index, index_digest
    print("Selected linux/amd64 image " + image_digest, flush=True)

    def blob(descriptor: dict) -> Path:
        digest = descriptor["digest"]
        if not digest.startswith("sha256:") or len(digest) != 71:
            raise RuntimeError("Unsupported blob digest")
        destination = ROOT / (digest.split(":")[1] + ".blob")
        if destination.exists() and destination.stat().st_size == descriptor["size"] and sha256_file(destination) == digest:
            print("Reused verified blob " + digest[:23], flush=True)
            return destination
        partial = destination.with_suffix(".partial")
        for attempt in range(3):
            try:
                hasher = hashlib.sha256()
                with requests.get(REGISTRY + "/blobs/" + digest, headers=headers, stream=True, timeout=(30, 120)) as response:
                    response.raise_for_status()
                    with partial.open("wb") as handle:
                        for chunk in response.iter_content(1024 * 1024):
                            if chunk:
                                hasher.update(chunk)
                                handle.write(chunk)
                if partial.stat().st_size != descriptor["size"] or "sha256:" + hasher.hexdigest() != digest:
                    raise RuntimeError("Blob digest or size mismatch")
                partial.replace(destination)
                print("Verified blob " + digest[:23] + " (" + str(descriptor["size"]) + " bytes)", flush=True)
                return destination
            except (requests.RequestException, OSError):
                if attempt == 2:
                    raise
                time.sleep(2 * (attempt + 1))
        raise RuntimeError("Blob download did not complete")

    descriptors = [image_manifest["config"], *image_manifest["layers"]]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        paths = list(executor.map(blob, descriptors))

    config = json.loads(paths[0].read_bytes())
    if config.get("architecture") != "amd64" or config.get("os") != "linux":
        raise RuntimeError("Unexpected image configuration platform")
    diff_ids = config["rootfs"]["diff_ids"]
    if len(diff_ids) != len(image_manifest["layers"]):
        raise RuntimeError("Layer count mismatch")
    config_name = image_manifest["config"]["digest"].split(":")[1] + ".json"
    config_path = ROOT / config_name
    shutil.copyfile(paths[0], config_path)
    layers = []
    for descriptor, compressed, diff_id in zip(image_manifest["layers"], paths[1:], diff_ids):
        layer_name = diff_id.split(":")[1] + "/layer.tar"
        layer = ROOT / layer_name
        layer.parent.mkdir(exist_ok=True)
        if not layer.exists() or sha256_file(layer) != diff_id:
            opener = gzip.open if descriptor.get("mediaType", "").endswith("gzip") else open
            with opener(compressed, "rb") as source, layer.open("wb") as target:
                shutil.copyfileobj(source, target, 1024 * 1024)
            if sha256_file(layer) != diff_id:
                raise RuntimeError("Uncompressed layer digest mismatch")
        layers.append(layer_name)
    docker_manifest = [{"Config": config_name, "RepoTags": [IMAGE], "Layers": layers}]
    manifest_path = ROOT / "manifest.json"
    manifest_path.write_text(json.dumps(docker_manifest, separators=(",", ":")), encoding="utf-8")
    print("All compressed and uncompressed digests verified; creating docker load archive", flush=True)
    pending_archive = ARCHIVE.with_suffix(".gz.partial")
    with tarfile.open(pending_archive, "w:gz", compresslevel=1) as archive:
        archive.add(manifest_path, arcname="manifest.json", recursive=False)
        archive.add(config_path, arcname=config_name, recursive=False)
        for name in layers:
            archive.add(ROOT / name, arcname=name, recursive=False)
    pending_archive.replace(ARCHIVE)
    with tarfile.open(ARCHIVE, "r:gz") as archive:
        saved_manifest = json.load(archive.extractfile("manifest.json"))
        if saved_manifest != docker_manifest or len(archive.getmembers()) != len(layers) + 2:
            raise RuntimeError("Archive manifest or entry count mismatch")
    result = {
        "repository": "docker.io/"+REPOSITORY,
        "tag": TAG,
        "platform": "linux/amd64",
        "index_digest": index_digest,
        "image_manifest_digest": image_digest,
        "image_config_digest": image_manifest["config"]["digest"],
        "archive": str(ARCHIVE),
        "archive_size": ARCHIVE.stat().st_size,
        "archive_sha256": sha256_file(ARCHIVE),
        "layers": len(layers),
    }
    (ROOT / "image-result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2), flush=True)


if __name__ == "__main__":
    main()
