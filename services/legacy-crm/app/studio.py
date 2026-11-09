"""Personal operating ledger: explicit schemas, atomic mutations and evidence links."""
import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal, Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .auth import write_audit
from .models import ActionItem, AiDraft, RepairShopLead, Franchise, Opportunity
from .studio_models import StudioRecord, StudioLock, NewsJob

Money = Annotated[Decimal, Field(ge=0, max_digits=14, decimal_places=2)]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, validate_default=True)


class Party(Input):
    name: str = Field(min_length=1, max_length=200)
    category: Literal["机构", "合作公司", "加盟店", "自营店", "培训中心", "联系人", "待补充"] = "待补充"
    province: str = Field(default="", max_length=50)
    city: str = Field(default="", max_length=50)
    contact: str = Field(default="", max_length=100)
    phone: str = Field(default="", max_length=60)
    origin: Literal["总部直联", "机构拓展", "待补充"] = "待补充"
    status: Literal["跟进中", "合作中", "已暂停"] = "跟进中"
    legacy_type: Literal["", "lead", "franchise"] = ""
    legacy_id: int | None = None
    notes: str = Field(default="", max_length=10000)


class Relationship(Input):
    from_id: int
    to_id: int
    relationship: Literal["引荐", "招商", "签约", "运营", "服务区域", "合资", "联系人"]
    region: str = Field(default="", max_length=100)
    headquarters_share: Decimal | None = Field(default=None, ge=0, le=100)
    partner_share: Decimal | None = Field(default=None, ge=0, le=100)
    distribution: str = Field(default="待明确", max_length=4000)
    agreement: str = Field(default="", max_length=4000)

    @model_validator(mode="after")
    def shares(self):
        if self.from_id == self.to_id:
            raise ValueError("不能关联自身")
        if (self.headquarters_share is None) != (self.partner_share is None):
            raise ValueError("股权比例需同时填写或同时留空")
        if self.headquarters_share is not None and self.headquarters_share + self.partner_share != 100:
            raise ValueError("双方股权比例之和必须为100")
        return self


class Contract(Input):
    party_id: int
    name: str = Field(min_length=1, max_length=200)
    fee: Money = Field(default=Decimal("26800"))
    free_seats: int = Field(default=2, ge=0, le=10000)
    training_price: Money = Field(default=Decimal("6800"))
    promise: Money = Field(default=Decimal("60000"))
    basis: Literal["待明确", "派单", "完工", "结算", "到账"] = "待明确"
    due_date: date | None = None
    signed_on: date
    evidence: str = Field(default="", max_length=4000)


class Payment(Input):
    contract_id: int
    category: Literal["加盟费", "培训费"] = "加盟费"
    direction: Literal["收款", "退款"] = "收款"
    amount: Money = Field(gt=0)
    paid_on: date
    evidence: str = Field(min_length=1, max_length=4000)


class Enrollment(Input):
    contract_id: int
    name: str = Field(min_length=1, max_length=100)
    center_id: int | None = None
    category: Literal["赠送", "额外"] = "赠送"
    status: Literal["已报名", "已完成", "已取消"] = "已报名"
    scheduled_on: date | None = None
    completed_on: date | None = None
    price: Money | None = Field(default=None)


class Repair(Input):
    contract_id: int
    name: str = Field(min_length=1, max_length=200)
    source: Literal["全损车", "保险合作", "其他"] = "全损车"
    insurance_id: int | None = None
    dispatched: Money = Field(default=Decimal("0"))
    completed: Money = Field(default=Decimal("0"))
    settled: Money = Field(default=Decimal("0"))
    received: Money = Field(default=Decimal("0"))
    dispatched_on: date | None = None
    completed_on: date | None = None
    settled_on: date | None = None
    received_on: date | None = None
    status: Literal["进行中", "已完成", "已撤销"] = "进行中"
    evidence: str = Field(default="", max_length=4000)
    reason: str = Field(default="", max_length=2000)


class Insurance(Input):
    party_id: int
    name: str = Field(min_length=1, max_length=200)
    region: str = Field(default="", max_length=100)
    status: Literal["接洽", "协商", "已合作", "已暂停"] = "接洽"
    terms: str = Field(default="待明确", max_length=4000)
    discount_terms: str = Field(default="待明确", max_length=2000)
    store_ids: list[int] = Field(default_factory=list, max_length=100)


