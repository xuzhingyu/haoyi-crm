"""One budget ledger for research and the existing CRM; no caller-selected upstreams."""
from __future__ import annotations

import hashlib
import json
import re
from datetime import UTC, datetime, timedelta
from decimal import ROUND_UP, Decimal
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from lead_core.config import Settings
from lead_core.db import apply_rls_context
from lead_core.intelligence.models import AiJob, BudgetDay, ModelCall, Research


class GatewayError(ValueError):
    def __init__(self, message: str, status_code: int = 409):
        super().__init__(message)
        self.status_code = status_code


def local_day() -> str:
    return datetime.now(ZoneInfo("Asia/Shanghai")).date().isoformat()


def ensure_budget_day(session: Session, day: str) -> BudgetDay:
    if session.get_bind().dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    session.execute(insert(BudgetDay).values(day=day, spent=0, reserved=0).on_conflict_do_nothing(index_elements=["day"]))
    return session.get(BudgetDay, day)


def budget_read(session: Session, settings: Settings) -> dict:
    row = session.get(BudgetDay, local_day())
    spent, reserved = (float(row.spent), float(row.reserved)) if row else (0, 0)
    return {"daily_limit": settings.ai_daily_budget_cny, "spent": spent, "reserved": reserved,
            "remaining": max(0, settings.ai_daily_budget_cny - spent - reserved), "currency": "CNY"}


