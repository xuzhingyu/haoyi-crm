from fastapi.testclient import TestClient
from datetime import date, datetime
from io import BytesIO
from zipfile import ZipFile


def test_personal_dashboard_aggregates_operating_totals_from_repository_data(tmp_path):
    """Returning raw rows instead of the calculated workbench totals must fail this contract."""
    from app.main import create_app

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'personal-dashboard.db'}")) as client:
        response = client.get("/api/dashboard/personal")

    assert response.status_code == 200
    assert response.json()["metrics"] == {
        "lead_total": 6,
        "opportunity_total": 4,
        "franchise_total": 2,
        "training_total": 2,
        "training_completed": 1,
        "estimated_pipeline_value": 650000,
        "monthly_order_capacity": 687,
    }


def test_personal_dashboard_filters_operating_data_by_requested_period(tmp_path):
    """Changing the workbench period must change source-backed metrics, funnel, and map nodes."""
    from app.main import create_app
    from app.models import RepairShopLead

    app = create_app(database_url=f"sqlite:///{tmp_path / 'period-dashboard.db'}")
    with TestClient(app) as client:
        with app.state.session_factory() as session:
            lead = session.get(RepairShopLead, 1)
            today = date.today()
            previous_year = today.year - 1 if today.month == 1 else today.year
            previous_month = 12 if today.month == 1 else today.month - 1
            lead.created_at = datetime(previous_year, previous_month, 15, 9, 0)
            session.commit()

        current = client.get("/api/dashboard/personal", params={"period": "本月"})
        previous = client.get("/api/dashboard/personal", params={"period": "上月"})

    assert current.status_code == 200
    assert previous.status_code == 200
    assert current.json()["period"] == "本月"
    assert current.json()["metrics"]["lead_total"] == 5
    assert current.json()["metrics"]["opportunity_total"] == 3
    assert sum(item["lead_total"] for item in current.json()["regions"]) == 5
    assert previous.json()["period"] == "上月"
    assert previous.json()["metrics"]["lead_total"] == 1
    assert previous.json()["metrics"]["opportunity_total"] == 1


def test_executive_dashboard_aggregates_portfolio_totals_from_same_repository_data(tmp_path):
    """Removing executive aggregation must break the portfolio-level metrics contract."""
    from app.main import create_app

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'executive-dashboard.db'}")) as client:
        response = client.get("/api/dashboard/executive")

    assert response.status_code == 200
    assert response.json()["metrics"] == {
        "lead_total": 6,
        "opportunity_total": 4,
        "franchise_total": 2,
        "training_total": 2,
        "training_completed": 1,
        "estimated_pipeline_value": 650000,
        "monthly_order_capacity": 687,
    }


def test_executive_funnel_counts_every_opportunity_once(tmp_path):
    """Dropping a stage or counting one twice must violate the funnel consistency invariant."""
    from app.main import create_app

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'funnel.db'}")) as client:
        dashboard = client.get("/api/dashboard/executive").json()

    funnel = dashboard["funnel"]
    assert sum(item["count"] for item in funnel) == 4
    assert sum(item["estimated_value"] for item in funnel) == 650000
    assert len(funnel) == 4


def test_regional_nodes_aggregate_repository_regions_without_fabricated_coordinates(tmp_path):
    """Inventing latitude or longitude for a region must break the map-node data contract."""
    from app.main import create_app

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'regions.db'}")) as client:
        regions = client.get("/api/dashboard/executive").json()["regions"]

    assert sum(item["lead_total"] for item in regions) == 6
    assert len(regions) == 6
    assert all({"province", "city", "lead_total", "franchise_total"} <= item.keys() for item in regions)
    assert sum(item["franchise_total"] for item in regions) == 2
    assert all(not {"latitude", "longitude", "coordinates"}.intersection(item) for item in regions)


def test_dashboard_training_metrics_count_completed_records(tmp_path):
    """Treating scheduled training as completed must break the training completion contract."""
    from app.main import create_app

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'training.db'}")) as client:
        training = client.get("/api/dashboard/personal").json()["training"]

    assert training == {"total": 2, "completed": 1, "completion_rate": 0.5}


