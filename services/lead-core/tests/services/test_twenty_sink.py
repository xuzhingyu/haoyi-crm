import httpx
import pytest

from lead_core.services.twenty import TwentyHttpSink


def test_twenty_sink_creates_then_updates_configured_custom_object() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.method == "POST":
            return httpx.Response(201, json={"data": {"id": "remote-claim-1"}})
        return httpx.Response(200, json={"data": {"id": "remote-claim-1"}})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    sink = TwentyHttpSink(
        base_url="https://crm.example.com",
        api_key="secret-api-key",
        client=client,
    )

    remote_id = sink.deliver(
        "claim.created",
        {"claim_id": "claim-1", "org_id": "org-a", "status": "active"},
    )
    updated_id = sink.deliver(
        "claim.released",
        {"claim_id": "claim-1", "reason": "activity_overdue"},
        remote_id=remote_id,
    )

    assert remote_id == "remote-claim-1"
    assert updated_id == "remote-claim-1"
    assert [(request.method, request.url.path) for request in requests] == [
        ("POST", "/rest/leadClaims"),
        ("PATCH", "/rest/leadClaims/remote-claim-1"),
    ]
    assert requests[0].headers["Authorization"] == "Bearer secret-api-key"
    assert requests[0].read().decode() == (
        '{"externalId":"claim-1","organizationId":"org-a","status":"active",'
        '"lastEventType":"claim.created"}'
    )


def test_twenty_sink_rejects_unknown_event_type_without_calling_http() -> None:
    client = httpx.Client(
        transport=httpx.MockTransport(lambda request: httpx.Response(500))
    )
    sink = TwentyHttpSink(
        base_url="https://crm.example.com",
        api_key="secret-api-key",
        client=client,
    )

    try:
        sink.deliver("unknown.event", {"id": "1"})
    except ValueError as exc:
        assert str(exc) == "unsupported Twenty event type: unknown.event"
    else:
        raise AssertionError("unknown event type must be rejected")


def test_twenty_sink_retries_create_when_response_has_no_remote_id() -> None:
    sink = TwentyHttpSink(
        base_url="https://crm.example.com",
        api_key="secret-api-key",
        client=httpx.Client(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(201, json={"data": {}})
            )
        ),
    )

    with pytest.raises(ValueError, match="did not return a record id"):
        sink.deliver(
            "claim.created",
            {"claim_id": "claim-1", "org_id": "org-a", "status": "active"},
        )
