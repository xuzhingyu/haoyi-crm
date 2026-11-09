import json
from datetime import datetime
from io import BytesIO

from pptx import Presentation
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen.canvas import Canvas
from sqlalchemy.orm import Session
from pptx.util import Pt

from .analytics import (
    dashboard_metrics,
    opportunity_funnel,
    overdue_follow_up_risks,
    regional_nodes,
    training_metrics,
    unknown_counts,
)
from .models import ReportSnapshot
from .workbench import current_goals


METRIC_DEFINITIONS = {
    "lead_total": "线索总数：已录入维修门店线索数量",
    "opportunity_total": "商机总数：已建立商机记录数量",
    "franchise_total": "加盟门店数：已建立加盟档案数量",
    "training_total": "培训总数：已登记的培训记录数量",
    "training_completed": "已完成培训数：完成日期已登记的培训记录数量",
    "estimated_pipeline_value": "预计管道金额：所有商机预估金额之和",
    "monthly_order_capacity": "月均进场承载：线索月均进场次数之和",
    "training_completion_rate": "培训完成率：已完成培训数除以培训总数",
}


def legacy_snapshot_payload(snapshot: ReportSnapshot, legacy_payload: dict) -> dict:
    return {
        "schema_version": 1,
        "report_name": snapshot.report_name,
        "period": snapshot.period,
        "generated_at": snapshot.created_at.isoformat(timespec="seconds") + "Z",
        "metric_definitions": METRIC_DEFINITIONS,
        "missing_data_notice": "历史快照未记录的指标以“未记录”展示，不使用当前数据回填。",
        "executive_summary": "这是按兼容规则展示的历史经营快照。",
        "metrics": {
            "lead_total": legacy_payload.get("leads", 0),
            "opportunity_total": legacy_payload.get("opportunities", 0),
            "franchise_total": legacy_payload.get("franchises", 0),
            "training_total": None,
            "training_completed": legacy_payload.get("training_completed", 0),
            "estimated_pipeline_value": None,
            "monthly_order_capacity": None,
        },
        "funnel": [],
        "regions": [],
        "training": {
            "total": None,
            "completed": legacy_payload.get("training_completed", 0),
            "completion_rate": None,
        },
        "risks": [],
        "next_plan": [],
        "coordination_asks": [],
    }


def build_report_snapshot(session: Session, report_name: str, period: str) -> dict:
    metrics = dashboard_metrics(session, period)
    return {
        "schema_version": 2,
        "report_name": report_name,
        "period": period,
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "metric_definitions": METRIC_DEFINITIONS,
        "missing_data_notice": "统计仅含已录入数据；未填写的预估金额和月均进场次数按 0 汇总。",
        "executive_summary": (
            f"本期沉淀线索 {metrics['lead_total']} 家，商机 {metrics['opportunity_total']} 个，"
            f"预计管道金额 {metrics['estimated_pipeline_value']} 元。"
        ),
        "metrics": metrics,
        "funnel": opportunity_funnel(session, period),
        "regions": regional_nodes(session, period),
        "training": training_metrics(session, period),
        "risks": overdue_follow_up_risks(session),
        "next_plan": ["完成逾期跟进闭环", "推动重点商机进入下一阶段"],
        "coordination_asks": ["请区域团队确认重点门店拜访排期", "请培训团队安排待完成课程"],
        "goals": current_goals(session, period or "本月"),
        "unknowns": unknown_counts(session),
    }


def create_report_snapshot(session: Session, report_name: str, period: str) -> ReportSnapshot:
    payload = build_report_snapshot(session, report_name, period)
    snapshot = ReportSnapshot(
        report_name=report_name,
        period=period,
        payload_json=json.dumps(payload, ensure_ascii=False),
        published=False,
    )
    session.add(snapshot)
    session.commit()
    session.refresh(snapshot)
    return snapshot


def load_report_payload(snapshot: ReportSnapshot) -> dict:
    payload = json.loads(snapshot.payload_json)
    if "metrics" not in payload:
        return legacy_snapshot_payload(snapshot, payload)
    return payload


def report_payload_with_urls(snapshot: ReportSnapshot, public_api_prefix: str = "/api") -> dict:
    payload = load_report_payload(snapshot)
    api_prefix = public_api_prefix.rstrip("/")
    return {
        "id": snapshot.id,
        **payload,
        "pptx_url": f"{api_prefix}/reports/{snapshot.id}.pptx",
        "pdf_url": f"{api_prefix}/reports/{snapshot.id}.pdf",
        "published": snapshot.published,
        "published_at": snapshot.published_at.isoformat() if snapshot.published_at else None,
        "voided": snapshot.voided,
    }


