from datetime import date, datetime

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from .models import FollowUp, Franchise, Opportunity, RepairShopLead, TrainingRecord
from .workbench import current_goals, list_actions, map_overview


def _region_key_condition(column, value: object):
    return column.is_(None) if value is None else column == value


def _region_filters(region: dict[str, object] | None) -> tuple:
    if not region:
        return ()
    constituent_regions = region.get("constituent_regions")
    if isinstance(constituent_regions, list):
        constituent_filters = [
            and_(
                _region_key_condition(RepairShopLead.province, item.get("province")),
                _region_key_condition(RepairShopLead.city, item.get("city")),
            )
            for item in constituent_regions
            if isinstance(item, dict)
        ]
        if constituent_filters:
            return (or_(*constituent_filters),)
    filters = []
    if region.get("province"):
        filters.append(RepairShopLead.province == region["province"])
    if region.get("city"):
        filters.append(RepairShopLead.city == region["city"])
    return tuple(filters)


def _training_count_queries(
    period: str | None,
    region: dict[str, object] | None,
):
    total_query = select(func.count(TrainingRecord.id))
    completed_query = select(func.count(TrainingRecord.id)).where(TrainingRecord.completed_at.is_not(None))
    bounds = period_bounds(period)
    if bounds:
        start, end = bounds
        total_query = total_query.where(
            or_(
                TrainingRecord.completed_at.is_(None),
                and_(TrainingRecord.completed_at >= start.date(), TrainingRecord.completed_at < end.date()),
            )
        )
        completed_query = completed_query.where(
            TrainingRecord.completed_at >= start.date(),
            TrainingRecord.completed_at < end.date(),
        )
    region_filters = _region_filters(region)
    if region_filters:
        total_query = total_query.join(Franchise).join(RepairShopLead).where(*region_filters)
        completed_query = completed_query.join(Franchise).join(RepairShopLead).where(*region_filters)
    return total_query, completed_query


def _month_start(year: int, month: int) -> datetime:
    return datetime(year, month, 1)


def _next_month(value: datetime) -> datetime:
    if value.month == 12:
        return _month_start(value.year + 1, 1)
    return _month_start(value.year, value.month + 1)


