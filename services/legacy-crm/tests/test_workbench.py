from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from threading import Barrier

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import func, select


def test_import_creates_traceable_lead_batch_and_rejects_exclusive_conflict(tmp_path):
    from app.main import create_app

    hangzhou = "门店名称,省份,城市,联系电话\n杭州测试店,浙江省,杭州市,13900009999\n"
    ningbo = "门店名称,省份,城市,联系电话\n宁波合作店,浙江省,宁波市,13900008888\n"
    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'batch.db'}")) as client:
        uploaded = client.post("/api/imports/upload", files={"file": ("hangzhou.csv", hangzhou, "text/csv")})
        client.post("/api/imports/upload", files={"file": ("ningbo.csv", ningbo, "text/csv")})
        batches = {item["target_region"]: item for item in client.get("/api/batches").json()}
        hangzhou_batch = client.get(f"/api/batches/{batches['杭州市']['id']}")
        reviewed = client.post(f"/api/batches/{batches['杭州市']['id']}/review")
        conflict = client.post(f"/api/batches/{batches['宁波市']['id']}/dispatch", json={"franchise_id": 2})
        allowed = client.post(f"/api/batches/{batches['杭州市']['id']}/dispatch", json={"franchise_id": 1})
        blocked = client.post("/api/franchises/2/territories", json={"province": "浙江省", "city": "宁波市", "exclusive": True})

    assert uploaded.status_code == 201
    assert hangzhou_batch.json()["rows"][0]["shop_name"] == "杭州测试店"
    assert reviewed.json()["status"] == "reviewed"
    assert conflict.status_code == 409
    assert allowed.status_code == 200
    assert blocked.status_code == 409


def test_feedback_draft_must_be_confirmed_before_quality_and_actions_persist(tmp_path):
    from app.main import create_app
    from app.models import LeadBatch

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'feedback.db'}")) as client:
        client.post(
            "/api/imports/upload",
            files={"file": ("ningbo.csv", "门店名称,省份,城市,联系电话\n宁波合作店,浙江省,宁波市,13900008888\n", "text/csv")},
        )
        batch_id = client.get("/api/batches").json()[0]["id"]
        dispatched = client.post(f"/api/batches/{batch_id}/dispatch", json={"franchise_id": 1})
        with client.app.state.session_factory() as session:
            batch = session.get(LeadBatch, batch_id)
            batch.dispatched_at = datetime.utcnow() - timedelta(days=4)
            session.commit()
        raw = client.post(f"/api/batches/{batch_id}/feedback", json={"text": "联系过宁波合作店，有加盟意向"})
        draft = client.post(f"/api/batches/{batch_id}/draft")
        before = client.get(f"/api/batches/{batch_id}").json()
        confirmed = client.post(f"/api/drafts/{draft.json()['id']}/confirm")
        quality = client.post(f"/api/batches/{batch_id}/quality", json={"quality": "较好", "reason": "点名门店且方向明确"})
        opportunity = client.post(
            "/api/opportunities",
            json={"lead_id": 1, "opportunity_type": "channel", "stage": "合格渠道机会", "next_action": "确认合作规则"},
        )
        actions = client.get("/api/actions")
        first = actions.json()[0]
        done = client.post(f"/api/actions/{first['id']}/complete")
        remaining = {item["id"] for item in client.get("/api/actions").json()}

    assert dispatched.status_code == 200
    assert raw.status_code == 200
    assert draft.status_code == 200
    assert before["confirmed_feedback"] is None
    assert confirmed.json()["confirmed"] is True
    assert quality.json()["quality"] == "较好"
    assert opportunity.json()["opportunity_type"] == "channel"
    assert done.json()["done"] is True
    assert first["id"] not in remaining


def test_map_overview_and_city_detail_do_not_expose_contacts(tmp_path):
    from app.main import create_app

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'map.db'}")) as client:
        overview = client.get("/api/map/overview")
        city = client.get("/api/map/city", params={"province": "浙江省", "city": "宁波市"})
        franchise = client.get("/api/franchises/1").json()
        application = next(item for item in franchise["delivery"] if item["kind"] == "application")
        delivery = client.patch(f"/api/delivery-items/{application['id']}", json={"status": "applied", "evidence": "门店已按接待标准交车"})
        support = next(item for item in franchise["support"] if item["milestone"] == "monthly")
        completed = client.post(f"/api/support-records/{support['id']}/complete", json={"notes": "本月回访完成"})

    assert overview.status_code == 200
    assert any(item["franchise_total"] for item in overview.json())
    assert city.status_code == 200
    assert "phone" not in str(city.json())
    assert any(item["status"] == "applied" for item in delivery.json()["delivery"])
    assert any(item["completed_on"] for item in completed.json()["support"] if item["id"] == support["id"])


