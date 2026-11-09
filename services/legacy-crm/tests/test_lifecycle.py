from conftest import TEST_OPERATOR_PASSWORD, TEST_EXECUTIVE_PASSWORD
from fastapi.testclient import TestClient


def test_executive_cannot_write_and_does_not_see_unpublished_reports(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "0")
    from app.main import create_app

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'lifecycle-auth.db'}")) as client:
        leader = client.post("/api/auth/login", json={"username": "leader", "password": TEST_EXECUTIVE_PASSWORD}).json()["token"]
        operator = client.post("/api/auth/login", json={"username": "lin", "password": TEST_OPERATOR_PASSWORD}).json()["token"]
        headers = {"Authorization": f"Bearer {leader}"}
        denied = client.post("/api/leads", headers=headers, json={"shop_name": "不该写入的店"})
        draft = client.post(
            "/api/reports",
            headers={"Authorization": f"Bearer {operator}"},
            json={"report_name": "未发布草稿", "period": "本月"},
        )
        listed = client.get("/api/reports", headers=headers)

    assert denied.status_code == 403
    assert draft.status_code == 201
    assert draft.json()["published"] is False
    assert all(item["report_name"] != "未发布草稿" for item in listed.json())


def test_void_requires_reason_and_does_not_hard_delete(tmp_path):
    from app.main import create_app
    from app.models import EntityEvent, RepairShopLead
    from sqlalchemy import select

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'lifecycle-void.db'}")) as client:
        created = client.post("/api/leads", json={"shop_name": "待作废门店", "province": "江苏省", "city": "南京市"})
        lead_id = created.json()["id"]
        missing = client.post(f"/api/leads/{lead_id}/void", json={})
        voided = client.post(f"/api/leads/{lead_id}/void", json={"reason": "重复线索"})
        deleted = client.delete(f"/api/leads/{lead_id}")
        listed = client.get("/api/leads")
        history = client.get(f"/api/leads/{lead_id}/history")
        with client.app.state.session_factory() as session:
            still_there = session.get(RepairShopLead, lead_id)
            events = list(session.scalars(select(EntityEvent).where(EntityEvent.entity_id == lead_id)))

    assert created.status_code == 200
    assert missing.status_code == 400
    assert voided.json()["status"] == "voided"
    assert deleted.status_code == 405
    assert any(item["id"] == lead_id for item in listed.json())
    assert still_there is not None
    assert any(event.action == "void" for event in events)
    assert history.json()[0]["reason"] == "重复线索"


def test_illegal_status_transition_is_rejected(tmp_path):
    from app.main import create_app

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'lifecycle-transition.db'}")) as client:
        created = client.post("/api/leads", json={"shop_name": "归档店"})
        lead_id = created.json()["id"]
        archived = client.post(f"/api/leads/{lead_id}/archive", json={"reason": "暂不跟进"})
        again = client.post(f"/api/leads/{lead_id}/void", json={"reason": "不能再作废"})

    assert archived.status_code == 200
    assert again.status_code == 400


def test_audit_is_written_in_the_same_transaction_as_the_entity_event(tmp_path):
    from app.main import create_app
    from app.models import AuditLog, EntityEvent
    from sqlalchemy import select

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'lifecycle-audit.db'}")) as client:
        created = client.post("/api/leads", json={"shop_name": "审计店"})
        lead_id = created.json()["id"]
        with client.app.state.session_factory() as session:
            events = list(session.scalars(select(EntityEvent).where(EntityEvent.entity_id == lead_id, EntityEvent.action == "create")))
            audits = list(session.scalars(select(AuditLog).where(AuditLog.action == "lead.create")))

    assert events and audits
    assert events[0].entity_id == lead_id


def test_knowledge_ai_only_uses_published_versions(tmp_path):
    from app.main import create_app

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'lifecycle-knowledge.db'}")) as client:
        draft = client.post(
            "/api/knowledge-documents",
            json={"title": "内部草稿条款", "category": "政策", "content": "草稿中的高压作业秘密流程安排。"},
        )
        asked = client.post("/api/assistance", json={"question": "高压作业秘密流程安排", "mode": "knowledge"})
        published = client.post(f"/api/knowledge-documents/{draft.json()['id']}/publish")
        asked_again = client.post("/api/assistance", json={"question": "高压作业秘密流程安排", "mode": "knowledge"})

    assert draft.json()["status"] == "draft"
    assert asked.json()["sufficient_evidence"] is False
    assert published.json()["status"] == "published"
    assert asked_again.json()["sufficient_evidence"] is True
    assert asked_again.json()["citations"][0]["document_id"] == published.json()["id"]


def test_report_publish_freezes_snapshot_and_is_immutable(tmp_path):
    from app.main import create_app

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'lifecycle-report.db'}")) as client:
        created = client.post("/api/reports", json={"report_name": "本月草稿", "period": "本月"})
        report_id = created.json()["id"]
        snapshots_before = client.get("/api/snapshots").json()
        published = client.post(f"/api/reports/{report_id}/publish")
        snapshots_after = client.get("/api/snapshots").json()
        again = client.post(f"/api/reports/{report_id}/publish")

    assert created.json()["published"] is False
    assert published.json()["published"] is True
    assert len(snapshots_after) == len(snapshots_before) + 1
    assert again.status_code == 400


def test_lead_convert_sign_and_training_loop_persist(tmp_path):
    from app.main import create_app

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'lifecycle-loop.db'}")) as client:
        lead = client.post("/api/leads", json={"shop_name": "闭环测试店", "province": "江苏省", "city": "南京市"}).json()
        follow = client.post(f"/api/leads/{lead['id']}/follow-ups", json={"note": "电话沟通", "status": "跟进中"})
        converted = client.post(f"/api/leads/{lead['id']}/convert", json={"opportunity_type": "franchise", "stage": "合格加盟机会"})
        signed = client.post(f"/api/opportunities/{converted.json()['id']}/sign")
        training = client.post("/api/trainings", json={"franchise_id": signed.json()["id"], "training_name": "开业接待"})
        completed = client.post(f"/api/trainings/{training.json()['id']}/complete")
        prefs = client.patch("/api/settings", json={"reminder_days": 5, "default_period": "本月"})
        notes = client.get("/api/notifications")

    assert follow.status_code == 200
    assert converted.json()["lead_id"] == lead["id"]
    assert signed.json()["status"] == "筹建中"
    assert signed.json()["delivery"]
    assert any(item["milestone"] == "d30" for item in signed.json()["support"])
    assert completed.json()["status"] == "已完成"
    assert prefs.json()["reminder_days"] == 5
    assert notes.status_code == 200
