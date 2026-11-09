from fastapi.testclient import TestClient


def test_development_cors_allows_dev_identity_headers(client: TestClient) -> None:
    response = client.options(
        "/api/v1/pool",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "x-user-id,x-org-id,x-roles",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    allowed_headers = response.headers["access-control-allow-headers"].lower()
    assert "x-user-id" in allowed_headers
    assert "x-org-id" in allowed_headers
    assert "x-roles" in allowed_headers