class Note(Input):
    party_id: int | None = None
    source_type: Literal["", "lead", "opportunity", "franchise", "contract", "repair", "article"] = ""
    source_id: int | None = None
    summary: str = Field(min_length=1, max_length=10000)
    concern: str = Field(default="", max_length=4000)
    next_action: str = Field(default="", max_length=200)
    due_date: date | None = None
    role: str = Field(default="运营协调", max_length=100)
    result: str = Field(default="", max_length=4000)
    evidence: str = Field(default="", max_length=4000)
    action_id: int | None = None


class Report(Input):
    name: str = Field(min_length=1, max_length=200)
    start: date
    end: date
    content: str = Field(default="", max_length=50000)
    status: Literal["草稿", "已发布"] = "草稿"
    evidence_ids: list[int] = Field(default_factory=list, max_length=1000)
    metrics: dict = Field(default_factory=dict)


SCHEMAS = {"party": Party, "relationship": Relationship, "contract": Contract, "payment": Payment,
           "enrollment": Enrollment, "repair": Repair, "insurance": Insurance, "note": Note, "report": Report}


class Mutation(Input):
    request_key: str = Field(min_length=8, max_length=100)
    data: dict
    version: int | None = None


class ActionInput(Input):
    title: str = Field(min_length=1, max_length=200)
    detail: str = Field(default="", max_length=4000)
    due_date: date | None = None
    source_type: str = Field(default="", max_length=40)
    source_id: int | None = None
    status: Literal["待处理", "已完成", "已取消"] = "待处理"
    result: str = Field(default="", max_length=4000)
    reason: str = Field(default="", max_length=1000)


def fail(message, status=400):
    raise HTTPException(status, message)


def parse(kind, data):
    schema = SCHEMAS.get(kind)
    if not schema:
        fail("不支持的记录类型", 404)
    try:
        return schema.model_validate(data).model_dump(mode="json")
    except ValidationError as exc:
        fail("；".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors()), 422)


def validated(schema, data):
    try:
        return schema.model_validate(data)
    except ValidationError as exc:
        fail("；".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors()), 422)


def serialize(row):
    return {"id": row.id, "kind": row.kind, "version": row.version, "created_at": row.created_at.replace(tzinfo=timezone.utc).isoformat(),
            "updated_at": row.updated_at.replace(tzinfo=timezone.utc).isoformat(), **json.loads(row.payload)}


def records(session, kind, owner=None):
    query = select(StudioRecord).where(StudioRecord.kind == kind).order_by(StudioRecord.id.desc())
    if owner is not None:
        query = query.where(StudioRecord.owner_id == owner)
    return [serialize(row) for row in session.scalars(query)]


def lock(session):
    # Serializes seat allocation, draft confirmation and ledger changes across API workers.
    session.execute(update(StudioLock).where(StudioLock.id == 1).values(revision=StudioLock.revision + 1))


def get_record(session, record_id, kind, owner):
    row = session.get(StudioRecord, record_id)
    if not row or row.kind != kind or row.owner_id != owner:
        fail("关联记录不存在或无权访问", 404)
    return row


def contract_totals(session, contract_id, owner):
    contract = serialize(get_record(session, contract_id, "contract", owner))
    payments = [x for x in records(session, "payment", owner) if x["contract_id"] == contract_id]
    enrollments = [x for x in records(session, "enrollment", owner) if x["contract_id"] == contract_id and x["status"] != "已取消"]
    repairs = [x for x in records(session, "repair", owner) if x["contract_id"] == contract_id and x["status"] != "已撤销"]
    totals = {field: str(sum((Decimal(str(x[field])) for x in repairs), Decimal(0))) for field in ("dispatched", "completed", "settled", "received")}
    for category, field in (("加盟费", "franchise_paid"), ("培训费", "training_paid")):
        totals[field] = str(sum((Decimal(x["amount"]) * (-1 if x["direction"] == "退款" else 1) for x in payments if x["category"] == category), Decimal(0)))
    totals["training_due"] = str(sum((Decimal(x["price"] or "0") for x in enrollments), Decimal(0)))
    totals["seats_used"] = sum(x["category"] == "赠送" for x in enrollments)
    totals["seats_remaining"] = contract["free_seats"] - totals["seats_used"]
    basis_field = {"派单": "dispatched", "完工": "completed", "结算": "settled", "到账": "received"}.get(contract["basis"])
    totals["fulfillment"] = "待明确" if not basis_field else ("已兑现" if Decimal(totals[basis_field]) >= Decimal(contract["promise"]) else "进行中")
    totals["overdue"] = bool(basis_field and contract["due_date"] and contract["due_date"] < date.today().isoformat() and totals["fulfillment"] != "已兑现")
    return totals


