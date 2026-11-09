from __future__ import annotations

from typing import Any

import httpx


class TwentyHttpSink:
    _OBJECT_NAMES = {
        "business": "repairBusinesses",
        "claim": "leadClaims",
        "interaction": "interactions",
        "opportunity": "opportunities",
        "contact_preference": "contactPreferences",
        "listing": "leadListings",
    }
    _ID_FIELDS = {
        "business": "business_id",
        "claim": "claim_id",
        "interaction": "interaction_id",
        "opportunity": "opportunity_id",
        "contact_preference": "preference_id",
        "listing": "listing_id",
    }

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        client: httpx.Client | None = None,
    ) -> None:
        if not api_key:
            raise ValueError("Twenty API key is required")
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._client = client or httpx.Client(timeout=10.0)

    def deliver(
        self,
        event_type: str,
        payload: dict,
        remote_id: str | None = None,
    ) -> str:
        prefix = event_type.split(".", maxsplit=1)[0]
        object_name = self._OBJECT_NAMES.get(prefix)
        id_field = self._ID_FIELDS.get(prefix)
        if object_name is None or id_field is None:
            raise ValueError(f"unsupported Twenty event type: {event_type}")
        external_id = payload.get(id_field)
        if not external_id:
            raise ValueError(f"Twenty event is missing {id_field}")

        body: dict[str, Any] = {"externalId": external_id}
        for key, value in payload.items():
            if key == id_field:
                continue
            target_key = "organizationId" if key == "org_id" else self._camel_case(key)
            body[target_key] = value
        body["lastEventType"] = event_type

        url = f"{self._base_url}/rest/{object_name}"
        method = "POST"
        if remote_id:
            method = "PATCH"
            url = f"{url}/{remote_id}"
        response = self._client.request(
            method,
            url,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            json=body,
        )
        response.raise_for_status()
        returned_id = self._extract_id(response.json())
        if returned_id:
            return returned_id
        if remote_id:
            return remote_id
        raise ValueError("Twenty create response did not return a record id")

    @staticmethod
    def _camel_case(value: str) -> str:
        head, *tail = value.split("_")
        return head + "".join(part.capitalize() for part in tail)

    @classmethod
    def _extract_id(cls, payload: Any) -> str | None:
        if isinstance(payload, dict):
            if isinstance(payload.get("id"), str):
                return payload["id"]
            if "data" in payload:
                nested = cls._extract_id(payload["data"])
                if nested:
                    return nested
            for value in payload.values():
                nested = cls._extract_id(value)
                if nested:
                    return nested
        if isinstance(payload, list):
            for value in payload:
                nested = cls._extract_id(value)
                if nested:
                    return nested
        return None