def test_executive_risk_list_excludes_sensitive_contact_and_note_values(tmp_path):
    """Serialising a lead's private fields into a risk item must fail executive data minimisation."""
    from app.main import create_app
    from app.models import FollowUp, RepairShopLead

    app = create_app(database_url=f"sqlite:///{tmp_path / 'risk-privacy.db'}")
    with TestClient(app) as client:
        with app.state.session_factory() as session:
            lead = session.get(RepairShopLead, 1)
            follow_up = session.get(FollowUp, 1)
            lead.phone = "139PRIVATE000"
            lead.contact_name = "Private Contact"
            lead.private_notes = "private lead note"
            follow_up.note = "private follow-up note"
            follow_up.due_date = date(2020, 1, 1)
            session.commit()
        dashboard = client.get("/api/dashboard/executive").json()

    assert any(item["type"] == "overdue_follow_up" for item in dashboard["risks"])
    serialised = str(dashboard)
    for private_value in (
        "139PRIVATE000",
        "Private Contact",
        "private lead note",
        "private follow-up note",
    ):
        assert private_value not in serialised


def test_knowledge_document_can_be_created_and_listed(tmp_path):
    """Discarding submitted knowledge documents must break the local knowledge-base contract."""
    from app.main import create_app

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'knowledge-create.db'}")) as client:
        created = client.post(
            "/api/knowledge-documents",
            json={
                "title": "高压作业检查单",
                "category": "安全",
                "content": "先断电验电，再检查绝缘工具。",
            },
        )
        documents = client.get("/api/knowledge-documents")

    assert created.status_code == 201
    assert created.json()["title"] == "高压作业检查单"
    assert any(document["id"] == created.json()["id"] for document in documents.json())


def test_local_assistance_returns_chinese_guidance_with_knowledge_citations(tmp_path):
    """Answering without the matching source citation must break evidence-grounded assistance."""
    from app.main import create_app

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'assistance-cited.db'}")) as client:
        document = client.post(
            "/api/knowledge-documents",
            json={
                "title": "高压断电流程",
                "category": "安全",
                "content": "高压维修前必须断电、验电并佩戴绝缘防护用品。",
                "status": "published",
            },
        ).json()
        response = client.post("/api/assistance", json={"question": "高压维修前如何断电验电？"})

    assert response.status_code == 200
    body = response.json()
    assert body["sufficient_evidence"] is True
    assert "断电" in body["guidance"]
    assert body["provider"] == "local"
    assert [citation["document_id"] for citation in body["citations"]] == [document["id"], 1]


def test_local_assistance_reports_insufficient_evidence_without_a_matching_source(tmp_path):
    """Claiming guidance for an unsupported topic must fail the insufficient-evidence branch."""
    from app.main import create_app

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'assistance-insufficient.db'}")) as client:
        response = client.post("/api/assistance", json={"question": "火星殖民地如何安排补给？"})

    assert response.status_code == 200
    assert {
        "guidance": "现有知识库证据不足，建议补充对应流程或向运营负责人确认。",
        "citations": [],
        "sufficient_evidence": False,
        "provider": "local",
    }.items() <= response.json().items()
    body = response.json()
    assert body["business_sources"] == []
    assert body["suggested_actions"] == []
    assert body["fallback_reason"] is None


def test_local_assistance_rejects_a_question_with_only_one_generic_bigram_in_common(tmp_path):
    """Treating a shared generic '流程' bigram as evidence must fail the evidence threshold."""
    from app.main import create_app

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'assistance-weak-overlap.db'}")) as client:
        client.post(
            "/api/knowledge-documents",
            json={
                "title": "客户回访流程",
                "category": "服务",
                "content": "客户回访流程用于确认售后满意度。",
            },
        )
        response = client.post("/api/assistance", json={"question": "火星流程如何安排补给？"})

    assert response.status_code == 200
    assert response.json()["sufficient_evidence"] is False
    assert response.json()["citations"] == []