def validate_links(session, kind, data, owner, row_id=None):
    for key, target in (("party_id", "party"), ("center_id", "party"), ("contract_id", "contract"), ("from_id", "party"), ("to_id", "party"), ("insurance_id", "insurance")):
        if data.get(key):
            get_record(session, data[key], target, owner)
    for store in data.get("store_ids", []):
        get_record(session, store, "party", owner)
    if kind == "party" and data.get("legacy_id"):
        model = {"lead": RepairShopLead, "franchise": Franchise}.get(data["legacy_type"])
        if not model or not session.get(model, data["legacy_id"]):
            fail("原业务记录不存在")
        if any(x["id"] != row_id and x.get("legacy_type") == data["legacy_type"] and x.get("legacy_id") == data["legacy_id"] for x in records(session, "party", owner)):
            fail("该原业务记录已经关联主体", 409)
    if kind == "note":
        source = data.get("source_type")
        source_id = data.get("source_id")
        if bool(source) != bool(source_id):
            fail("来源类型和编号需同时填写")
        if source in ("lead", "opportunity", "franchise") and not session.get({"lead": RepairShopLead, "opportunity": Opportunity, "franchise": Franchise}[source], source_id):
            fail("来源业务不存在")
        if source in ("contract", "repair", "article"):
            get_record(session, source_id, source, owner)
    if kind == "enrollment":
        c = serialize(get_record(session, data["contract_id"], "contract", owner))
        if data["price"] is None:
            data["price"] = "0" if data["category"] == "赠送" else c["training_price"]
        if data["category"] == "赠送":
            data["price"] = "0"
            used = sum(x["id"] != row_id and x["contract_id"] == data["contract_id"] and x["category"] == "赠送" and x["status"] != "已取消" for x in records(session, kind, owner))
            if data["status"] != "已取消" and used >= c["free_seats"]:
                fail("赠送培训名额已用完，请改为额外报名")
        if data["status"] == "已完成" and not data["completed_on"]:
            fail("完成培训需填写完成日期")
        if data.get("center_id") and serialize(get_record(session, data["center_id"], "party", owner))["category"] != "培训中心":
            fail("培训地点必须关联培训中心")
    if kind == "contract" and row_id:
        used = sum(x["contract_id"] == row_id and x["category"] == "赠送" and x["status"] != "已取消" for x in records(session, "enrollment", owner))
        if data["free_seats"] < used:
            fail("名额不能少于已使用数量")
    if kind == "payment" and data["direction"] == "退款":
        paid = sum((Decimal(x["amount"]) * (-1 if x["direction"] == "退款" else 1) for x in records(session, kind, owner) if x["contract_id"] == data["contract_id"] and x["category"] == data["category"]), Decimal(0))
        if Decimal(data["amount"]) > paid:
            fail("退款不能超过该类费用的净收款")
    if kind == "repair":
        if data["status"] == "已撤销" and not data["reason"]:
            fail("撤销维修需填写原因")
        for field in ("dispatched", "completed", "settled", "received"):
            if Decimal(data[field]) and (not data[field + "_on"] or not data["evidence"]):
                fail("填写维修金额时需提供对应日期及依据")


def add(session, kind, data, user, key):
    existing = session.scalar(select(StudioRecord).where(StudioRecord.owner_id == user.id, StudioRecord.request_key == key))
    if existing:
        if existing.kind != kind:
            fail("请求编号已用于其他操作", 409)
        return existing
    validated = parse(kind, data)
    validate_links(session, kind, validated, user.id)
    row = StudioRecord(kind=kind, owner_id=user.id, request_key=key, payload=json.dumps(validated, ensure_ascii=False))
    session.add(row)
    session.flush()
    if kind == "note" and validated["next_action"]:
        action = ActionItem(kind="studio", title=validated["next_action"], detail=validated["concern"], due_date=date.fromisoformat(validated["due_date"]) if validated["due_date"] else None, source_type="studio_note", source_id=row.id)
        session.add(action)
        session.flush()
        validated["action_id"] = action.id
        row.payload = json.dumps(validated, ensure_ascii=False)
    write_audit(session, user, "studio.create", f"{kind}:{row.id}", commit=False)
    return row


