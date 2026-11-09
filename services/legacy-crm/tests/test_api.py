from fastapi.testclient import TestClient


def test_clean_database_starts_healthy_and_lists_demo_leads(tmp_path):
    """Removing initialisation or demo seeding must make this endpoint contract fail."""
    from app.main import create_app

    app = create_app(database_url=f"sqlite:///{tmp_path / 'clean.db'}")
    with TestClient(app) as client:
        health = client.get("/api/health")
        leads = client.get("/api/leads")

    assert health.status_code == 200
    assert health.json() == {"status": "ok"}
    assert leads.status_code == 200
    assert len(leads.json()) >= 3
    assert all("shop_name" in lead for lead in leads.json())


def test_initialisation_creates_each_required_persistent_record_table(tmp_path):
    """Dropping any core table must make the persistence contract fail."""
    from sqlalchemy import inspect
    from app.main import create_app

    app = create_app(database_url=f"sqlite:///{tmp_path / 'records.db'}")
    with TestClient(app):
        table_names = set(inspect(app.state.engine).get_table_names())

    assert {
        "import_batches",
        "repair_shop_leads",
        "follow_ups",
        "opportunities",
        "franchises",
        "training_records",
        "knowledge_documents",
        "report_snapshots",
    } <= table_names


def test_executive_lead_response_excludes_private_contact_fields(tmp_path):
    """Accidentally exposing a private lead field must fail this executive contract."""
    from app.main import create_app

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'executive.db'}")) as client:
        response = client.get("/api/executive/leads")

    assert response.status_code == 200
    assert response.json()
    forbidden = {"phone", "wechat", "contact_name", "private_notes"}
    assert not forbidden.intersection(response.json()[0])


def test_local_vite_origin_is_allowed_by_cors(tmp_path):
    """Removing local Vite CORS support must prevent the browser preflight response."""
    from app.main import create_app

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'cors.db'}")) as client:
        response = client.options(
            "/api/leads",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_demo_seed_contains_linked_followup_pipeline_franchise_and_training(tmp_path):
    """Dashboard seed must represent the complete operating flow, not isolated leads."""
    from sqlalchemy import func, select
    from app.main import create_app
    from app.models import FollowUp, Franchise, Opportunity, TrainingRecord

    app = create_app(database_url=f"sqlite:///{tmp_path / 'seed-flow.db'}")
    with TestClient(app):
        with app.state.session_factory() as session:
            counts = {
                "follow_ups": session.scalar(select(func.count(FollowUp.id))),
                "opportunities": session.scalar(select(func.count(Opportunity.id))),
                "franchises": session.scalar(select(func.count(Franchise.id))),
                "trainings": session.scalar(select(func.count(TrainingRecord.id))),
            }
            linked_training = session.scalar(
                select(func.count(TrainingRecord.id)).where(TrainingRecord.franchise_id.is_not(None))
            )

    assert all(value and value > 0 for value in counts.values())
    assert linked_training == counts["trainings"]


def test_read_only_workbench_collections_expose_linked_business_records_without_contacts(tmp_path):
    """Supporting workbench views need source-backed opportunities, training, and report history."""
    from app.main import create_app

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'collections.db'}")) as client:
        opportunities = client.get("/api/opportunities")
        trainings = client.get("/api/trainings")
        reports = client.get("/api/reports")

    assert opportunities.status_code == 200
    assert trainings.status_code == 200
    assert reports.status_code == 200
    assert {"id", "shop_name", "stage", "estimated_value"} <= opportunities.json()[0].keys()
    assert {"id", "shop_name", "training_name", "status", "completed_at"} <= trainings.json()[0].keys()
    assert {"id", "report_name", "period", "pdf_url", "pptx_url"} <= reports.json()[0].keys()
    forbidden = {"phone", "wechat", "contact_name", "private_notes", "address"}
    payloads = [*opportunities.json(), *trainings.json(), *reports.json()]
    def keys_in(value):
        if isinstance(value, dict):
            return set(value).union(*(keys_in(item) for item in value.values()))
        if isinstance(value, list):
            return set().union(*(keys_in(item) for item in value)) if value else set()
        return set()
    assert not forbidden.intersection(keys_in(payloads))


def test_reports_use_the_configured_public_api_prefix(tmp_path):
    """A path-based deployment must return report links below its own API route."""
    from app.main import create_app

    app = create_app(
        database_url=f"sqlite:///{tmp_path / 'public-prefix.db'}",
        public_api_prefix="/workbench/api",
    )
    with TestClient(app) as client:
        created = client.post(
            "/api/reports",
            json={"report_name": "path deployment report", "period": "current month"},
        )

    assert created.status_code == 201
    assert created.json()["pdf_url"].startswith("/workbench/api/reports/")
    assert created.json()["pptx_url"].startswith("/workbench/api/reports/")
