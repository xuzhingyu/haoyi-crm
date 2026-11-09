from dataclasses import asdict
from datetime import date
import json

from fastapi.testclient import TestClient


def _leaf_values(value):
    if isinstance(value, dict):
        for item in value.values():
            yield from _leaf_values(item)
    elif isinstance(value, (list, tuple)):
        for item in value:
            yield from _leaf_values(item)
    else:
        yield value


def test_endpoint_builds_intent_scoped_safe_dtos_before_the_injected_cloud_boundary(tmp_path):
    """Passing any request text or an unscoped dataset to an injected cloud provider must fail."""
    from app.ai_provider import OperationsOutboundDTO
    from app.assistance import AssistanceResult
    from app.main import create_app
    from app.models import KnowledgeDocument, RepairShopLead

    class CapturingCloudProvider:
        def __init__(self):
            self.received = []

        def answer(self, outbound):
            self.received.append(outbound)
            return AssistanceResult(
                guidance="Cloud guidance",
                citations=[],
                sufficient_evidence=True,
                suggested_actions=[],
                business_sources=[],
                provider="cloud",
            )

    provider = CapturingCloudProvider()
    app = create_app(database_url=f"sqlite:///{tmp_path / 'safe-dto-boundary.db'}", ai_provider=provider)
    sensitive_text = "phone-13800000000 history-secret document-secret lead-secret"
    cases = [
        (
            {"question": "\u5546\u673a\u5206\u6790", "mode": "operations", "history": [{"role": "user", "content": sensitive_text}]},
            ("operations", "opportunity_analysis", ("dashboard_metrics", "opportunity_funnel")),
        ),
        (
            {"question": "\u7ecf\u8425\u98ce\u9669", "mode": "operations", "history": [{"role": "user", "content": sensitive_text}]},
            ("operations", "risk_review", ("overdue_follow_up_risks",)),
        ),
        (
            {"question": "\u57f9\u8bad\u63d0\u9192", "mode": "operations", "history": [{"role": "user", "content": sensitive_text}]},
            ("operations", "training_reminder", ("training_metrics",)),
        ),
        (
            {"question": "\u62dc\u8bbf\u51c6\u5907", "mode": "visit_prep", "lead_id": 1, "history": [{"role": "user", "content": sensitive_text}]},
            ("visit_prep", "general_operations", ("repair_shop_lead",)),
        ),
        (
            {"question": "\u5468\u62a5\u751f\u6210", "mode": "weekly_report", "history": [{"role": "user", "content": sensitive_text}]},
            (
                "weekly_report",
                "general_operations",
                ("dashboard_metrics", "opportunity_funnel", "overdue_follow_up_risks", "training_metrics"),
            ),
        ),
    ]

    with TestClient(app) as client:
        with app.state.session_factory() as session:
            selected_lead = session.get(RepairShopLead, 1)
            assert selected_lead is not None
            selected_lead.new_energy_lifts = None
            selected_lead.monthly_order_count = None
            session.add(
                KnowledgeDocument(
                    title="document-secret",
                    category="operations",
                    content="document-secret",
                )
            )
            session.commit()

        responses = [client.post("/api/assistance", json=body) for body, _ in cases]

    assert all(response.status_code == 200 for response in responses)
    assert all(isinstance(outbound, OperationsOutboundDTO) for outbound in provider.received)
    assert [
        (outbound.mode, outbound.intent, outbound.dataset_names)
        for outbound in provider.received
    ] == [expected for _, expected in cases]

    visit_outbound = provider.received[3]
    assert visit_outbound.datasets["repair_shop_lead"] == {
        "selected": True,
        "metric_availability": {"new_energy_lifts": False, "monthly_order_count": False},
        "metrics": {"new_energy_lifts": 0, "monthly_order_count": 0},
    }

    safe_enums = {
        "operations",
        "visit_prep",
        "weekly_report",
        "opportunity_analysis",
        "risk_review",
        "training_reminder",
        "general_operations",
    }
    for outbound in provider.received:
        assert all(
            isinstance(value, (bool, int, float)) or value in safe_enums
            for value in _leaf_values(asdict(outbound))
        )
        assert sensitive_text not in json.dumps(asdict(outbound), ensure_ascii=False)