def scrub_legacy_messages(messages: list[dict]) -> list[dict]:
    """Defence in depth; the CRM adapter must first project an allowlisted summary DTO."""
    safe = []
    for message in messages:
        text = message.get("content", "")
        if not isinstance(text, str) or message.get("role") not in {"system", "user", "assistant"}:
            raise GatewayError("只接受文本摘要", 422)
        text = re.sub(r"(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)", "[电话已隐去]", text)
        text = re.sub(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", "[邮箱已隐去]", text)
        text = re.sub(r"(?<!\d)\d{17}[\dXx](?!\d)", "[证件已隐去]", text)
        text = re.sub(r"(?<!\d)\d{16,19}(?!\d)", "[账号已隐去]", text)
        safe.append({"role": message["role"], "content": text})
    return safe


def get_job(session: Session, *, request_id: str, actor_sub: str, purpose: str,
            source_system: str, source_id: str | None, messages: list,
            max_tokens: int, research_id: str | None = None, response_format: dict | None = None) -> AiJob:
    encoded = json.dumps({"messages": messages, "max_tokens": max_tokens, "response_format": response_format,
                          "actor": actor_sub, "purpose": purpose, "source": source_system, "id": source_id},
                         ensure_ascii=False, sort_keys=True).encode()
    if len(encoded) > 120_000:
        raise GatewayError("摘要超过本次分析长度上限", 422)
    digest = hashlib.sha256(encoded).hexdigest()
    if session.get_bind().dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    session.execute(insert(AiJob).values(request_id=request_id, input_hash=digest,
                    actor_sub=actor_sub, purpose=purpose, source_system=source_system,
                    source_id=source_id, research_id=research_id, status="queued", cost_cny=0)
                    .on_conflict_do_nothing(index_elements=["request_id"]))
    job = session.scalar(select(AiJob).where(AiJob.request_id == request_id))
    if job.input_hash != digest:
        raise GatewayError("请求编号已用于不同内容，请重新发起")
    session.commit()
    apply_rls_context(session, is_worker=True)
    return job


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def reserve_job_call(session: Session, settings: Settings, job: AiJob, messages: list, max_tokens: int) -> ModelCall:
    if not settings.llm_api_key:
        raise GatewayError("模型尚未配置", 503)
    if settings.llm_input_cny_per_million <= 0 or settings.llm_output_cny_per_million <= 0:
        raise GatewayError("模型计费单价尚未核对，已暂停调用", 503)
    if not 1 <= max_tokens <= 4096:
        raise GatewayError("输出长度超出限制", 422)
    day = local_day()
    ensure_budget_day(session, day)
    # This lock serializes both job claims and budget reservations across all consumers.
    session.scalar(select(BudgetDay).where(BudgetDay.day == day).with_for_update())
    session.refresh(job, with_for_update=True)
    if job.status == "completed":
        raise GatewayError("请求已完成，请读取原结果")
    if job.status == "failed":
        raise GatewayError("此前请求未完成；重新发起时使用新的请求编号")
    now = datetime.now(UTC)
    active = session.scalars(select(AiJob).where(AiJob.status == "running")).all()
    live = []
    for item in active:
        if item.started_at and _aware(item.started_at) + timedelta(minutes=settings.ai_task_timeout_minutes) <= now:
            item.status, item.error, item.finished_at = "failed", "任务超时；未知用量保留预留", now
        else:
            live.append(item)
    if any(item.id == job.id for item in live):
        raise GatewayError("相同请求正在处理，请稍后读取结果", 429)
    if len(live) >= settings.ai_max_concurrent_tasks:
        raise GatewayError("AI 正在处理其他任务，请稍后重试", 429)
    calls = session.scalar(select(func.count()).select_from(ModelCall).where(ModelCall.ai_job_id == job.id))
    if calls >= settings.ai_max_rounds:
        raise GatewayError("已达到单任务调用轮数上限", 402)
    input_bound = len(json.dumps(messages, ensure_ascii=False).encode("utf-8")) + 2048
    amount = ((Decimal(input_bound) * Decimal(str(settings.llm_input_cny_per_million)) + Decimal(max_tokens)
              * Decimal(str(settings.llm_output_cny_per_million))) / Decimal(1_000_000)).quantize(Decimal("0.000001"), rounding=ROUND_UP)
    previous = session.scalar(select(func.coalesce(func.sum(ModelCall.reserved), 0)).where(ModelCall.ai_job_id == job.id))
    if Decimal(previous) + amount > Decimal(str(settings.ai_task_budget_cny)):
        raise GatewayError("单任务预算不足，未发起模型调用", 402)
    changed = session.execute(update(BudgetDay).where(BudgetDay.day == day,
        BudgetDay.spent + BudgetDay.reserved + amount <= Decimal(str(settings.ai_daily_budget_cny)))
        .values(reserved=BudgetDay.reserved + amount))
    if changed.rowcount != 1:
        raise GatewayError("今日 AI 额度不足，已暂停新的调用", 402)
    job.status, job.started_at, job.error = "running", now, None
    call = ModelCall(day=day, ai_job_id=job.id, research_id=job.research_id, reserved=amount)
    session.add(call)
    session.commit()
    apply_rls_context(session, is_worker=True)
    return call


def settle_call(session: Session, settings: Settings, call: ModelCall, usage: dict | None) -> Decimal | None:
    session.refresh(call, with_for_update=True)
    if call.status != "reserved":
        return call.cost
    valid = isinstance(usage, dict) and all(type(usage.get(k)) is int and usage[k] >= 0 for k in ("prompt_tokens", "completion_tokens"))
    if not valid:
        call.status = "usage_unknown"
        session.commit()
        apply_rls_context(session, is_worker=True)
        return None
    cost = ((Decimal(usage["prompt_tokens"]) * Decimal(str(settings.llm_input_cny_per_million)) + Decimal(usage["completion_tokens"])
             * Decimal(str(settings.llm_output_cny_per_million))) / Decimal(1_000_000)).quantize(Decimal("0.000001"), rounding=ROUND_UP)
    call.input_tokens, call.output_tokens = usage["prompt_tokens"], usage["completion_tokens"]
    call.cost, call.status = cost, "settled"
    session.execute(update(BudgetDay).where(BudgetDay.day == call.day).values(reserved=BudgetDay.reserved - call.reserved, spent=BudgetDay.spent + cost))
    if call.research_id:
        session.execute(update(Research).where(Research.id == call.research_id).values(cost_cny=Research.cost_cny + cost))
    if call.ai_job_id:
        session.execute(update(AiJob).where(AiJob.id == call.ai_job_id).values(cost_cny=AiJob.cost_cny + cost))
    session.commit()
    apply_rls_context(session, is_worker=True)
    return cost


def reserve_call(session: Session, settings: Settings, research: Research, messages: list, max_tokens: int) -> ModelCall:
    """Compatibility for existing callers/tests; now all reservations use a generic job."""
    job = get_job(session, request_id="research:" + research.id, actor_sub=research.created_by,
                  purpose="research", source_system="workspace", source_id=research.id,
                  research_id=research.id, messages=messages, max_tokens=max_tokens)
    return reserve_job_call(session, settings, job, messages, max_tokens)


def complete(session: Session, settings: Settings, *, request_id: str, actor_sub: str,
             purpose: str, source_system: str, source_id: str | None, messages: list,
             max_tokens: int = 4096, research_id: str | None = None, response_format: dict | None = None) -> dict:
    if response_format is not None and response_format != {"type": "json_object"}:
        raise GatewayError("不支持的输出格式", 422)
    if source_system == "legacy_crm":
        messages = scrub_legacy_messages(messages)
    job = get_job(session, request_id=request_id, actor_sub=actor_sub, purpose=purpose,
                  source_system=source_system, source_id=source_id, messages=messages,
                  max_tokens=max_tokens, research_id=research_id, response_format=response_format)
    if job.status == "completed" and job.response:
        return {**job.response, "haoyi": {"job_id": job.id, "cost_cny": float(job.cost_cny), "replayed": True}}
    call = reserve_job_call(session, settings, job, messages, max_tokens)
    body = {"model": settings.llm_model, "messages": messages, "max_tokens": max_tokens,
            "temperature": 0.2, "stream": False, "thinking": {"type": "disabled"}}
    if response_format:
        body["response_format"] = response_format
    try:
        response = httpx.post(settings.llm_base_url.rstrip("/") + "/chat/completions",
            headers={"Authorization": "Bearer " + settings.llm_api_key}, json=body, timeout=180)
        response.raise_for_status()
        payload = response.json()
        settle_call(session, settings, call, payload.get("usage"))
        content = payload["choices"][0]["message"]["content"]
        if not isinstance(content, str) or not content.strip():
            raise ValueError("empty output")
        safe = {"choices": [{"message": {"role": "assistant", "content": content}}], "usage": payload.get("usage")}
        session.refresh(job, with_for_update=True)
        job.status, job.response, job.finished_at = "completed", safe, datetime.now(UTC)
        session.commit()
        apply_rls_context(session, is_worker=True)
        return {**safe, "haoyi": {"job_id": job.id, "cost_cny": float(job.cost_cny), "replayed": False}}
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as exc:
        session.rollback()
        apply_rls_context(session, is_worker=True)
        fresh_call = session.get(ModelCall, call.id)
        if fresh_call.status == "reserved":
            settle_call(session, settings, fresh_call, None)
        session.refresh(job)
        job.status, job.error, job.finished_at = "failed", "模型服务未完成，未知用量继续保留预算", datetime.now(UTC)
        session.commit()
        apply_rls_context(session, is_worker=True)
        raise GatewayError("模型服务未完成，请稍后重新发起；未知用量已保留预留", 502) from exc