def test_repeated_territory_request_reuses_authorization_without_losing_distinct_terms(tmp_path):
    from app.main import create_app
    from app.models import EntityEvent

    payload = {"province": "江苏省", "city": "苏州市", "exclusive": False, "starts_on": "2026-11-09"}
    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'territory-retry.db'}")) as client:
        first = client.post("/api/franchises/1/territories", json=payload)
        retry = client.post("/api/franchises/1/territories", json=payload)
        assert first.status_code == retry.status_code == 200
        assert first.json()["territories"] == retry.json()["territories"]

        # Separate cities, exclusivity and explicit effective dates remain distinct grants.
        for change in ({"city": "无锡市"}, {"exclusive": True}, {"starts_on": "2027-01-01"}):
            result = client.post("/api/franchises/1/territories", json={**payload, **change})
            assert result.status_code == 200
        assert len(result.json()["territories"]) == len(first.json()["territories"]) + 3
        with client.app.state.session_factory() as session:
            assert session.scalar(select(func.count(EntityEvent.id)).where(
                EntityEvent.entity_type == "franchise", EntityEvent.entity_id == 1, EntityEvent.action == "territory",
            )) == 4


def test_repeated_monthly_completion_keeps_first_result_and_creates_followups_once(tmp_path):
    from app.main import create_app
    from app.models import ActionItem, EntityEvent

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'support-retry.db'}")) as client:
        initial = client.get("/api/franchises/1").json()
        support = next(item for item in initial["support"] if item["milestone"] == "monthly")
        endpoint = f"/api/support-records/{support['id']}/complete"
        first = client.post(endpoint, json={"notes": "首次回访发现问题"})
        retry = client.post(endpoint, json={"notes": "重试不应覆盖记录"})
        assert first.status_code == retry.status_code == 200
        assert first.json()["support"] == retry.json()["support"]
        assert len(retry.json()["support"]) == len(initial["support"]) + 1
        completed = next(item for item in retry.json()["support"] if item["id"] == support["id"])
        assert completed["completed_on"] == date.today().isoformat()
        assert completed["notes"] == "首次回访发现问题"
        with client.app.state.session_factory() as session:
            assert session.scalar(select(func.count(ActionItem.id)).where(
                ActionItem.kind == "support_issue", ActionItem.source_id == support["id"],
            )) == 1
            assert session.scalar(select(func.count(EntityEvent.id)).where(
                EntityEvent.entity_type == "franchise", EntityEvent.entity_id == 1, EntityEvent.action == "support",
            )) == 1


@pytest.mark.parametrize("action", ["territory", "support"])
def test_concurrent_franchise_retries_have_only_one_business_effect(tmp_path, action):
    from app.main import create_app
    from app.models import ActionItem, Franchise, SupportRecord, TerritoryAuthorization
    from app.workbench import add_territory, complete_support_record

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / f'concurrent-{action}.db'}")) as client:
        initial = client.get("/api/franchises/1").json()
        support = next(item for item in initial["support"] if item["milestone"] == "monthly")
        ready = Barrier(2)

        def submit(_):
            with client.app.state.session_factory() as session:
                # Both sessions have seen the initial record before either writes.
                cached = session.get(Franchise if action == "territory" else SupportRecord, 1 if action == "territory" else support["id"])
                assert cached is not None
                ready.wait(timeout=10)
                if action == "territory":
                    return add_territory(session, 1, {"province": "江苏省", "city": "苏州市", "exclusive": False})
                return complete_support_record(session, support["id"], "并发回访发现问题")

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(submit, range(2)))
        assert all(result["id"] == 1 for result in results)
        with client.app.state.session_factory() as session:
            if action == "territory":
                assert session.scalar(select(func.count(TerritoryAuthorization.id)).where(
                    TerritoryAuthorization.franchise_id == 1, TerritoryAuthorization.city == "苏州市",
                )) == 1
            else:
                assert session.scalar(select(func.count(SupportRecord.id)).where(
                    SupportRecord.franchise_id == 1,
                )) == len(initial["support"]) + 1
                assert session.scalar(select(func.count(ActionItem.id)).where(
                    ActionItem.kind == "support_issue", ActionItem.source_id == support["id"],
                )) == 1


def test_monthly_snapshot_is_immutable_after_live_data_changes(tmp_path):
    from app.main import create_app
    from app.models import RepairShopLead

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'snap.db'}")) as client:
        frozen = client.post("/api/snapshots", json={"period": "本月"})
        with client.app.state.session_factory() as session:
            session.add(RepairShopLead(shop_name="变更后的店", province="江苏省", city="南京市", source="test"))
            session.commit()
        live = client.get("/api/dashboard/personal")
        stored = client.get(f"/api/snapshots/{frozen.json()['id']}")

    assert frozen.status_code == 200
    assert live.json()["metrics"]["lead_total"] == stored.json()["payload"]["metrics"]["lead_total"] + 1
