import os
import secrets
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .ai_provider import (
    CloudOperationsProvider,
    OpenAICompatibleProvider,
    ProviderError,
    build_operations_outbound_dto,
    derive_operations_intent,
)
from .assistance import (
    AssistanceHistory,
    AssistanceInput,
    KnowledgeEvidence,
    LocalKnowledgeProvider,
    LocalOperationsProvider,
    business_sources,
)
from .assistance_context import build_assistance_context
from .analytics import dashboard_payload
from .auth import (
    CurrentUser,
    check_login_rate,
    get_current_user,
    password_login_enabled,
    require_operator,
    verify_password,
    write_audit,
)
from .database import apply_schema, build_session_factory, session_scope
from .imports import import_file, list_batches, preview_file
from .lifecycle import list_events
from .models import (
    AiDraft,
    FollowUp,
    Franchise,
    KnowledgeDocument,
    Opportunity,
    RepairShopLead,
    ReportSnapshot,
    TrainingRecord,
    User,
)
from . import operations
from .reports import (
    create_report_snapshot,
    load_report_payload,
    render_pdf,
    render_pptx,
    report_payload_with_urls,
)
from .schemas import (
    AssistanceRequest,
    ExecutiveLeadItem,
    KnowledgeDocumentCreate,
    KnowledgeDocumentItem,
    LeadListItem,
    LoginRequest,
    ReportCreate,
)
from .seed import seed_demo_data
from . import workbench
from .privacy import role_view

DEFAULT_DATABASE_URL = "sqlite:///./affiliate_workbench.db"


def status_response(payload: dict, status_code: int) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=payload)


def workbench_result(callback):
    try:
        return callback()
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