def test_local_assistance_rejects_two_generic_workflow_terms_without_a_shared_subject(tmp_path):
    """Treating only '流程' and '安排' as topical evidence must reject unrelated guidance."""
    from app.main import create_app

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'assistance-generic-terms.db'}")) as client:
        client.post(
            "/api/knowledge-documents",
            json={
                "title": "客户回访流程安排",
                "category": "服务",
                "content": "客户回访流程安排用于确认售后满意度。",
            },
        )
        response = client.post("/api/assistance", json={"question": "火星补给流程如何安排？"})

    assert response.status_code == 200
    assert response.json()["sufficient_evidence"] is False
    assert response.json()["citations"] == []


def test_local_assistance_removes_generic_phrase_transition_bigrams_before_scoring(tmp_path):
    """Counting '作流' and '程安' from a generic workflow phrase must not create topic evidence."""
    from app.main import create_app

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'assistance-generic-phrase.db'}")) as client:
        client.post(
            "/api/knowledge-documents",
            json={
                "title": "客户工作流程安排",
                "category": "服务",
                "content": "客户工作流程安排用于确认售后满意度。",
            },
        )
        response = client.post("/api/assistance", json={"question": "火星工作流程安排补给？"})

    assert response.status_code == 200
    assert response.json()["sufficient_evidence"] is False
    assert response.json()["citations"] == []


def test_local_knowledge_does_not_create_evidence_bigrams_across_document_fields():
    """Joining title and content must not turn one genuine match into two evidence bigrams."""
    from app.assistance import AssistanceInput, KnowledgeEvidence, LocalKnowledgeProvider

    result = LocalKnowledgeProvider().answer(
        AssistanceInput(
            question="abcd",
            mode="knowledge",
            context={},
            history=[],
            documents=[
                KnowledgeEvidence(
                    id=1,
                    title="a",
                    category="safety",
                    content="bZZcd",
                )
            ],
        )
    )

    assert result.sufficient_evidence is False
    assert result.citations == []


def test_local_knowledge_rejects_a_one_bigram_only_document_as_a_citation():
    """Citing a document supported by one bigram must break the local evidence threshold."""
    from app.assistance import AssistanceInput, KnowledgeEvidence, LocalKnowledgeProvider

    result = LocalKnowledgeProvider().answer(
        AssistanceInput(
            question="abCDEFGHIJ",
            mode="knowledge",
            context={},
            history=[],
            documents=[
                KnowledgeEvidence(
                    id=1,
                    title="abCDEFGHIJ",
                    category="safety",
                    content="abCDEFGHIJ",
                ),
                KnowledgeEvidence(
                    id=2,
                    title="abXY",
                    category="safety",
                    content="abXY",
                ),
            ],
        )
    )

    assert result.sufficient_evidence is True
    assert result.citations == [{"document_id": 1, "title": "abCDEFGHIJ", "category": "safety"}]


def test_seeded_legacy_report_snapshot_downloads_in_both_formats(tmp_path):
    """Rejecting Task 1's persisted report payload must break backward-compatible downloads."""
    from app.main import create_app

    with TestClient(
        create_app(database_url=f"sqlite:///{tmp_path / 'legacy-report.db'}"),
        raise_server_exceptions=False,
    ) as client:
        pptx = client.get("/api/reports/1.pptx")
        pdf = client.get("/api/reports/1.pdf")

    assert pptx.status_code == 200
    assert pdf.status_code == 200
    assert pptx.content.startswith(b"PK")
    assert pdf.content.startswith(b"%PDF")