def report_data(session, owner, start, end):
    if end < start:
        fail("结束日期不能早于开始日期")
    notes = [x for x in records(session, "note", owner) if start <= datetime.fromisoformat(x["created_at"]).astimezone(timezone(timedelta(hours=8))).date() <= end]
    contracts = [x for x in records(session, "contract", owner) if start.isoformat() <= x["signed_on"] <= end.isoformat()]
    payments = [x for x in records(session, "payment", owner) if start.isoformat() <= x["paid_on"] <= end.isoformat()]
    training = [x for x in records(session, "enrollment", owner) if x["status"] == "已完成" and x["completed_on"] and start.isoformat() <= x["completed_on"] <= end.isoformat()]
    metrics = {"signed": len(contracts), "net_receipts": str(sum((Decimal(x["amount"]) * (-1 if x["direction"] == "退款" else 1) for x in payments), Decimal(0))), "training_completed": len(training)}
    lines = [f"{start} 至 {end} 经营复盘", f"新增合同 {metrics['signed']}；净收款 {metrics['net_receipts']} 元；完成培训 {metrics['training_completed']} 人。", "\n我的推动（记录事实，协作成果不重复归属）："]
    for n in notes:
        lines.append(f"- [{n['role']}] {n['summary']}；结果：{n['result'] or '待补充'}；下一步：{n['next_action'] or '待补充'}（记录 #{n['id']}）")
    articles = [x for x in records(session, "article", owner) if x.get("report_material") and x.get("published") and start.isoformat() <= x["published"][:10] <= end.isoformat()]
    if articles:
        lines.append("\n行业背景（公开资讯，不计入业绩）：")
        for article in articles:
            lines.append(f"- {article['title']}；来源：{article['source_name']} {article['url']}")
    return {"metrics": metrics, "evidence_ids": [x["id"] for x in contracts + payments + training + notes + articles], "content": "\n".join(lines)}