def create_app(
    database_url: str | None = None,
    public_api_prefix: str | None = None,
    ai_provider: CloudOperationsProvider | None = None,
) -> FastAPI:
    resolved_database_url = database_url or os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)
    resolved_public_api_prefix = (public_api_prefix or os.getenv("PUBLIC_API_PREFIX", "/api")).rstrip("/")
    cors_origins = [origin.strip() for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",") if origin.strip()]
    engine, session_factory = build_session_factory(resolved_database_url)
    provider = ai_provider or OpenAICompatibleProvider()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        from .studio_models import StudioLock
        apply_schema(engine, resolved_database_url)
        with session_factory() as session:
            if session.get(StudioLock, 1) is None:
                session.add(StudioLock(id=1, revision=0))
                session.commit()
        if os.getenv("SEED_DEMO_DATA", "0") == "1" and os.getenv("AUTH_MODE") == "development":
            with session_factory() as session:
                seed_demo_data(session)
        yield
        close = getattr(provider, "close", None)
        if callable(close):
            close()
        engine.dispose()

    app = FastAPI(title="新能源汽修加盟经营工作台 API", version="0.2.0", lifespan=lifespan)
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.state.ai_provider = provider
    app.state.sessions = {}
    app.state.login_attempts = {}
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def get_session() -> Session:
        yield from session_scope(session_factory)

    def current_user(request: Request, session: Session = Depends(get_session)) -> CurrentUser:
        return get_current_user(request, session)

    def operator_user(user: CurrentUser = Depends(current_user)) -> CurrentUser:
        return require_operator(user)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/api/auth/login")
    def login(payload: LoginRequest, request: Request, session: Session = Depends(get_session)) -> dict:
        if not password_login_enabled():
            raise HTTPException(410, "use the unified workbench login")
        check_login_rate(request)
        user = session.scalar(select(User).where(User.username == payload.username))
        if user is None or not verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid credentials")
        token = secrets.token_urlsafe(32)
        request.app.state.sessions[token] = user.id
        write_audit(session, CurrentUser(id=user.id, username=user.username, display_name=user.display_name, role=user.role), "login")
        return {"token": token, "role": user.role, "username": user.username, "display_name": user.display_name}

    @app.post("/api/auth/logout")
    def logout(request: Request, user: CurrentUser = Depends(current_user), session: Session = Depends(get_session)) -> dict:
        header = request.headers.get("Authorization", "")
        token = header.removeprefix("Bearer ").strip()
        request.app.state.sessions.pop(token, None)
        write_audit(session, user, "logout")
        return {"ok": True}

    @app.get("/api/auth/me")
    def me(user: CurrentUser = Depends(current_user)) -> dict:
        return {"id": user.id, "username": user.username, "display_name": user.display_name, "role": user.role}

    @app.get("/api/leads", response_model=list[LeadListItem])
    def list_leads(session: Session = Depends(get_session), _: CurrentUser = Depends(current_user)) -> list[RepairShopLead]:
        return list(session.scalars(select(RepairShopLead).order_by(RepairShopLead.id)))

    @app.get("/api/leads/{lead_id}")
    def lead_detail(lead_id: int, session: Session = Depends(get_session), user: CurrentUser = Depends(current_user)) -> dict:
        return workbench_result(lambda: operations.get_lead(session, lead_id, include_contacts=user.role != "executive"))

    @app.post("/api/leads")
    def create_lead_record(payload: dict, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        if not payload.get("shop_name"):
            raise HTTPException(status_code=400, detail="shop_name is required")
        return workbench_result(lambda: operations.create_lead(session, payload, user))

    @app.patch("/api/leads/{lead_id}")
    def patch_lead(lead_id: int, payload: dict, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: operations.update_lead(session, lead_id, payload, user))

    @app.post("/api/leads/{lead_id}/follow-ups")
    def create_follow_up(lead_id: int, payload: dict, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: operations.add_follow_up(session, lead_id, payload, user))

    @app.post("/api/follow-ups/{follow_up_id}/complete")
    def complete_follow_up_record(follow_up_id: int, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: operations.complete_follow_up(session, follow_up_id, user))

    @app.get("/api/follow-ups")
    def all_follow_ups(session: Session = Depends(get_session), user: CurrentUser = Depends(current_user)):
        query = select(FollowUp, RepairShopLead.shop_name).join(RepairShopLead, FollowUp.lead_id == RepairShopLead.id).order_by(FollowUp.due_date, FollowUp.id.desc())
        result = []
        for row, shop_name in session.execute(query):
            value = {**operations.serialize_follow_up(row), "shop_name": shop_name}
            if user.role == "executive":
                value.pop("note", None)
            result.append(value)
        return result

    @app.post("/api/leads/{lead_id}/convert")
    def convert_lead_record(lead_id: int, payload: dict | None = None, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: operations.convert_lead(session, lead_id, payload or {}, user))

    @app.post("/api/leads/{lead_id}/archive")
    def archive_lead_record(lead_id: int, payload: dict | None = None, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: operations.archive_lead(session, lead_id, user, (payload or {}).get("reason", "")))

    @app.post("/api/leads/{lead_id}/void")
    def void_lead_record(lead_id: int, payload: dict | None = None, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: operations.void_lead(session, lead_id, user, (payload or {}).get("reason")))

    @app.get("/api/leads/{lead_id}/history")
    def lead_history(lead_id: int, session: Session = Depends(get_session), user: CurrentUser = Depends(current_user)) -> list[dict]:
        return role_view(list_events(session, 'lead', lead_id), user)

    @app.get("/api/executive/leads", response_model=list[ExecutiveLeadItem])
    def list_executive_leads(session: Session = Depends(get_session), _: CurrentUser = Depends(current_user)) -> list[RepairShopLead]:
        return list(session.scalars(select(RepairShopLead).order_by(RepairShopLead.id)))

    @app.get("/api/opportunities")
    def list_opportunities(
        opportunity_type: str | None = None,
        detail: bool = False,
        session: Session = Depends(get_session),
        _: CurrentUser = Depends(current_user),
    ) -> list[dict]:
        if detail or opportunity_type:
            return workbench.list_opportunity_records(session, opportunity_type)
        rows = session.execute(
            select(
                Opportunity.id,
                RepairShopLead.shop_name,
                Opportunity.stage,
                Opportunity.estimated_value,
            )
            .join(RepairShopLead, Opportunity.lead_id == RepairShopLead.id)
            .order_by(Opportunity.id)
        )
        return [
            {
                "id": opportunity_id,
                "shop_name": shop_name,
                "stage": stage,
                "estimated_value": estimated_value or 0,
            }
            for opportunity_id, shop_name, stage, estimated_value in rows
        ]

    @app.post("/api/opportunities")
    def create_opportunity_record(
        payload: dict,
        session: Session = Depends(get_session),
        user: CurrentUser = Depends(operator_user),
    ) -> dict:
        return workbench_result(lambda: workbench.create_opportunity(session, payload, user))

    @app.patch("/api/opportunities/{opportunity_id}")
    def patch_opportunity(
        opportunity_id: int,
        payload: dict,
        session: Session = Depends(get_session),
        user: CurrentUser = Depends(operator_user),
    ) -> dict:
        return workbench_result(lambda: workbench.update_opportunity(session, opportunity_id, payload, user))

    @app.post("/api/opportunities/{opportunity_id}/close")
    def close_opportunity_record(opportunity_id: int, payload: dict | None = None, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: operations.close_opportunity(session, opportunity_id, user, (payload or {}).get("reason")))

    @app.post("/api/opportunities/{opportunity_id}/archive")
    def archive_opportunity_record(opportunity_id: int, payload: dict | None = None, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: operations.archive_opportunity(session, opportunity_id, user, (payload or {}).get("reason", "")))

    @app.post("/api/opportunities/{opportunity_id}/sign")
    def sign_opportunity_record(opportunity_id: int, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: operations.convert_opportunity_to_franchise(session, opportunity_id, user))

    @app.get("/api/opportunities/{opportunity_id}/history")
    def opportunity_history(opportunity_id: int, session: Session = Depends(get_session), user: CurrentUser = Depends(current_user)) -> list[dict]:
        return role_view(list_events(session, 'opportunity', opportunity_id), user)

    @app.get("/api/trainings")
    def list_trainings(session: Session = Depends(get_session), _: CurrentUser = Depends(current_user)) -> list[dict]:
        rows = session.execute(
            select(
                TrainingRecord.id,
                RepairShopLead.shop_name,
                TrainingRecord.training_name,
                TrainingRecord.status,
                TrainingRecord.completed_at,
            )
            .outerjoin(Franchise, TrainingRecord.franchise_id == Franchise.id)
            .outerjoin(RepairShopLead, Franchise.lead_id == RepairShopLead.id)
            .order_by(TrainingRecord.id)
        )
        return [
            {
                "id": training_id,
                "shop_name": shop_name,
                "training_name": training_name,
                "status": status,
                "completed_at": completed_at.isoformat() if completed_at else None,
            }
            for training_id, shop_name, training_name, status, completed_at in rows
        ]

    @app.post("/api/trainings")
    def create_training_record(payload: dict, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        if not payload.get("training_name"):
            raise HTTPException(status_code=400, detail="training_name is required")
        return workbench_result(lambda: operations.create_training(session, payload, user))

    @app.patch("/api/trainings/{training_id}")
    def patch_training(training_id: int, payload: dict, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: operations.update_training(session, training_id, payload, user))

    @app.post("/api/trainings/{training_id}/complete")
    def complete_training_record(training_id: int, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: operations.complete_training(session, training_id, user))

    @app.post("/api/trainings/{training_id}/cancel")
    def cancel_training_record(training_id: int, payload: dict | None = None, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: operations.cancel_training(session, training_id, user, (payload or {}).get("reason")))

    @app.post("/api/trainings/{training_id}/archive")
    def archive_training_record(training_id: int, payload: dict | None = None, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: operations.archive_training(session, training_id, user, (payload or {}).get("reason", "")))

    @app.get("/api/trainings/{training_id}/history")
    def training_history(training_id: int, session: Session = Depends(get_session), user: CurrentUser = Depends(current_user)) -> list[dict]:
        return role_view(list_events(session, 'training', training_id), user)

    @app.post(
        "/api/knowledge-documents",
        response_model=KnowledgeDocumentItem,
        status_code=status.HTTP_201_CREATED,
    )
    def create_knowledge_document(
        payload: KnowledgeDocumentCreate,
        session: Session = Depends(get_session),
        user: CurrentUser = Depends(operator_user),
    ) -> KnowledgeDocument:
        document = KnowledgeDocument(**payload.model_dump())
        session.add(document)
        session.flush()
        from .lifecycle import persist, record_event
        record_event(session, entity_type="knowledge", entity_id=document.id, action="create", user=user, after={"title": document.title, "status": document.status})
        persist(session, user, "knowledge.create", f"document_id={document.id}")
        session.refresh(document)
        return document

    @app.get("/api/knowledge-documents", response_model=list[KnowledgeDocumentItem])
    def list_knowledge_documents(
        q: str | None = None,
        category: str | None = None,
        session: Session = Depends(get_session),
        user: CurrentUser = Depends(current_user),
    ) -> list[KnowledgeDocument]:
        return operations.search_knowledge(session, q, category, published_only=user.role == "executive")

    @app.patch("/api/knowledge-documents/{document_id}", response_model=KnowledgeDocumentItem)
    def patch_knowledge_document(document_id: int, payload: dict, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> KnowledgeDocument:
        return workbench_result(lambda: operations.update_knowledge(session, document_id, payload, user))

    @app.post("/api/knowledge-documents/{document_id}/publish", response_model=KnowledgeDocumentItem)
    def publish_knowledge_document(document_id: int, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> KnowledgeDocument:
        return workbench_result(lambda: operations.publish_knowledge(session, document_id, user))

    @app.post("/api/knowledge-documents/{document_id}/archive", response_model=KnowledgeDocumentItem)
    def archive_knowledge_document(document_id: int, payload: dict | None = None, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> KnowledgeDocument:
        return workbench_result(lambda: operations.archive_knowledge(session, document_id, user, (payload or {}).get("reason", "")))

    @app.post("/api/assistance")
    def assistance(
        payload: AssistanceRequest,
        request: Request,
        session: Session = Depends(get_session),
        user: CurrentUser = Depends(current_user),
    ) -> dict:
        documents = [
            KnowledgeEvidence(
                id=document.id,
                title=document.title,
                category=document.category,
                content=document.content,
            )
            for document in session.scalars(
                select(KnowledgeDocument)
                .where(KnowledgeDocument.status == "published")
                .order_by(KnowledgeDocument.id)
            )
        ]
        draft_modes = {"feedback", "opportunity", "review"}
        draft = None
        if payload.mode in draft_modes:
            result = LocalKnowledgeProvider().answer(
                AssistanceInput(
                    question=payload.question,
                    mode=payload.mode,
                    context={},
                    history=[],
                    documents=documents,
                )
            )
            draft = AiDraft(
                mode=payload.mode,
                source_type="assistance",
                source_id=None,
                raw_input=payload.question,
                draft_json='{"guidance": "%s"}' % result.guidance.replace('"', "'"),
            )
            session.add(draft)
            write_audit(session, user, "assistance", f"mode={payload.mode}", commit=False)
            session.commit()
            session.refresh(draft)
            return {
                "guidance": result.guidance,
                "citations": result.citations[:3],
                "business_sources": result.business_sources,
                "suggested_actions": ["请确认后再写入正式记录"],
                "sufficient_evidence": result.sufficient_evidence,
                "provider": result.provider,
                "fallback_reason": result.fallback_reason,
                "mode": payload.mode,
                "draft_id": draft.id,
                "facts": payload.question[:200],
            }

        context, _ = build_assistance_context(
            session,
            payload.period,
            payload.region.model_dump() if payload.region else None,
            payload.lead_id,
        )
        assistance_request = AssistanceInput(
            question=payload.question,
            mode=payload.mode,
            context=context,
            history=[
                AssistanceHistory(role=item.role, content=item.content) for item in payload.history[-6:]
            ],
            documents=documents,
        )
        if payload.mode == "knowledge":
            result = LocalKnowledgeProvider().answer(assistance_request)
        else:
            try:
                outbound = build_operations_outbound_dto(
                    mode=payload.mode,
                    intent=derive_operations_intent(payload.mode, payload.question),
                    context=context,
                )
                if isinstance(app.state.ai_provider, OpenAICompatibleProvider):
                    cloud_result = app.state.ai_provider.answer(outbound, actor_sub=user.subject, request_id=request.headers.get("X-Request-ID"))
                else:
                    cloud_result = app.state.ai_provider.answer(outbound)
                result = cloud_result.__class__(
                    guidance=cloud_result.guidance,
                    citations=[],
                    sufficient_evidence=cloud_result.sufficient_evidence,
                    suggested_actions=cloud_result.suggested_actions,
                    business_sources=business_sources(*outbound.dataset_names),
                    provider="cloud",
                    fallback_reason=cloud_result.fallback_reason,
                )
            except ProviderError as exc:
                local_result = LocalOperationsProvider().answer(assistance_request)
                result = local_result.__class__(
                    guidance=local_result.guidance,
                    citations=local_result.citations,
                    sufficient_evidence=local_result.sufficient_evidence,
                    suggested_actions=local_result.suggested_actions,
                    business_sources=local_result.business_sources,
                    provider="local",
                    fallback_reason=str(exc),
                )
        return {
            "guidance": result.guidance,
            "citations": result.citations[:3],
            "business_sources": result.business_sources,
            "suggested_actions": result.suggested_actions,
            "sufficient_evidence": result.sufficient_evidence,
            "provider": result.provider,
            "fallback_reason": result.fallback_reason,
        }

    @app.post("/api/reports", status_code=status.HTTP_201_CREATED)
    def create_report(
        payload: ReportCreate,
        session: Session = Depends(get_session),
        _: CurrentUser = Depends(operator_user),
    ) -> dict:
        return report_payload_with_urls(
            create_report_snapshot(session, payload.report_name, payload.period), resolved_public_api_prefix
        )

    @app.get("/api/reports")
    def list_reports(session: Session = Depends(get_session), user: CurrentUser = Depends(current_user)) -> list[dict]:
        query = select(ReportSnapshot).where(ReportSnapshot.voided.is_(False)).order_by(ReportSnapshot.id.desc())
        if user.role == "executive":
            query = query.where(ReportSnapshot.published.is_(True))
        snapshots = list(session.scalars(query))
        return [report_payload_with_urls(snapshot, resolved_public_api_prefix) for snapshot in snapshots]

    @app.post("/api/reports/{report_id}/publish")
    def publish_report(
        report_id: int,
        session: Session = Depends(get_session),
        user: CurrentUser = Depends(operator_user),
    ) -> dict:
        snapshot = session.get(ReportSnapshot, report_id)
        if snapshot is None:
            raise HTTPException(status_code=404, detail="report snapshot not found")
        if snapshot.published:
            raise HTTPException(status_code=400, detail="report already published")
        from datetime import datetime as dt
        snapshot.published = True
        snapshot.published_at = snapshot.published_at or dt.utcnow()
        from .lifecycle import persist, record_event
        record_event(session, entity_type="report", entity_id=snapshot.id, action="publish", user=user, after={"published": True})
        persist(session, user, "report.publish", f"report_id={snapshot.id}")
        workbench.freeze_monthly_snapshot(session, snapshot.period, load_report_payload(snapshot))
        return report_payload_with_urls(snapshot, resolved_public_api_prefix)

    @app.post("/api/reports/{report_id}/void")
    def void_report_record(report_id: int, payload: dict | None = None, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        snapshot = workbench_result(lambda: operations.void_report(session, report_id, user, (payload or {}).get("reason")))
        return report_payload_with_urls(snapshot, resolved_public_api_prefix)

    @app.get("/api/reports/{report_id}.pptx")
    def download_pptx(report_id: int, session: Session = Depends(get_session), user: CurrentUser = Depends(current_user)) -> Response:
        snapshot = session.get(ReportSnapshot, report_id)
        if snapshot is None:
            raise HTTPException(status_code=404, detail="report snapshot not found")
        if user.role == "executive" and (not snapshot.published or snapshot.voided):
            raise HTTPException(status_code=403, detail="unpublished reports are not available")
        return Response(
            render_pptx(load_report_payload(snapshot)),
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            headers={"Content-Disposition": f'attachment; filename="report-{report_id}.pptx"'},
        )

    @app.get("/api/reports/{report_id}.pdf")
    def download_pdf(report_id: int, session: Session = Depends(get_session), user: CurrentUser = Depends(current_user)) -> Response:
        snapshot = session.get(ReportSnapshot, report_id)
        if snapshot is None:
            raise HTTPException(status_code=404, detail="report snapshot not found")
        if user.role == "executive" and (not snapshot.published or snapshot.voided):
            raise HTTPException(status_code=403, detail="unpublished reports are not available")
        return Response(
            render_pdf(load_report_payload(snapshot)),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="report-{report_id}.pdf"'},
        )

    @app.get("/api/dashboard/personal")
    def personal_dashboard(period: str | None = None, session: Session = Depends(get_session), _: CurrentUser = Depends(current_user)) -> dict:
        return dashboard_payload(session, period, executive=False)

    @app.get("/api/dashboard/executive")
    def executive_dashboard(period: str | None = None, session: Session = Depends(get_session), _: CurrentUser = Depends(current_user)) -> dict:
        return dashboard_payload(session, period, executive=True)

    @app.post("/api/imports/upload", response_model=None)
    async def upload_import(
        file: UploadFile = File(...),
        session: Session = Depends(get_session),
        _: CurrentUser = Depends(operator_user),
    ) -> dict | JSONResponse:
        content = await file.read()
        if not file.filename:
            raise HTTPException(status_code=400, detail="filename is required")
        try:
            payload, idempotent = import_file(session, file.filename, content)
        except (UnicodeDecodeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return payload if idempotent else status_response(payload, status.HTTP_201_CREATED)

    @app.post("/api/imports/preview")
    async def preview_import(
        file: UploadFile = File(...),
        session: Session = Depends(get_session),
        _: CurrentUser = Depends(operator_user),
    ) -> dict:
        if not file.filename:
            raise HTTPException(status_code=400, detail="filename is required")
        try:
            return preview_file(session, file.filename, await file.read())
        except (UnicodeDecodeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get("/api/imports/batches")
    def import_batches(session: Session = Depends(get_session), _: CurrentUser = Depends(current_user)) -> list[dict]:
        return list(list_batches(session))

    @app.get("/api/batches")
    def lead_batches(session: Session = Depends(get_session), user: CurrentUser = Depends(current_user)) -> list[dict]:
        return role_view(workbench.list_batches(session), user)

    @app.get("/api/batches/{batch_id}")
    def lead_batch(batch_id: int, session: Session = Depends(get_session), user: CurrentUser = Depends(current_user)) -> dict:
        return role_view(workbench_result(lambda: workbench.get_batch(session, batch_id)), user)

    @app.post("/api/batches/{batch_id}/review")
    def review_lead_batch(batch_id: int, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: workbench.review_batch(session, batch_id, user))

    @app.post("/api/batches/{batch_id}/dispatch")
    def dispatch_lead_batch(batch_id: int, payload: dict, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: workbench.dispatch_batch(session, batch_id, int(payload["franchise_id"]), user))

    @app.post("/api/batches/{batch_id}/feedback")
    def save_batch_feedback(batch_id: int, payload: dict, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: workbench.save_raw_feedback(session, batch_id, payload.get("text", ""), user))

    @app.post("/api/batches/{batch_id}/draft")
    def draft_batch_feedback(batch_id: int, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: workbench.create_feedback_draft(session, batch_id, user))

    @app.post("/api/drafts/{draft_id}/confirm")
    def confirm_draft(draft_id: int, payload: dict | None = None, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: workbench.confirm_feedback_draft(session, draft_id, payload, user))

    @app.post("/api/batches/{batch_id}/quality")
    def set_quality(batch_id: int, payload: dict, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: workbench.set_batch_quality(session, batch_id, payload.get("quality", ""), payload.get("reason"), user))

    @app.post("/api/batches/{batch_id}/archive")
    def archive_lead_batch(batch_id: int, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: workbench.archive_batch(session, batch_id, user))

    @app.get("/api/batches/{batch_id}/history")
    def batch_history(batch_id: int, session: Session = Depends(get_session), user: CurrentUser = Depends(current_user)) -> list[dict]:
        return role_view(list_events(session, 'lead_batch', batch_id), user)

    @app.get("/api/franchises")
    def franchises(session: Session = Depends(get_session), user: CurrentUser = Depends(current_user)) -> list[dict]:
        return role_view(workbench.list_franchises(session), user)

    @app.post("/api/franchises")
    def create_franchise_record(payload: dict, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: operations.create_franchise_record(session, payload, user))

    @app.get("/api/franchises/{franchise_id}")
    def franchise_detail(franchise_id: int, session: Session = Depends(get_session), user: CurrentUser = Depends(current_user)) -> dict:
        franchise = session.get(Franchise, franchise_id)
        if franchise is None:
            raise HTTPException(status_code=404, detail="franchise not found")
        return role_view(workbench.serialize_franchise(session, franchise), user)

    @app.patch("/api/franchises/{franchise_id}")
    def patch_franchise(franchise_id: int, payload: dict, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: operations.update_franchise_record(session, franchise_id, payload, user))

    @app.post("/api/franchises/{franchise_id}/close")
    def close_franchise_record(franchise_id: int, payload: dict | None = None, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: operations.close_franchise(session, franchise_id, user, (payload or {}).get("reason")))

    @app.post("/api/franchises/{franchise_id}/archive")
    def archive_franchise_record(franchise_id: int, payload: dict | None = None, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: operations.archive_franchise(session, franchise_id, user, (payload or {}).get("reason", "")))

    @app.get("/api/franchises/{franchise_id}/history")
    def franchise_history(franchise_id: int, session: Session = Depends(get_session), user: CurrentUser = Depends(current_user)) -> list[dict]:
        return role_view(list_events(session, 'franchise', franchise_id), user)

    @app.post("/api/franchises/{franchise_id}/territories")
    def add_franchise_territory(franchise_id: int, payload: dict, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: workbench.add_territory(session, franchise_id, payload, user))

    @app.patch("/api/delivery-items/{item_id}")
    def patch_delivery_item(item_id: int, payload: dict, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: workbench.update_delivery_item(session, item_id, payload, user))

    @app.post("/api/support-records/{record_id}/complete")
    def complete_support(record_id: int, payload: dict | None = None, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        notes = (payload or {}).get("notes")
        return workbench_result(lambda: workbench.complete_support_record(session, record_id, notes, user))

    @app.get("/api/actions")
    def actions(include_done: bool = False, session: Session = Depends(get_session), user: CurrentUser = Depends(current_user)) -> list[dict]:
        return workbench.list_actions(session, include_done=include_done, refresh=user.role != "executive")

    @app.post("/api/actions/{action_id}/complete")
    def complete_action_item(action_id: int, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: workbench.complete_action(session, action_id, user))

    @app.patch("/api/goals/{period}")
    def patch_goals(period: str, payload: dict, session: Session = Depends(get_session), user: CurrentUser = Depends(operator_user)) -> dict:
        return workbench_result(lambda: operations.update_goals(session, period, payload, user))

    @app.get("/api/notifications")
    def notifications(session: Session = Depends(get_session), user: CurrentUser = Depends(current_user)) -> list[dict]:
        return operations.list_notifications(session, user)

    @app.post("/api/notifications/{notification_id}/read")
    def read_notification(notification_id: int, session: Session = Depends(get_session), user: CurrentUser = Depends(current_user)) -> dict:
        return workbench_result(lambda: operations.mark_notification_read(session, notification_id, user))

    @app.post("/api/notifications/read-all")
    def read_all_notifications(session: Session = Depends(get_session), user: CurrentUser = Depends(current_user)) -> dict:
        return operations.mark_all_read(session, user)

    @app.post("/api/notifications/{notification_id}/archive")
    def archive_notification_record(notification_id: int, session: Session = Depends(get_session), user: CurrentUser = Depends(current_user)) -> dict:
        return workbench_result(lambda: operations.archive_notification(session, notification_id, user))

    @app.get("/api/settings")
    def get_settings(session: Session = Depends(get_session), user: CurrentUser = Depends(current_user)) -> dict:
        return operations.serialize_preference(operations.get_or_create_preference(session, user))

    @app.patch("/api/settings")
    def patch_settings(payload: dict, session: Session = Depends(get_session), user: CurrentUser = Depends(current_user)) -> dict:
        return operations.update_preference(session, user, payload)

    @app.get("/api/entities/{entity_type}/{entity_id}/history")
    def entity_history(entity_type: str, entity_id: int, session: Session = Depends(get_session), user: CurrentUser = Depends(current_user)) -> list[dict]:
        return role_view(list_events(session, entity_type, entity_id), user)

    @app.get("/api/map/overview")
    def map_overview(session: Session = Depends(get_session), _: CurrentUser = Depends(current_user)) -> list[dict]:
        return workbench.map_overview(session)

    @app.get("/api/map/city")
    def map_city(province: str, city: str, session: Session = Depends(get_session), user: CurrentUser = Depends(current_user)) -> dict:
        detail = workbench.city_detail(session, province, city)
        if user.role == "executive":
            for lead in detail["leads"]:
                lead.pop("phone", None)
                lead.pop("wechat", None)
        return detail

    @app.get("/api/snapshots")
    def list_snapshots(session: Session = Depends(get_session), _: CurrentUser = Depends(current_user)) -> list[dict]:
        from .models import MonthlySnapshot
        rows = session.scalars(select(MonthlySnapshot).order_by(MonthlySnapshot.id.desc()))
        return [{"id": row.id, "period": row.period, "version": row.version, "frozen_at": row.frozen_at.isoformat()} for row in rows]

    @app.get("/api/snapshots/{snapshot_id}")
    def snapshot_detail(snapshot_id: int, session: Session = Depends(get_session), _: CurrentUser = Depends(current_user)) -> dict:
        return workbench_result(lambda: workbench.get_monthly_snapshot(session, snapshot_id))

    @app.post("/api/snapshots")
    def freeze_snapshot(payload: dict, session: Session = Depends(get_session), _: CurrentUser = Depends(operator_user)) -> dict:
        period = payload.get("period") or "本月"
        return workbench.freeze_monthly_snapshot(session, period, dashboard_payload(session, period))

    from . import studio, studio_ai, industry, integration
    studio.install(app, get_session, current_user, operator_user)
    studio_ai.install(app, get_session, current_user, operator_user)
    industry.install(app, get_session, current_user, operator_user)
    integration.install(app, get_session, current_user, operator_user)
    return app


app = create_app()