def test_both_report_formats_extract_every_snapshot_metric_and_training_value(tmp_path):
    """Omitting a persisted core or training value from either export must fail report completeness."""
    import fitz

    from app.main import create_app
    from app.models import Opportunity

    app = create_app(database_url=f"sqlite:///{tmp_path / 'report-content.db'}")
    with TestClient(app) as client:
        created = client.post(
            "/api/reports",
            json={"report_name": "指标完整性周报", "period": "2026-09-01/2026-09-07"},
        ).json()
        with app.state.session_factory() as session:
            session.get(Opportunity, 1).estimated_value = 999999
            session.commit()
        pptx = client.get(created["pptx_url"])
        pdf = client.get(created["pdf_url"])

    with ZipFile(BytesIO(pptx.content)) as archive:
        pptx_text = "".join(
            archive.read(name).decode("utf-8")
            for name in archive.namelist()
            if name.startswith("ppt/slides/slide") and name.endswith(".xml")
        )
    pdf_document = fitz.open(stream=pdf.content, filetype="pdf")
    pdf_text = "\n".join(page.get_text() for page in pdf_document)
    required_lines = {
        "数据周期: 2026-09-01/2026-09-07",
        "指标定义:",
        "缺失数据说明:",
        "管理摘要:",
        "核心指标:",
        "线索总数: 6",
        "商机总数: 4",
        "加盟门店数: 2",
        "培训总数: 2",
        "培训完成数: 1",
        "预计管道金额: 650000",
        "月均进场承载: 687",
        "培训完成率: 50.0%",
        "商机漏斗:",
        "区域对比:",
        "风险清单:",
        "下一步计划:",
        "协同诉求:",
    }
    assert all(line in pptx_text for line in required_lines)
    assert all(line in pdf_text for line in required_lines)


def test_pptx_paginates_large_report_sections_without_overflowing_a_content_slide(tmp_path):
    """Putting an upper-bound report into one body placeholder must fail visible-content pagination."""
    import json

    from pptx import Presentation

    from app.main import create_app
    from app.models import ReportSnapshot

    app = create_app(database_url=f"sqlite:///{tmp_path / 'report-pagination.db'}")
    with TestClient(app) as client:
        created = client.post(
            "/api/reports",
            json={"report_name": "大区经营报告", "period": "2026-09-01/2026-09-07"},
        ).json()
        with app.state.session_factory() as session:
            snapshot = session.get(ReportSnapshot, created["id"])
            payload = json.loads(snapshot.payload_json)
            payload["regions"] = [
                {"province": "测试省", "city": f"城市{index}", "lead_total": index, "monthly_order_capacity": index * 10}
                for index in range(1, 25)
            ]
            payload["risks"] = [
                {
                    "shop_name": f"门店{index}",
                    "reason": "跟进已逾期",
                    "due_date": "2026-09-01",
                }
                for index in range(1, 25)
            ]
            snapshot.payload_json = json.dumps(payload, ensure_ascii=False)
            session.commit()
        response = client.get(created["pptx_url"])

    presentation = Presentation(BytesIO(response.content))
    slide_texts = [
        "\n".join(shape.text for shape in slide.shapes if getattr(shape, "has_text_frame", False))
        for slide in presentation.slides
    ]
    assert len(presentation.slides) > 8
    assert all(
        len([line for line in text.splitlines() if line.strip()]) <= 12 for text in slide_texts[1:]
    )
    joined_text = "\n".join(slide_texts)
    assert "区域对比:" in joined_text
    assert "城市24" in joined_text
    assert "风险清单:" in joined_text
    assert "门店24" in joined_text


def test_pptx_uses_estimated_wrapped_height_for_long_risk_fields(tmp_path):
    """Packing eight 80-character risk fields into one slide must fail readable-height pagination."""
    import json

    from pptx import Presentation
    from pptx.util import Pt

    from app.main import create_app
    from app.models import ReportSnapshot

    app = create_app(database_url=f"sqlite:///{tmp_path / 'report-long-fields.db'}")
    with TestClient(app) as client:
        created = client.post(
            "/api/reports",
            json={"report_name": "长字段风险周报", "period": "2026-09-01/2026-09-07"},
        ).json()
        with app.state.session_factory() as session:
            snapshot = session.get(ReportSnapshot, created["id"])
            payload = json.loads(snapshot.payload_json)
            payload["risks"] = [
                {
                    "shop_name": f"门店{index}-" + "超长名称" * 20 + f"-尾号{index}",
                    "reason": "跟进已逾期",
                    "due_date": "2026-09-01",
                }
                for index in range(1, 9)
            ]
            snapshot.payload_json = json.dumps(payload, ensure_ascii=False)
            session.commit()
        response = client.get(created["pptx_url"])

    presentation = Presentation(BytesIO(response.content))
    risk_slides = [
        slide
        for slide in presentation.slides
        if slide.shapes.title and slide.shapes.title.text.startswith("风险清单:")
    ]
    assert len(risk_slides) >= 4
    assert any("尾号8" in shape.text for slide in risk_slides for shape in slide.shapes if shape.has_text_frame)
    for slide in risk_slides:
        body = slide.placeholders[1].text_frame
        assert body.word_wrap is True
        assert all(
            run.font.size is not None and run.font.size >= Pt(14)
            for paragraph in body.paragraphs
            for run in paragraph.runs
        )


