from dataclasses import dataclass, field, replace
from typing import Protocol

WORKFLOW_STOP_BIGRAMS = {
    "流程",
    "安排",
    "如何",
    "确认",
    "建议",
    "操作",
    "处理",
    "支持",
    "服务",
    "管理",
    "工作",
    "情况",
    "信息",
}
GENERIC_WORKFLOW_PHRASES = (
    "工作流程安排",
    "工作流程",
    "流程安排",
)


@dataclass(frozen=True)
class AssistanceResult:
    guidance: str
    citations: list[dict[str, int | str]]
    sufficient_evidence: bool
    suggested_actions: list[str] = field(default_factory=list)
    business_sources: list[dict[str, str]] = field(default_factory=list)
    provider: str = "local"
    fallback_reason: str | None = None


@dataclass(frozen=True)
class KnowledgeEvidence:
    id: int
    title: str
    category: str
    content: str


@dataclass(frozen=True)
class AssistanceHistory:
    role: str
    content: str


@dataclass(frozen=True)
class AssistanceInput:
    question: str
    mode: str
    context: dict
    history: list[AssistanceHistory]
    documents: list[KnowledgeEvidence]


class GuidanceProvider(Protocol):
    def answer(self, request: AssistanceInput) -> AssistanceResult: ...


def subject_bigrams(text: str) -> set[str]:
    for phrase in GENERIC_WORKFLOW_PHRASES:
        text = text.replace(phrase, " ")
    return {
        text[index : index + 2]
        for index in range(len(text) - 1)
        if text[index].isalnum()
        and text[index + 1].isalnum()
        and text[index : index + 2] not in WORKFLOW_STOP_BIGRAMS
    }


class LocalKnowledgeProvider:
    def answer(self, request: AssistanceInput) -> AssistanceResult:
        if request.mode == "feedback":
            return AssistanceResult(
                guidance="已根据原文生成反馈草稿。请核对联系结果、点名门店和加盟/渠道方向后确认；未确认草稿不计入批次质量或机会。",
                citations=[],
                sufficient_evidence=bool(request.question.strip()),
            )
        if request.mode == "opportunity":
            return AssistanceResult(
                guidance="机会辅助草稿：请确认类型（加盟/渠道）、资格三档依据和下一步动作日期后再入账。",
                citations=[],
                sufficient_evidence=bool(request.question.strip()),
            )
        if request.mode == "review":
            return AssistanceResult(
                guidance="周复盘草稿仅供确认：先核对已确认批次、机会下一步和交付风险，再决定本周重点，不自动改写指标。",
                citations=[],
                sufficient_evidence=True,
            )
        question_terms = subject_bigrams(request.question)
        scored = sorted(
            [
                (
                    len(question_terms.intersection(subject_bigrams(f"{document.title}\n{document.content}"))),
                    document,
                )
                for document in request.documents
                if document.content.strip()
            ],
            key=lambda item: (-item[0], item[1].id),
        )
        eligible = [
            (score, document)
            for score, document in scored
            if score >= 2 and question_terms and score / len(question_terms) >= 0.2
        ]
        if not eligible:
            return AssistanceResult(
                guidance="现有知识库证据不足，建议补充对应流程或向运营负责人确认。",
                citations=[],
                sufficient_evidence=False,
            )
        source_document = eligible[0][1]
        guidance = source_document.content.split("。", maxsplit=1)[0]
        return AssistanceResult(
            guidance=f"建议：{guidance}。",
            citations=[
                {
                    "document_id": document.id,
                    "title": document.title,
                    "category": document.category,
                }
                for _, document in eligible[:3]
            ],
            sufficient_evidence=True,
        )


BUSINESS_SOURCE_LABELS = {
    "dashboard_metrics": "Operating metrics",
    "opportunity_funnel": "Opportunity funnel",
    "overdue_follow_up_risks": "Follow-up risks",
    "training_metrics": "Training summary",
    "repair_shop_lead": "Selected lead",
}


def business_sources(*source_names: str) -> list[dict[str, str]]:
    return [{"source": name, "label": BUSINESS_SOURCE_LABELS[name]} for name in source_names]


def operation_source_names(mode: str, question: str, has_lead: bool) -> tuple[str, ...]:
    if mode == "visit_prep":
        return ("repair_shop_lead",) if has_lead else ()
    if mode == "weekly_report":
        return (
            "dashboard_metrics",
            "opportunity_funnel",
            "overdue_follow_up_risks",
            "training_metrics",
        )
    if "培训" in question or "交付" in question:
        return ("training_metrics",)
    if any(term in question for term in ("风险", "逾期", "跟进")):
        return ("overdue_follow_up_risks",)
    return ("opportunity_funnel", "dashboard_metrics")


