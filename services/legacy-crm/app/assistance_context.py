from sqlalchemy.orm import Session

from .analytics import dashboard_metrics, opportunity_funnel, overdue_follow_up_risks, training_metrics
from .models import RepairShopLead


def build_assistance_context(
    session: Session,
    period: str | None,
    region: dict[str, object] | None,
    lead_id: int | None,
) -> tuple[dict, list[dict[str, str]]]:
    """Build a plain, scoped business snapshot for assistance providers."""
    lead = session.get(RepairShopLead, lead_id) if lead_id is not None else None
    lead_projection = None
    if lead is not None:
        lead_projection = {
            "id": lead.id,
            "shop_name": lead.shop_name,
            "province": lead.province,
            "city": lead.city,
            "district": lead.district,
            "new_energy_lifts": lead.new_energy_lifts,
            "monthly_order_count": lead.monthly_order_count,
            "source": lead.source,
        }
    global_scope = {
        "metrics": dashboard_metrics(session, period),
        "funnel": opportunity_funnel(session, period),
        "risks": overdue_follow_up_risks(session),
        "training": training_metrics(session, period),
    }
    selected_region_scope = None
    if region and (region.get("province") or region.get("city") or region.get("constituent_regions")):
        selected_region_scope = {
            "region": {"province": region.get("province"), "city": region.get("city")},
            "metrics": dashboard_metrics(session, period, region),
            "funnel": opportunity_funnel(session, period, region),
            "risks": overdue_follow_up_risks(session, region),
            "training": training_metrics(session, period, region),
        }
    context = {
        "period": period,
        "global_scope": global_scope,
        "selected_region_scope": selected_region_scope,
        "lead": lead_projection,
    }
    sources = [
        {"source": "dashboard_metrics", "label": "Operating metrics"},
        {"source": "opportunity_funnel", "label": "Opportunity funnel"},
        {"source": "overdue_follow_up_risks", "label": "Follow-up risks"},
        {"source": "training_metrics", "label": "Training summary"},
    ]
    if lead_projection is not None:
        sources.append({"source": "repair_shop_lead", "label": "Selected lead"})
    return context, sources