def test_report_snapshot_persists_dashboard_metrics_and_serves_nonempty_pptx_and_pdf(tmp_path):
    """Generating formats from separate data or failing to store their snapshot must break reporting."""
    from app.main import create_app
    from app.models import ReportSnapshot

    app = create_app(database_url=f"sqlite:///{tmp_path / 'reports.db'}")
    with TestClient(app) as client:
        dashboard = client.get("/api/dashboard/executive").json()
        created = client.post(
            "/api/reports",
            json={"report_name": "九月经营周报", "period": "2026-09-01/2026-09-07"},
        )
        assert created.status_code == 201
        body = created.json()
        pptx = client.get(body["pptx_url"])
        pdf = client.get(body["pdf_url"])
        with app.state.session_factory() as session:
            snapshot = session.get(ReportSnapshot, body["id"])

    assert snapshot is not None
    assert body["metrics"] == dashboard["metrics"]
    assert body["period"] == "2026-09-01/2026-09-07"
    assert pptx.status_code == 200
    assert pdf.status_code == 200
    assert len(pptx.content) > 0
    assert len(pdf.content) > 0
    with ZipFile(BytesIO(pptx.content)) as archive:
        slides = "".join(
            archive.read(name).decode("utf-8")
            for name in archive.namelist()
            if name.startswith("ppt/slides/slide") and name.endswith(".xml")
        )
    assert "线索总数: 6" in slides
    assert pdf.content.startswith(b"%PDF")


def test_report_snapshot_uses_the_selected_period_metrics(tmp_path):
    """A report labelled with a period must not silently persist all-time dashboard totals."""
    from app.main import create_app
    from app.models import RepairShopLead

    app = create_app(database_url=f"sqlite:///{tmp_path / 'period-report.db'}")
    with TestClient(app) as client:
        with app.state.session_factory() as session:
            lead = session.get(RepairShopLead, 1)
            today = date.today()
            previous_year = today.year - 1 if today.month == 1 else today.year
            previous_month = 12 if today.month == 1 else today.month - 1
            lead.created_at = datetime(previous_year, previous_month, 15, 9, 0)
            session.commit()
        dashboard = client.get("/api/dashboard/executive", params={"period": "本月"}).json()
        report = client.post("/api/reports", json={"report_name": "本月经营报告", "period": "本月"}).json()

    assert report["metrics"] == dashboard["metrics"]
    assert report["metrics"]["lead_total"] == 5


def test_period_regional_signings_match_the_total_even_when_the_lead_is_older(tmp_path):
    """Regional conversion must count a signing in its signed period, not its lead-creation period."""
    from app.main import create_app
    from app.models import Franchise, RepairShopLead

    app = create_app(database_url=f"sqlite:///{tmp_path / 'regional-period.db'}")
    with TestClient(app) as client:
        with app.state.session_factory() as session:
            today = date.today()
            previous_year = today.year - 1 if today.month == 1 else today.year
            previous_month = 12 if today.month == 1 else today.month - 1
            session.get(RepairShopLead, 1).created_at = datetime(previous_year, previous_month, 15, 9, 0)
            session.get(Franchise, 1).signed_at = date(previous_year, previous_month, 20)
            session.commit()
        dashboard = client.get("/api/dashboard/executive", params={"period": "上月"}).json()

    assert dashboard["metrics"]["franchise_total"] > 0
    assert sum(item["franchise_total"] for item in dashboard["regions"]) == dashboard["metrics"]["franchise_total"]
