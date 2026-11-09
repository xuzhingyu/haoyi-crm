import json
import math
from dataclasses import dataclass
from typing import Protocol

import httpx

from .assistance import AssistanceResult, business_sources
from . import ai_gateway

MAX_ACTIONS = 5

CLOUD_OPERATION_MODES = frozenset({"operations", "visit_prep", "weekly_report"})
SAFE_OPERATION_INTENTS = frozenset(
    {"opportunity_analysis", "risk_review", "training_reminder", "general_operations"}
)
OPERATION_INTENT_DATASETS = {
    "opportunity_analysis": ("dashboard_metrics", "opportunity_funnel"),
    "risk_review": ("overdue_follow_up_risks",),
    "training_reminder": ("training_metrics",),
    "general_operations": ("dashboard_metrics", "opportunity_funnel"),
}
WEEKLY_REPORT_DATASETS = (
    "dashboard_metrics",
    "opportunity_funnel",
    "overdue_follow_up_risks",
    "training_metrics",
)
METRIC_FIELDS = (
    "lead_total",
    "opportunity_total",
    "franchise_total",
    "training_total",
    "training_completed",
    "estimated_pipeline_value",
    "monthly_order_capacity",
)
FUNNEL_STAGE_ENUMS = {
    "新线索": "new_lead",
    "有意向": "interested",
    "已拜访": "visited",
    "方案沟通": "proposal",
    "合同推进": "contract",
}
FUNNEL_STAGE_VALUES = ("new_lead", "interested", "visited", "proposal", "contract", "other")

TRUSTED_SYSTEM_INSTRUCTIONS = (
    "You provide concise, evidence-bounded guidance for an operations workbench. "
    "The next user message is a fixed-schema aggregate operations DTO. "
    "Do not request, infer, or include personal data, source text, or document content. "
    "Return a JSON object with non-empty `guidance`, a string array `suggested_actions`, "
    "and an empty integer array `citation_document_ids`."
)


class ProviderError(Exception):
    """A readable cloud-provider failure that callers can safely expose."""


@dataclass(frozen=True)
class OperationsOutboundDTO:
    """The complete cloud contract: only fixed enums, booleans, and numeric aggregates."""

    mode: str
    intent: str
    has_selected_lead: bool
    uses_selected_region_scope: bool
    datasets: dict[str, dict]

    @property
    def dataset_names(self) -> tuple[str, ...]:
        return tuple(self.datasets)

    def serialize(self) -> str:
        return json.dumps(
            {
                "mode": self.mode,
                "intent": self.intent,
                "has_selected_lead": self.has_selected_lead,
                "uses_selected_region_scope": self.uses_selected_region_scope,
                "datasets": self.datasets,
            },
            separators=(",", ":"),
        )


class CloudOperationsProvider(Protocol):
    """Cloud providers never receive a request, conversation, or knowledge document."""

    def answer(self, outbound: OperationsOutboundDTO) -> AssistanceResult: ...


def derive_operations_intent(mode: str, question: str) -> str:
    """Classify local user input before the cloud boundary using a fixed safe enum."""
    if mode != "operations":
        return "general_operations"
    if "\u57f9\u8bad" in question or "\u4ea4\u4ed8" in question:
        return "training_reminder"
    if any(term in question for term in ("\u98ce\u9669", "\u903e\u671f", "\u8ddf\u8fdb")):
        return "risk_review"
    return "opportunity_analysis"


def _safe_number(value: object) -> int | float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return 0
    return value if math.isfinite(value) else 0


def _safe_metrics(metrics: object) -> dict[str, int | float]:
    values = metrics if isinstance(metrics, dict) else {}
    return {field: _safe_number(values.get(field)) for field in METRIC_FIELDS}


def _safe_training(training: object) -> dict[str, int | float]:
    values = training if isinstance(training, dict) else {}
    return {
        "total": _safe_number(values.get("total")),
        "completed": _safe_number(values.get("completed")),
        "completion_rate": _safe_number(values.get("completion_rate")),
    }


def _is_safe_number(value: object) -> bool:
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)


def _safe_selected_lead_dataset(lead: object) -> dict:
    values = lead if isinstance(lead, dict) else {}
    return {
        "selected": isinstance(lead, dict),
        "metric_availability": {
            "new_energy_lifts": _is_safe_number(values.get("new_energy_lifts")),
            "monthly_order_count": _is_safe_number(values.get("monthly_order_count")),
        },
        "metrics": {
            "new_energy_lifts": _safe_number(values.get("new_energy_lifts")),
            "monthly_order_count": _safe_number(values.get("monthly_order_count")),
        },
    }