def report_sections(payload: dict) -> list[tuple[str, list[str]]]:
    metrics = payload["metrics"]
    training = payload["training"]
    training_rate = training["completion_rate"]

    def display(value: int | float | None) -> str:
        return "未记录" if value is None else str(value)

    def percentage(value: float | None) -> str:
        return "未记录" if value is None else f"{value * 100:.1f}%"

    return [
        (
            "报告说明:",
            [
                f"数据周期: {payload['period']}",
                f"生成时间: {payload['generated_at']}",
                "指标定义:",
                *payload["metric_definitions"].values(),
                f"缺失数据说明: {payload['missing_data_notice']}",
                f"管理摘要: {payload['executive_summary']}",
            ],
        ),
        (
            "核心指标:",
            [
        f"线索总数: {metrics['lead_total']}",
        f"商机总数: {metrics['opportunity_total']}",
        f"加盟门店数: {metrics['franchise_total']}",
        f"培训总数: {display(metrics['training_total'])}",
        f"培训完成数: {display(metrics['training_completed'])}",
        f"预计管道金额: {display(metrics['estimated_pipeline_value'])}",
        f"月均进场承载: {display(metrics['monthly_order_capacity'])}",
            ],
        ),
        ("培训指标:", [f"培训完成率: {percentage(training_rate)}"]),
        (
            "商机漏斗:",
            [
            f"{item['stage']}: {item['count']} 个，{item['estimated_value']} 元"
            for item in payload["funnel"]
            ],
        ),
        (
            "区域对比:",
            [
            f"{item['province'] or '未填省份'}-{item['city'] or '未填城市'}: "
            f"{item['lead_total']} 家线索"
            for item in payload["regions"]
            ],
        ),
        (
            "风险清单:",
            [
            f"{item['shop_name']}: {item['reason']}（截止 {item['due_date']}）"
            for item in payload["risks"]
            ],
        ),
        ("下一步计划:", payload["next_plan"]),
        ("协同诉求:", payload["coordination_asks"]),
    ]


def _report_lines(payload: dict) -> list[str]:
    return [
        line
        for section_title, section_lines in report_sections(payload)
        for line in [section_title, *(section_lines or ["暂无"])]
    ]


def wrap_pptx_line(line: str, max_width_units: int = 64) -> list[str]:
    wrapped: list[str] = []
    current: list[str] = []
    used_width = 0
    for character in line:
        character_width = 1 if character.isascii() else 2
        if current and used_width + character_width > max_width_units:
            wrapped.append("".join(current))
            current = []
            used_width = 0
        current.append(character)
        used_width += character_width
    if current:
        wrapped.append("".join(current))
    return wrapped or [""]


def paginate_pptx_lines(lines: list[str], max_visual_lines: int = 6) -> list[list[str]]:
    pages: list[list[str]] = []
    current_page: list[str] = []
    for line in lines:
        for wrapped_line in wrap_pptx_line(line):
            if len(current_page) == max_visual_lines:
                pages.append(current_page)
                current_page = []
            current_page.append(wrapped_line)
    if current_page:
        pages.append(current_page)
    return pages


def set_pptx_body_text(content_slide, lines: list[str]) -> None:
    text_frame = content_slide.placeholders[1].text_frame
    text_frame.clear()
    text_frame.word_wrap = True
    for index, line in enumerate(lines):
        paragraph = text_frame.paragraphs[0] if index == 0 else text_frame.add_paragraph()
        paragraph.text = line
        for run in paragraph.runs:
            run.font.size = Pt(14)


def render_pptx(payload: dict) -> bytes:
    presentation = Presentation()
    title_slide = presentation.slides.add_slide(presentation.slide_layouts[0])
    title_slide.shapes.title.text = payload["report_name"]
    title_slide.placeholders[1].text = f"数据周期：{payload['period']}\n生成时间：{payload['generated_at']}"
    for section_title, section_lines in report_sections(payload):
        lines = section_lines or ["暂无"]
        for page_index, page_lines in enumerate(paginate_pptx_lines(lines)):
            content_slide = presentation.slides.add_slide(presentation.slide_layouts[1])
            content_slide.shapes.title.text = (
                section_title if page_index == 0 else f"{section_title}（续）"
            )
            set_pptx_body_text(content_slide, page_lines)
    output = BytesIO()
    presentation.save(output)
    return output.getvalue()


def render_pdf(payload: dict) -> bytes:
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    output = BytesIO()
    canvas = Canvas(output, pagesize=A4, pageCompression=0)
    canvas.setFont("STSong-Light", 12)
    y = 800
    for line in [payload["report_name"], *_report_lines(payload)]:
        canvas.drawString(40, y, line)
        y -= 20
        if y < 40:
            canvas.showPage()
            canvas.setFont("STSong-Light", 12)
            y = 800
    canvas.save()
    return output.getvalue()