class LocalOperationsProvider:
    """Deterministic local strategies for the visible copilot quick tasks."""

    def answer(self, request: AssistanceInput) -> AssistanceResult:
        result = self._answer(request)
        recent_history = request.history[-6:]
        if not recent_history:
            return result
        last_user_message = next(
            (item.content for item in reversed(recent_history) if item.role == "user"),
            None,
        )
        session_supplement = f" 已结合当前会话最近 {len(recent_history)} 条消息。"
        if last_user_message:
            session_supplement += f" 当前会话补充：{last_user_message}"
        return replace(
            result,
            guidance=f"{result.guidance}{session_supplement}",
        )

    def _answer(self, request: AssistanceInput) -> AssistanceResult:
        question = request.question
        mode = request.mode
        context = request.context
        selected_scope = context.get("selected_region_scope")
        scope = selected_scope or context.get("global_scope") or {}
        metrics = scope.get("metrics", {})
        if mode == "visit_prep":
            lead = context.get("lead")
            if lead is None:
                return AssistanceResult(
                    guidance="尚未选择拜访线索，无法生成针对性的拜访准备。",
                    citations=[],
                    sufficient_evidence=False,
                    suggested_actions=["选择需要拜访的线索后重新生成"],
                )
            location = "".join(part for part in (lead.get("province"), lead.get("city"), lead.get("district")) if part)
            capacity = lead.get("monthly_order_count") or 0
            if lead.get("monthly_order_count") is None:
                capacity = "\u6682\u65e0"
            return AssistanceResult(
                guidance=(
                    f"拜访 {lead['shop_name']} 前，先核对其位于{location}、月均进场承载约 {capacity} 单的经营情况。"
                ),
                citations=[],
                sufficient_evidence=True,
                suggested_actions=["确认场地与设备现状", "核对合作推进阶段", "约定下一次跟进时间"],
                business_sources=business_sources(*operation_source_names(mode, question, True)),
            )
        if mode == "weekly_report":
            summary_metrics = scope.get("metrics", {})
            funnel = scope.get("funnel", [])
            risks = scope.get("risks", [])
            training = scope.get("training", {})
            leading_stage = max(funnel, key=lambda item: item.get("estimated_value", 0), default=None)
            funnel_summary = (
                f"漏斗重点为 {leading_stage['stage']} 阶段 {leading_stage.get('count', 0)} 个，"
                f"预计金额 {leading_stage.get('estimated_value', 0)}；"
                if leading_stage
                else "当前漏斗暂无可推进商机；"
            )
            return AssistanceResult(
                guidance=(
                    f"本期线索 {summary_metrics.get('lead_total', 0)} 个、商机 {summary_metrics.get('opportunity_total', 0)} 个，"
                    f"预计管道金额 {summary_metrics.get('estimated_pipeline_value', 0)}；{funnel_summary}"
                    f"培训已完成 {training.get('completed', 0)}/{training.get('total', 0)} 项；"
                    f"待优先处理 {len(risks)} 项逾期跟进。"
                ),
                citations=[],
                sufficient_evidence=True,
                suggested_actions=["复核重点商机推进计划", "处理逾期跟进", "确认培训交付排期"],
                business_sources=business_sources(*operation_source_names(mode, question, False)),
            )
        if "培训" in question or "交付" in question:
            training = scope.get("training", {})
            return AssistanceResult(
                guidance=(
                    f"当前培训共 {training.get('total', 0)} 项，已完成 {training.get('completed', 0)} 项；"
                    "请优先确认未完成培训的排期与责任人。"
                ),
                citations=[],
                sufficient_evidence=True,
                suggested_actions=["确认未完成培训排期", "同步培训负责人"],
                business_sources=business_sources(*operation_source_names(mode, question, False)),
            )
        if any(term in question for term in ("风险", "逾期", "跟进")):
            risks = scope.get("risks", [])
            first_risk = risks[0] if risks else None
            guidance = (
                f"当前有 {len(risks)} 项逾期跟进，优先处理 {first_risk['shop_name']}。"
                if first_risk
                else "当前没有逾期跟进风险，继续按计划复核重点商机。"
            )
            return AssistanceResult(
                guidance=guidance,
                citations=[],
                sufficient_evidence=True,
                suggested_actions=["确认下一次跟进时间", "记录处理结果"],
                business_sources=business_sources(*operation_source_names(mode, question, False)),
            )
        funnel = scope.get("funnel", [])
        leading_stage = max(funnel, key=lambda item: item.get("estimated_value", 0), default=None)
        stage_guidance = (
            f"优先推进 {leading_stage['stage']} 阶段，当前预计金额 {leading_stage['estimated_value']}。"
            if leading_stage
            else "当前范围暂无可推进商机，建议先补充线索与商机阶段。"
        )
        return AssistanceResult(
            guidance=(
                f"当前范围共有 {metrics.get('opportunity_total', 0)} 个商机，{stage_guidance}"
            ),
            citations=[],
            sufficient_evidence=True,
            suggested_actions=["确认重点商机负责人", "更新下一步推进节点"],
            business_sources=business_sources(*operation_source_names(mode, question, False)),
        )