def test_global_training_metrics_keep_unassigned_records_in_both_dashboard_outputs(tmp_path):
    """Inner joining every global training query must not erase unassigned training records."""
    from app.main import create_app
    from app.models import TrainingRecord

    app = create_app(database_url=f"sqlite:///{tmp_path / 'global-unassigned-training.db'}")
    with TestClient(app) as client:
        with app.state.session_factory() as session:
            session.add(
                TrainingRecord(
                    franchise_id=None,
                    training_name="unassigned training",
                    completed_at=date.today(),
                    status="completed",
                )
            )
            session.commit()
        dashboard = client.get("/api/dashboard/personal")

    assert dashboard.status_code == 200
    assert {"training_total": 3, "training_completed": 2}.items() <= dashboard.json()["metrics"].items()
    assert dashboard.json()["training"] == {"total": 3, "completed": 2, "completion_rate": 2 / 3}


def test_aggregate_region_scope_filters_its_constituent_region_pairs(tmp_path):
    """Treating the synthetic other-region label as a real city must return an empty scope."""
    from app.assistance_context import build_assistance_context
    from app.main import create_app

    app = create_app(database_url=f"sqlite:///{tmp_path / 'aggregate-region-scope.db'}")
    with TestClient(app):
        with app.state.session_factory() as session:
            context, _ = build_assistance_context(
                session,
                None,
                {
                    "province": None,
                    "city": "\u5176\u4ed6\u5730\u533a",
                    "constituent_regions": [
                        {"province": "\u6c5f\u82cf\u7701", "city": "\u5357\u4eac\u5e02"},
                        {"province": "\u6d59\u6c5f\u7701", "city": "\u676d\u5dde\u5e02"},
                    ],
                },
                None,
            )

    assert context["selected_region_scope"]["metrics"] == {
        "lead_total": 2,
        "opportunity_total": 2,
        "franchise_total": 0,
        "training_total": 0,
        "training_completed": 0,
        "estimated_pipeline_value": 380000,
        "monthly_order_capacity": 286,
    }


def test_knowledge_ingestion_rejects_normalized_blank_content(tmp_path):
    """Accepting whitespace-only knowledge documents makes title-only evidence possible."""
    from app.main import create_app

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'blank-knowledge-ingestion.db'}")) as client:
        response = client.post(
            "/api/knowledge-documents",
            json={"title": "usable title", "category": "operations", "content": " \n\t "},
        )

    assert response.status_code == 422


def test_local_retrieval_skips_existing_blank_content_even_when_the_title_matches(tmp_path):
    """A legacy blank body must not become sufficient evidence through a matching title alone."""
    from app.main import create_app
    from app.models import KnowledgeDocument

    app = create_app(database_url=f"sqlite:///{tmp_path / 'blank-knowledge-retrieval.db'}")
    with TestClient(app) as client:
        with app.state.session_factory() as session:
            session.add(
                KnowledgeDocument(
                    title="inverterdiagnostic",
                    category="operations",
                    content="  \n\t",
                )
            )
            session.commit()
        response = client.post("/api/assistance", json={"question": "inverterdiagnostic"})

    assert response.status_code == 200
    assert response.json()["sufficient_evidence"] is False
    assert response.json()["citations"] == []


def test_subject_bigrams_do_not_bridge_across_removed_generic_phrases():
    """Deleting a generic phrase must not fabricate the bigram across its former boundary."""
    from app.assistance import subject_bigrams

    terms = subject_bigrams("ab\u5de5\u4f5c\u6d41\u7a0b\u5b89\u6392cd")

    assert {"ab", "cd"} <= terms
    assert "bc" not in terms


def test_cloud_response_drops_duplicate_and_unknown_citation_ids(tmp_path, monkeypatch):
    """Cloud citation ids cannot become duplicate or unknown local citations without local documents."""
    import app.ai_provider
    from app.main import create_app

    monkeypatch.setenv("AI_GATEWAY_URL", "http://budget-gateway.test/api/v1/internal/ai/chat-completions")
    monkeypatch.setenv("AI_GATEWAY_TOKEN", "test-service-token")


    class StaticResponse:
        status_code = 200
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "guidance": "Cloud guidance",
                                    "suggested_actions": [],
                                    "citation_document_ids": [1, 1, 999],
                                }
                            )
                        }
                    }
                ]
            }

    class StaticClient:
        def __init__(self, **_kwargs):
            pass

        def post(self, *_args, **_kwargs):
            return StaticResponse()

        def close(self):
            return None

    monkeypatch.setattr(app.ai_provider.httpx, "Client", StaticClient)
    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'cloud-citations.db'}")) as client:
        response = client.post("/api/assistance", json={"question": "operations", "mode": "operations"})

    assert response.status_code == 200
    assert response.json()["provider"] == "cloud"
    assert response.json()["citations"] == []
