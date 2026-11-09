import sqlite3

from conftest import auth_headers

from lead_core.intelligence.legacy import TABLES, legacy_overview


def test_legacy_counts_are_real_and_read_only(tmp_path, settings):
    database = tmp_path / "legacy.sqlite"
    with sqlite3.connect(database) as connection:
        for index, table in enumerate(TABLES.values(), 1):
            connection.execute(f'CREATE TABLE "{table}" (id INTEGER PRIMARY KEY)')
            connection.executemany(f'INSERT INTO "{table}" (id) VALUES (?)', [(i,) for i in range(index)])
    before = database.read_bytes()
    settings.legacy_crm_database_path = str(database)
    result = legacy_overview(settings)
    assert result["available"] is True
    assert result["stats"] == dict(zip(TABLES, range(1, 6), strict=True))
    assert database.read_bytes() == before


def test_missing_legacy_source_does_not_fabricate_zero_or_create_database(tmp_path, settings):
    database = tmp_path / "absent.sqlite"
    settings.legacy_crm_database_path = str(database)
    result = legacy_overview(settings)
    assert result["available"] is False
    assert result["stats"] is None
    assert not database.exists()


def test_franchise_overview_does_not_read_or_return_legacy(client, settings, monkeypatch):
    from lead_core.api.routes import workspace
    calls = []
    monkeypatch.setattr(workspace, "legacy_overview", lambda _: calls.append(True) or {"available": False, "stats": None})
    franchise = auth_headers(user="member", org="org-a", roles="franchise_member")
    response = client.get("/api/v1/workspace/overview", headers=franchise)
    assert response.status_code == 200
    assert "legacy_crm" not in response.json()
    assert calls == []
    executive = auth_headers(user="ceo", roles="hq_executive")
    assert client.get("/api/v1/workspace/overview", headers=executive).json()["legacy_crm"]["available"] is False
    assert calls == [True]