def _safe_funnel(funnel: object) -> dict[str, dict[str, int | float]]:
    counters = {
        stage: {"count": 0, "estimated_value": 0}
        for stage in FUNNEL_STAGE_VALUES
    }
    for item in funnel if isinstance(funnel, list) else []:
        if not isinstance(item, dict):
            continue
        raw_stage = item.get("stage")
        stage = FUNNEL_STAGE_ENUMS.get(raw_stage if isinstance(raw_stage, str) else "", "other")
        counters[stage]["count"] += _safe_number(item.get("count"))
        counters[stage]["estimated_value"] += _safe_number(item.get("estimated_value"))
    return counters


def _operations_scope(context: dict) -> tuple[dict, bool]:
    selected_scope = context.get("selected_region_scope")
    if isinstance(selected_scope, dict):
        return selected_scope, True
    global_scope = context.get("global_scope")
    return (global_scope if isinstance(global_scope, dict) else {}), False


def _dataset_names(mode: str, intent: str, has_selected_lead: bool) -> tuple[str, ...]:
    if mode == "visit_prep":
        return ("repair_shop_lead",) if has_selected_lead else ()
    if mode == "weekly_report":
        return WEEKLY_REPORT_DATASETS
    return OPERATION_INTENT_DATASETS[intent]


def build_operations_outbound_dto(
    *,
    mode: str,
    intent: str,
    context: dict,
) -> OperationsOutboundDTO:
    """Project local context into the explicit non-text cloud contract before provider injection."""
    if mode not in CLOUD_OPERATION_MODES:
        raise ProviderError("AI provider does not handle knowledge mode.")
    if intent not in SAFE_OPERATION_INTENTS:
        raise ProviderError("AI provider received an unsupported operations intent.")

    context = context if isinstance(context, dict) else {}
    scope, uses_selected_region_scope = _operations_scope(context)
    lead = context.get("lead")
    risks = scope.get("risks")
    datasets = {}
    for dataset_name in _dataset_names(mode, intent, isinstance(lead, dict)):
        if dataset_name == "dashboard_metrics":
            datasets[dataset_name] = _safe_metrics(scope.get("metrics"))
        elif dataset_name == "opportunity_funnel":
            datasets[dataset_name] = _safe_funnel(scope.get("funnel"))
        elif dataset_name == "overdue_follow_up_risks":
            datasets[dataset_name] = {
                "overdue_follow_up": sum(1 for risk in risks if isinstance(risk, dict))
                if isinstance(risks, list)
                else 0
            }
        elif dataset_name == "training_metrics":
            datasets[dataset_name] = _safe_training(scope.get("training"))
        elif dataset_name == "repair_shop_lead":
            datasets[dataset_name] = _safe_selected_lead_dataset(lead)
    return OperationsOutboundDTO(
        mode=mode,
        intent=intent,
        has_selected_lead=isinstance(lead, dict),
        uses_selected_region_scope=uses_selected_region_scope,
        datasets=datasets,
    )


class OpenAICompatibleProvider:
    def __init__(self, http_client: httpx.Client | None = None):
        self._http_client = http_client

    def _client(self, timeout: float) -> httpx.Client:
        if self._http_client is None:
            self._http_client = httpx.Client(timeout=timeout, follow_redirects=False, trust_env=False)
        return self._http_client

    def close(self) -> None:
        close = getattr(self._http_client, "close", None)
        if callable(close):
            close()

    def answer(self, outbound: OperationsOutboundDTO, *, actor_sub: str | None = None, request_id: str | None = None) -> AssistanceResult:
        if outbound.mode not in CLOUD_OPERATION_MODES:
            raise ProviderError("AI provider does not handle knowledge mode.")

        messages = [
                {"role": "system", "content": TRUSTED_SYSTEM_INSTRUCTIONS},
                {"role": "user", "content": outbound.serialize()},
            ]
        try:
            response = ai_gateway.chat(purpose=outbound.mode, actor_sub=actor_sub,
                messages=messages, call_id=request_id, client=self._client(70))
        except ai_gateway.GatewayError as exc:
            raise ProviderError(str(exc)) from exc

        try:
            content = response["choices"][0]["message"]["content"]
            answer = json.loads(content)
        except (KeyError, IndexError, TypeError, json.JSONDecodeError, ValueError) as exc:
            raise ProviderError("AI provider returned malformed JSON.") from exc
        if not isinstance(answer, dict):
            raise ProviderError("AI provider returned malformed JSON.")
        guidance = answer.get("guidance")
        actions = answer.get("suggested_actions")
        citation_ids = answer.get("citation_document_ids")
        if (
            not isinstance(guidance, str)
            or not guidance.strip()
            or not isinstance(actions, list)
            or not all(isinstance(action, str) for action in actions)
            or not isinstance(citation_ids, list)
            or not all(type(document_id) is int for document_id in citation_ids)
        ):
            raise ProviderError("AI provider response failed validation.")

        return AssistanceResult(
            guidance=guidance.strip(),
            citations=[],
            sufficient_evidence=True,
            suggested_actions=[action.strip()[:160] for action in actions[:MAX_ACTIONS] if action.strip()],
            business_sources=business_sources(*outbound.dataset_names),
            provider="cloud",
        )
