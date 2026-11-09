"""All paid legacy AI calls pass through the shared server-side budget gateway."""
import os
from urllib.parse import urlparse
from uuid import UUID, uuid4

import httpx


class GatewayError(Exception):
    pass


def configured() -> bool:
    return bool(os.getenv("AI_GATEWAY_URL") and os.getenv("AI_GATEWAY_TOKEN"))


def request_id(value: str | None) -> str:
    try:
        return str(UUID(value)) if value else str(uuid4())
    except ValueError as exc:
        raise GatewayError("X-Request-ID must be a UUID") from exc


def chat(*, purpose: str, actor_sub: str | None, messages: list, call_id: str | None = None,
         source_id: str | None = None, max_tokens: int = 2500, client=None) -> dict:
    endpoint = os.getenv("AI_GATEWAY_URL", "")
    parsed = urlparse(endpoint)
    if not configured() or parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise GatewayError("共享 AI 网关尚未配置，请使用人工录入")
    if not actor_sub:
        raise GatewayError("请使用统一登录后发起 AI 请求")
    payload = {"request_id": request_id(call_id), "purpose": purpose, "actor_sub": actor_sub,
        "source_system": "legacy_crm", "source_id": source_id,
        "messages": messages, "max_tokens": min(4096, max(1, max_tokens)),
        "response_format": {"type": "json_object"}}
    owned = client is None
    client = client or httpx.Client(timeout=70, follow_redirects=False, trust_env=False)
    try:
        response = client.post(endpoint, headers={"Authorization": "Bearer " + os.environ["AI_GATEWAY_TOKEN"]}, json=payload)
        messages_by_status = {402: "今日共享 AI 额度不足，请稍后重试或人工处理", 429: "AI 任务繁忙，请稍后重试",
                              409: "本次 AI 请求已失败或正在处理；确认重试时请创建新请求"}
        if response.status_code in messages_by_status:
            raise GatewayError(messages_by_status[response.status_code])
        response.raise_for_status()
        result = response.json()
        if not isinstance(result, dict):
            raise ValueError()
        return result
    except (httpx.HTTPError, ValueError) as exc:
        raise GatewayError("共享 AI 服务暂时不可用，输入内容已保留") from exc
    finally:
        if owned:
            client.close()
