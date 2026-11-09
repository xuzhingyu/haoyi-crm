"""Strictly separate local private-input and public-news model channels."""
import json
from datetime import datetime

from fastapi import APIRouter, Depends, Request
from pydantic import Field
from sqlalchemy.orm import Session

from . import ai_gateway
from .models import AiDraft
from .studio import (
    Input,
    Mutation,
    Note,
    add,
    fail,
    get_record,
    lock,
    records,
    serialize,
)
from .studio_models import ModelUsage


class DraftRequest(Input):
    text: str = Field(min_length=1, max_length=12000)
    mode: str = Field(default="note", pattern="^(note|preparation|delivery|report)$")
    party_id: int | None = None


def configured(channel):
    return channel == "LOCAL" and ai_gateway.configured()


def model_call(session, channel, system, content, *, actor_sub=None, request_id=None):
    # Raw private text and public article bodies are never forwarded by this path.
    if channel != "LOCAL":
        fail("资讯分析已统一至行业情报工作台", 503)
    try:
        value = json.loads(content)
        if set(value) != {"mode", "metrics"} or value["mode"] not in {"note", "preparation", "delivery", "report"}:
            raise ValueError()
        if set(value["metrics"]) != {"parties", "contracts", "notes", "completed_enrollments"}:
            raise ValueError()
        if any(type(v) is not int or v < 0 for v in value["metrics"].values()):
            raise ValueError()
    except (ValueError, TypeError, KeyError):
        fail("只允许提交固定字段的业务汇总，原文保留在本地", 422)
    usage = ModelUsage(channel="SHARED_GATEWAY", status="pending")
    session.add(usage)
    session.commit()
    try:
        response = ai_gateway.chat(purpose="studio_" + value["mode"], actor_sub=actor_sub,
            call_id=request_id, messages=[{"role": "system", "content": system}, {"role": "user", "content": json.dumps(value)}])
        result = json.loads(response["choices"][0]["message"]["content"])
        if not isinstance(result, dict):
            raise ValueError()
        usage.status = "success"
        session.commit()
        return result
    except ai_gateway.GatewayError as exc:
        usage.status = "failed"
        session.commit()
        fail(str(exc), 503)
    except (KeyError, IndexError, TypeError, ValueError):
        usage.status = "failed"
        session.commit()
        fail("AI未返回有效草稿，请人工整理；原文已保留在浏览器", 503)



def install(app, get_session, current_user, operator_user):
    router = APIRouter(prefix="/api/studio/ai")

    @router.get("/status")
    def status(user=Depends(operator_user)):
        return {"local_configured": configured("LOCAL"), "news_configured": configured("NEWS")}

    @router.post("/drafts")
    def draft(body: DraftRequest, request: Request, session: Session = Depends(get_session), user=Depends(operator_user)):
        if body.party_id:
            get_record(session, body.party_id, "party", user.id)
        metrics = {"parties": len(records(session, "party", user.id)),
            "contracts": len(records(session, "contract", user.id)),
            "notes": len(records(session, "note", user.id)),
            "completed_enrollments": len([x for x in records(session, "enrollment", user.id) if x["status"] == "已完成"])}
        system = "你是经营汇总助手，只会收到固定类型与数量统计，不会收到用户原文。不得声称已阅读会谈或客户资料。输出JSON：summary（明确以经营汇总开头，只陈述给定统计），concern（统计无法回答的问题），next_action（建议，不能写成已发生），due_date=null，result=''，evidence='经营台账数量汇总'。不得编造协议、金额、客户或日期。"
        result = model_call(session, "LOCAL", system, json.dumps({"mode": body.mode, "metrics": metrics}),
            actor_sub=user.subject, request_id=request.headers.get("X-Request-ID"))
        try:
            note = Note.model_validate({k: v for k, v in result.items() if k in ("summary", "concern", "next_action", "due_date", "result", "evidence")})
        except Exception:
            fail("AI结果字段不完整，请人工整理或重试", 422)
        data = {**note.model_dump(mode="json"), "party_id": body.party_id}
        row = AiDraft(mode="studio_" + body.mode, source_type=f"studio_owner:{user.id}", source_id=body.party_id, raw_input=body.text, draft_json=json.dumps(data, ensure_ascii=False))
        session.add(row)
        session.commit()
        return {"id": row.id, "data": data, "confirmed": False, "analysis_scope": "aggregate_only", "notice": "AI仅使用经营数量汇总；原文和客户资料未发送，沟通事实请人工补充。"}

    @router.post("/drafts/{draft_id}/confirm")
    def confirm(draft_id: int, body: Mutation, session: Session = Depends(get_session), user=Depends(operator_user)):
        lock(session)
        row = session.get(AiDraft, draft_id)
        if not row or row.source_type != f"studio_owner:{user.id}":
            fail("草稿不存在", 404)
        result = add(session, "note", body.data, user, f"ai-confirm:{draft_id}")
        row.confirmed_at = row.confirmed_at or datetime.utcnow()
        session.commit()
        return serialize(result)

    app.include_router(router)