def install(app, get_session, current_user, operator_user):
    router = APIRouter(prefix="/api/studio")

    @router.get("/records/{kind}")
    def listing(kind: str, session: Session = Depends(get_session), user=Depends(current_user)):
        if kind not in SCHEMAS:
            fail("记录类型不存在", 404)
        if user.role == "executive":
            if kind != "report":
                fail("此处包含内部业务资料", 403)
            return [{k: x[k] for k in ("id", "name", "start", "end", "content", "status", "metrics", "version", "created_at", "updated_at")} for x in records(session, kind) if x["status"] == "已发布"]
        return records(session, kind, user.id)

    @router.post("/records/{kind}")
    def create(kind: str, body: Mutation, session: Session = Depends(get_session), user=Depends(operator_user)):
        lock(session)
        data = body.data
        if kind == "report":
            parsed = validated(Report, data)
            data = {**data, **report_data(session, user.id, parsed.start, parsed.end), "status": "草稿"}
        row = add(session, kind, data, user, body.request_key)
        session.commit()
        return serialize(row)

    @router.patch("/records/{kind}/{record_id}")
    def edit(kind: str, record_id: int, body: Mutation, session: Session = Depends(get_session), user=Depends(operator_user)):
        lock(session)
        row = get_record(session, record_id, kind, user.id)
        if kind in ("payment", "note"):
            fail("已入账记录保留原始证据，请追加更正记录")
        if body.version != row.version:
            fail("记录已更新，请重新加载后编辑", 409)
        before = json.loads(row.payload)
        data = parse(kind, {**before, **body.data})
        validate_links(session, kind, data, user.id, row.id)
        if kind == "enrollment" and any(data[k] != before[k] for k in ("contract_id", "category", "price")):
            fail("报名费用与合同已快照保存；请取消后重新报名")
        if kind == "report":
            if any(data[k] != before[k] for k in ("metrics", "evidence_ids", "start", "end")):
                fail("报告期间和统计依据不可手工修改，请新建报告")
        session.add(StudioRecord(kind="history", owner_id=user.id, request_key=str(uuid4()), payload=json.dumps({"record_id": row.id, "before": before, "after": data}, ensure_ascii=False)))
        row.payload = json.dumps(data, ensure_ascii=False)
        row.version += 1
        row.updated_at = datetime.utcnow()
        write_audit(session, user, "studio.update", f"{kind}:{row.id}", commit=False)
        session.commit()
        return serialize(row)

    @router.get("/contracts/{record_id}/totals")
    def totals(record_id: int, session: Session = Depends(get_session), user=Depends(operator_user)):
        return contract_totals(session, record_id, user.id)

    @router.get("/history/{record_id}")
    def history(record_id: int, session: Session = Depends(get_session), user=Depends(operator_user)):
        return [x for x in records(session, "history", user.id) if x.get("record_id") == record_id]

    @router.get("/evidence/{record_id}")
    def evidence(record_id: int, session: Session = Depends(get_session), user=Depends(operator_user)):
        row = session.get(StudioRecord, record_id)
        if not row or row.owner_id != user.id or row.kind not in {*SCHEMAS, "article"}:
            fail("依据记录不存在", 404)
        return serialize(row)

    @router.get("/actions")
    def actions(session: Session = Depends(get_session), user=Depends(operator_user)):
        output = []
        for a in session.scalars(select(ActionItem).where(ActionItem.archived_at.is_(None)).order_by(ActionItem.due_date, ActionItem.id.desc())):
            state = session.scalar(select(StudioRecord).where(StudioRecord.kind == "action_state", StudioRecord.request_key == f"action:{a.id}", StudioRecord.owner_id == user.id))
            extra = json.loads(state.payload) if state else {}
            output.append({"id": a.id, "title": a.title, "detail": a.detail, "due_date": a.due_date.isoformat() if a.due_date else None, "source_type": a.source_type, "source_id": a.source_id, "status": "已完成" if a.done else "待处理", "result": "", "reason": "", **extra})
        return output

    @router.post("/actions")
    def create_action(body: Mutation, session: Session = Depends(get_session), user=Depends(operator_user)):
        lock(session)
        previous = session.scalar(select(StudioRecord).where(StudioRecord.owner_id == user.id, StudioRecord.request_key == body.request_key))
        if previous:
            return json.loads(previous.payload)
        value = validated(ActionInput, body.data)
        a = ActionItem(kind="studio", title=value.title, detail=value.detail, due_date=value.due_date, source_type=value.source_type, source_id=value.source_id, done=False)
        session.add(a)
        session.flush()
        session.add(StudioRecord(kind="action_request", owner_id=user.id, request_key=body.request_key, payload=json.dumps({"id": a.id})))
        session.commit()
        return {"id": a.id}

    @router.patch("/actions/{action_id}")
    def edit_action(action_id: int, body: ActionInput, session: Session = Depends(get_session), user=Depends(operator_user)):
        lock(session)
        a = session.get(ActionItem, action_id)
        if not a:
            fail("待办不存在", 404)
        if body.status == "已完成" and not body.result:
            fail("请记录处理结果")
        if (body.status == "已取消" or body.due_date != a.due_date) and not body.reason:
            fail("请填写取消或延期原因")
        a.title, a.detail, a.due_date = body.title, body.detail, body.due_date
        a.done = body.status != "待处理"
        state = session.scalar(select(StudioRecord).where(StudioRecord.owner_id == user.id, StudioRecord.request_key == f"action:{a.id}"))
        if not state:
            state = StudioRecord(kind="action_state", owner_id=user.id, request_key=f"action:{a.id}")
            session.add(state)
        state.payload = body.model_dump_json()
        session.add(StudioRecord(kind="action_history", owner_id=user.id, request_key=str(uuid4()), payload=json.dumps({"action_id": a.id, **body.model_dump(mode="json")})))
        write_audit(session, user, "studio.action", f"{a.id}:{body.status}", commit=False)
        session.commit()
        return {"id": a.id}

    @router.get("/summary")
    def summary(session: Session = Depends(get_session), user=Depends(current_user)):
        owner = None if user.role == "executive" else user.id
        return {"parties": len(records(session, "party", owner)), "contracts": len(records(session, "contract", owner)), "notes": len(records(session, "note", owner)), "enrollments": len([x for x in records(session, "enrollment", owner) if x["status"] == "已完成"])}

    app.include_router(router)
