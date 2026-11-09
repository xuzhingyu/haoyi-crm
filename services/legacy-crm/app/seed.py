import json
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import (
    FollowUp,
    Franchise,
    KnowledgeDocument,
    Opportunity,
    PersonalGoal,
    RepairShopLead,
    ReportSnapshot,
    TerritoryAuthorization,
    TrainingRecord,
)
from .auth import seed_users


def seed_demo_data(session: Session) -> None:
    seed_users(session)
    if session.scalar(select(RepairShopLead.id).limit(1)) is not None:
        return
    leads = [
        RepairShopLead(shop_name="南京绿驰新能源汽车维修中心", province="江苏省", city="南京市", district="江宁区", social_credit_code="91320115MA20DEMO01", phone="13800001001", contact_name="张晨", address="南京市江宁区天元东路88号", new_energy_lifts=4, monthly_order_count=126, source="招商会"),
        RepairShopLead(shop_name="苏州智修电驱服务站", province="江苏省", city="苏州市", district="吴中区", social_credit_code="91320506MA20DEMO02", phone="13800001002", contact_name="李敏", address="苏州市吴中区东吴南路168号", new_energy_lifts=3, monthly_order_count=98, source="转介绍"),
        RepairShopLead(shop_name="无锡驭能汽车技术服务", province="江苏省", city="无锡市", district="滨湖区", social_credit_code="91320211MA20DEMO03", phone="13800001003", contact_name="王磊", address="无锡市滨湖区高浪西路66号", new_energy_lifts=2, monthly_order_count=73, source="线上咨询"),
        RepairShopLead(shop_name="杭州光轮新能源汽车服务", province="浙江省", city="杭州市", district="余杭区", social_credit_code="91330110MA20DEMO04", phone="13800001004", contact_name="陈静", address="杭州市余杭区文一西路108号", new_energy_lifts=6, monthly_order_count=160, source="区域拓展"),
        RepairShopLead(shop_name="宁波跃达电驱维修中心", province="浙江省", city="宁波市", district="鄞州区", social_credit_code="91330212MA20DEMO05", phone="13800001005", contact_name="周强", address="宁波市鄞州区诚信路56号", new_energy_lifts=5, monthly_order_count=142, source="合作伙伴"),
        RepairShopLead(shop_name="合肥星驰新能源汽修", province="安徽省", city="合肥市", district="蜀山区", social_credit_code="91340104MA20DEMO06", phone="13800001006", contact_name="赵峰", address="合肥市蜀山区创新大道199号", new_energy_lifts=3, monthly_order_count=88, source="线下拜访"),
    ]
    session.add_all(leads)
    session.flush()
    session.add_all(
        [
            FollowUp(lead_id=leads[0].id, status="待联系", note="确认场地评估结果", due_date=date(2026, 9, 4)),
            FollowUp(lead_id=leads[1].id, status="跟进中", note="发送加盟合作方案", due_date=date(2026, 9, 5)),
            FollowUp(lead_id=leads[2].id, status="逾期", note="回访价格异议", due_date=date(2026, 9, 1)),
            Opportunity(lead_id=leads[0].id, stage="合同推进", estimated_value=180000),
            Opportunity(lead_id=leads[1].id, stage="有意向", estimated_value=150000),
            Opportunity(lead_id=leads[2].id, stage="已拜访", estimated_value=120000),
            Opportunity(lead_id=leads[3].id, stage="方案沟通", estimated_value=200000),
        ]
    )
    franchises = [
        Franchise(lead_id=leads[4].id, franchise_code="FR-ZJ-001", status="运营中", signed_at=date(2026, 8, 12)),
        Franchise(lead_id=leads[5].id, franchise_code="FR-AH-001", status="筹建中", signed_at=date(2026, 8, 28)),
    ]
    session.add_all(franchises)
    session.flush()
    session.add_all(
        [
            TerritoryAuthorization(franchise_id=franchises[0].id, province="浙江省", city="宁波市", exclusive=True, starts_on=date(2026, 8, 12)),
            TerritoryAuthorization(franchise_id=franchises[1].id, province="安徽省", city="合肥市", exclusive=False, starts_on=date(2026, 8, 28)),
        ]
    )
    from .workbench import ensure_delivery_plan
    for franchise in franchises:
        ensure_delivery_plan(session, franchise)
    session.add_all(
        [
            TrainingRecord(franchise_id=franchises[0].id, training_name="新能源维修技术认证", completed_at=date(2026, 8, 22), status="已完成"),
            TrainingRecord(franchise_id=franchises[1].id, training_name="门店运营标准化", completed_at=None, status="待安排"),
        ]
    )
    session.add(KnowledgeDocument(title="新能源维修接待标准", category="运营标准", content="包含高压安全检查与客户交车说明。", status="published"))
    session.add(PersonalGoal(period="本月", qualified_franchise_opportunities=8, signed_franchises=2, qualified_channel_opportunities=5))
    session.add(
        ReportSnapshot(
            report_name="加盟经营周报",
            period="2026-W36",
            payload_json=json.dumps(
                {"leads": len(leads), "opportunities": 4, "franchises": 2, "training_completed": 1},
                ensure_ascii=False,
            ),
            published=True,
            published_at=datetime(2026, 9, 1),
        )
    )
    session.commit()