def period_bounds(period: str | None, today: date | None = None) -> tuple[datetime, datetime] | None:
    """Translate the UI period into a half-open range without changing all-time callers."""
    current = today or date.today()
    this_month = _month_start(current.year, current.month)
    if period == "本月":
        return this_month, _next_month(this_month)
    if period == "上月":
        previous = _month_start(current.year - 1, 12) if current.month == 1 else _month_start(current.year, current.month - 1)
        return previous, this_month
    if period == "本季度":
        quarter_month = ((current.month - 1) // 3) * 3 + 1
        start = _month_start(current.year, quarter_month)
        end = _month_start(current.year + 1, 1) if quarter_month == 10 else _month_start(current.year, quarter_month + 3)
        return start, end
    if period and len(period) == 7:
        try:
            start = datetime.strptime(period, "%Y-%m")
        except ValueError:
            return None
        return start, _next_month(start)
    return None


def dashboard_metrics(
    session: Session,
    period: str | None = None,
    region: dict[str, object] | None = None,
) -> dict[str, int]:
    bounds = period_bounds(period)
    lead_count = select(func.count(RepairShopLead.id))
    opportunity_count = select(func.count(Opportunity.id)).join(RepairShopLead)
    pipeline_value = select(func.coalesce(func.sum(Opportunity.estimated_value), 0)).join(RepairShopLead)
    monthly_capacity = select(func.coalesce(func.sum(RepairShopLead.monthly_order_count), 0))
    franchise_count = select(func.count(Franchise.id)).join(RepairShopLead, Franchise.lead_id == RepairShopLead.id)
    training_total, training_completed = _training_count_queries(period, region)
    region_filters = _region_filters(region)
    if region_filters:
        lead_count = lead_count.where(*region_filters)
        opportunity_count = opportunity_count.where(*region_filters)
        pipeline_value = pipeline_value.where(*region_filters)
        monthly_capacity = monthly_capacity.where(*region_filters)
        franchise_count = franchise_count.where(*region_filters)
    if bounds:
        start, end = bounds
        lead_period = (RepairShopLead.created_at >= start, RepairShopLead.created_at < end)
        signed_period = (Franchise.signed_at >= start.date(), Franchise.signed_at < end.date())
        lead_count = lead_count.where(*lead_period)
        opportunity_count = opportunity_count.where(*lead_period)
        pipeline_value = pipeline_value.where(*lead_period)
        monthly_capacity = monthly_capacity.where(*lead_period)
        franchise_count = franchise_count.where(*signed_period)
    return {
        "lead_total": session.scalar(lead_count) or 0,
        "opportunity_total": session.scalar(opportunity_count) or 0,
        "franchise_total": session.scalar(franchise_count) or 0,
        "training_total": session.scalar(training_total) or 0,
        "training_completed": session.scalar(training_completed) or 0,
        "estimated_pipeline_value": session.scalar(pipeline_value) or 0,
        "monthly_order_capacity": session.scalar(monthly_capacity) or 0,
    }


def opportunity_funnel(
    session: Session,
    period: str | None = None,
    region: dict[str, object] | None = None,
) -> list[dict[str, int | str]]:
    query = (
        select(
            Opportunity.stage,
            func.count(Opportunity.id),
            func.coalesce(func.sum(Opportunity.estimated_value), 0),
        )
        .join(RepairShopLead)
        .group_by(Opportunity.stage)
        .order_by(Opportunity.stage)
    )
    bounds = period_bounds(period)
    if bounds:
        query = query.where(RepairShopLead.created_at >= bounds[0], RepairShopLead.created_at < bounds[1])
    region_filters = _region_filters(region)
    if region_filters:
        query = query.where(*region_filters)
    rows = session.execute(query)
    return [
        {"stage": stage, "count": count, "estimated_value": estimated_value}
        for stage, count, estimated_value in rows
    ]


def regional_nodes(session: Session, period: str | None = None) -> list[dict[str, int | str | None]]:
    bounds = period_bounds(period)
    lead_query = (
        select(
            RepairShopLead.province,
            RepairShopLead.city,
            func.count(RepairShopLead.id),
            func.coalesce(func.sum(RepairShopLead.monthly_order_count), 0),
        )
        .group_by(RepairShopLead.province, RepairShopLead.city)
        .order_by(RepairShopLead.province, RepairShopLead.city)
    )
    franchise_query = (
        select(
            RepairShopLead.province,
            RepairShopLead.city,
            func.count(Franchise.id),
        )
        .join(RepairShopLead, RepairShopLead.id == Franchise.lead_id)
        .group_by(RepairShopLead.province, RepairShopLead.city)
    )
    if bounds:
        start, end = bounds
        lead_query = lead_query.where(RepairShopLead.created_at >= start, RepairShopLead.created_at < end)
        franchise_query = franchise_query.where(Franchise.signed_at >= start.date(), Franchise.signed_at < end.date())

    regions: dict[tuple[str | None, str | None], dict[str, int | str | None]] = {}
    for province, city, lead_total, monthly_order_capacity in session.execute(lead_query):
        regions[(province, city)] = {
            "province": province,
            "city": city,
            "lead_total": lead_total,
            "monthly_order_capacity": monthly_order_capacity,
            "franchise_total": 0,
        }
    for province, city, franchise_total in session.execute(franchise_query):
        region = regions.setdefault((province, city), {
            "province": province,
            "city": city,
            "lead_total": 0,
            "monthly_order_capacity": 0,
            "franchise_total": 0,
        })
        region["franchise_total"] = franchise_total
    overview = {(item["province"], item["city"]): item for item in map_overview(session)}
    for region in regions.values():
        extra = overview.get((region["province"], region["city"]), {})
        region["pending_batches"] = extra.get("pending_batches", 0)
        region["franchise_opportunities"] = extra.get("franchise_opportunities", 0)
        region["channel_opportunities"] = extra.get("channel_opportunities", 0)
        region["delivery_risks"] = extra.get("delivery_risks", 0)
    return list(regions.values())


def training_metrics(
    session: Session,
    period: str | None = None,
    region: dict[str, object] | None = None,
) -> dict[str, int | float]:
    total_query, completed_query = _training_count_queries(period, region)
    total = session.scalar(total_query) or 0
    completed = session.scalar(completed_query) or 0
    return {
        "total": total,
        "completed": completed,
        "completion_rate": completed / total if total else 0.0,
    }


def unknown_counts(session: Session) -> dict[str, int]:
    missing_next = session.scalar(select(func.count(Opportunity.id)).where(Opportunity.next_action.is_(None))) or 0
    unknown_application = session.scalar(
        select(func.count(TrainingRecord.id)).where(TrainingRecord.completed_at.is_(None))
    ) or 0
    return {"missing_next_action": missing_next, "application_unknown": unknown_application}


def dashboard_payload(session: Session, period: str | None = None, *, executive: bool = False) -> dict:
    from datetime import timezone

    payload = {
        "period": period,
        "metrics": dashboard_metrics(session, period),
        "funnel": opportunity_funnel(session, period),
        "regions": regional_nodes(session, period),
        "training": training_metrics(session, period),
        "risks": overdue_follow_up_risks(session),
        "goals": current_goals(session, period or "本月"),
        "unknowns": unknown_counts(session),
        "updated_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(timespec="seconds") + "Z",
        "actions": [] if executive else list_actions(session),
    }
    if executive:
        for risk in payload["risks"]:
            risk.pop("note", None)
    return payload


def overdue_follow_up_risks(
    session: Session,
    region: dict[str, object] | None = None,
) -> list[dict[str, int | str]]:
    query = (
        select(FollowUp.id, FollowUp.lead_id, RepairShopLead.shop_name, FollowUp.due_date)
        .join(RepairShopLead, RepairShopLead.id == FollowUp.lead_id)
        .where(FollowUp.due_date.is_not(None), FollowUp.due_date < date.today())
        .order_by(FollowUp.due_date, FollowUp.id)
    )
    region_filters = _region_filters(region)
    if region_filters:
        query = query.where(*region_filters)
    rows = session.execute(query)
    return [
        {
            "type": "overdue_follow_up",
            "follow_up_id": follow_up_id,
            "lead_id": lead_id,
            "shop_name": shop_name,
            "due_date": due_date.isoformat(),
            "reason": "跟进已逾期",
        }
        for follow_up_id, lead_id, shop_name, due_date in rows
    ]
