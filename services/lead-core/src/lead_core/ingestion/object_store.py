from __future__ import annotations

from typing import Protocol

import boto3

from lead_core.security.sensitive_data import SensitiveTextCipher


class SnapshotStore(Protocol):
    def put(self, key: str, content: bytes, content_type: str) -> None: ...

    def delete(self, key: str) -> None: ...


class S3SnapshotStore:
    def __init__(
        self,
        *,
        endpoint_url: str,
        region: str,
        bucket: str,
        access_key: str,
        secret_key: str,
        cipher: SensitiveTextCipher | None = None,
    ) -> None:
        self._bucket = bucket
        self._cipher = cipher
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            region_name=region,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
        )

    def put(self, key: str, content: bytes, content_type: str) -> None:
        stored_content = self._cipher.encrypt_bytes(content) if self._cipher else content
        self._client.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=stored_content,
            ContentType="application/octet-stream" if self._cipher else content_type,
            Metadata={"original-content-type": content_type, "encrypted": str(bool(self._cipher)).lower()},
        )

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)
