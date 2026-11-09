"""Official TYC CLI adapter. Credentials remain in the CLI user's private config.

The configured Node entry point avoids shell interpolation, including on Windows.
Provider associations and risk summaries are evidence, never adjudicated findings.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from zoneinfo import ZoneInfo


class TianyanCollectionError(RuntimeError):
    def __init__(self, code: str, message: str, records: list[dict] | None = None):
        super().__init__(message)
        self.code = code
        self.records = records or []


def query_cli(settings, category: str, method: str, name: str, page: int | None = None):
    entry = getattr(settings, "company_intelligence_tyc_cli_entry", "")
    if not entry or not Path(entry).is_file():
        raise TianyanCollectionError("unavailable", "天眼 CLI 尚未配置")
    args = [getattr(settings, "company_intelligence_tyc_node", "node"), entry,
            category, method, name, "--compact"]
    if page is not None:
        args += ["--pageNum", str(page), "--pageSize", "20"]
    try:
        result = subprocess.run(args, capture_output=True, text=True, encoding="utf-8",
                                timeout=90, shell=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise TianyanCollectionError("unavailable", "天眼 CLI 不可用或查询超时") from exc
    # Never surface raw stderr: upstream diagnostics can contain authentication details.
    if result.returncode:
        message = (result.stderr + result.stdout).lower()
        if any(token in message for token in ("quota_exceeded", "额度", "配额")):
            raise TianyanCollectionError("quota_exceeded", "天眼账号调用额度不足，采集已停止")
        if any(token in message for token in ("authorization", "unauthorized", "登录", "token", "401")):
            raise TianyanCollectionError("auth_required", "天眼授权缺失或已过期，请在服务运行账号下重新授权")
        raise TianyanCollectionError("unavailable", "天眼查询未完成，需检查账号权益或服务状态")
    try:
        data = json.loads(result.stdout)
    except (ValueError, TypeError) as exc:
        raise TianyanCollectionError("unavailable", "天眼返回非 JSON 数据") from exc
    if not isinstance(data, dict) or data.get("error") or data.get("isError"):
        raise TianyanCollectionError("unavailable", "天眼未返回有效数据")
    return data


def _published(value):
    if not value:
        return None
    try:
        stamp = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=ZoneInfo("Asia/Shanghai"))
        return stamp.isoformat()
    except (TypeError, ValueError):
        return None


def _record(name, title, summary, url, category="business", published=None, identity=""):
    return {"company_name": name, "title": title[:500], "summary": summary,
            "category": category, "source_name": "天眼查 AI", "source_url": url,
            "published_at": _published(published), "observed_at": datetime.now(UTC).isoformat(),
            "verification_status": "provider_record", "source_record_id": identity}


def normalise_list(name, method, item, company_url):
    title = str(item.get("title") or item.get("certificateName") or item.get("changeItem") or
                item.get("name") or {"qualifications": "企业资质记录", "change-records": "工商变更记录"}.get(method, "经营记录"))
    original_url = item.get("url") or item.get("newsUrl") or item.get("bidUrl")
    url = original_url if isinstance(original_url, str) and original_url.startswith("https://") else company_url
    fields = {"enterpriseIdentity": "本企业角色", "bidWinner": "中标方", "purchaser": "采购方",
              "bidAmount": "公告金额（元）", "website": "发稿平台", "certificateName": "证书",
              "certNo": "证书编号", "certificateNo": "证书编号", "changeItem": "变更事项", "type": "类型",
              "detailSummary": "来源摘要", "endDate": "有效期至"}
    summary = "；".join(f"{label}：{item[key]}" for key, label in fields.items() if item.get(key) is not None)
    category = "business"
    if method == "news-sentiment":
        category = "sentiment" if str(item.get("emotion")) == "-1" else "news"
        summary += "；天眼关联索引，原文及主体关联待核验；情感标签不代表事实认定。"
    elif method == "bidding-info":
        summary += "；被关联的招投标公告不等于本企业中标，以公告角色及原文为准。"
    elif method == "change-records":
        summary += f"；变更前：{item.get('contentBefore', '未返回')}；变更后：{item.get('contentAfter', '未返回')}；日期为来源记录变更时间，不等同于核准日或首次任职日期。"
    if not original_url:
        summary += "；来源未返回原文链接，链接为企业资料页。"
    identity = str(item.get("docid") or item.get("id") or item.get("uuid") or
                   hashlib.sha256(json.dumps(item, sort_keys=True, ensure_ascii=False).encode()).hexdigest())
    if url == company_url:
        url += "#tyc-" + method + "-" + hashlib.sha256(identity.encode()).hexdigest()[:16]
    return _record(name, title, summary, url, category,
                   item.get("rtm") or item.get("publishTime") or item.get("changeTime") or item.get("date") or item.get("startDate"), identity)


def list_page(data):
    if isinstance(data.get("items"), list):
        return data["items"], data.get("total"), bool(data.get("_truncated"))
    sources = data.get("sources")
    if not isinstance(sources, dict) or not sources:
        raise TianyanCollectionError("partial", "天眼返回结构未覆盖")
    items, total, truncated = [], 0, False
    for source in sources.values():
        if source.get("status") not in {"ok", "empty"} or not isinstance(source.get("items"), list):
            raise TianyanCollectionError("partial", "天眼部分子来源未返回数据")
        items.extend(source["items"])
        total += int(source.get("total") or 0)
        truncated = truncated or bool(source.get("_truncated"))
    return items, total, truncated


def discover_companies(settings, roots: list[dict]) -> list[dict]:
    """Follow documented majority holdings; never infer control from name similarity."""
    queue = list(roots)
    result, seen = [], set()
    while queue:
        company = queue.pop(0)
        if company["name"] in seen:
            continue
        if len(seen) >= 100:
            raise TianyanCollectionError("partial", "投资树扫描达到100个主体上限")
        seen.add(company["name"])
        data = query_cli(settings, "company", "equity-tree", company["name"])
        trees = data.get("items")
        if not isinstance(trees, list) or not trees or trees[0].get("name") != company["name"]:
            raise TianyanCollectionError("partial", "投资树主体或返回结构未核验")
        for child in trees[0].get("children", []):
            try:
                ratio = float(child.get("percent") or 0)
            except (TypeError, ValueError):
                raise TianyanCollectionError("partial", "投资树比例格式未覆盖") from None
            if ratio <= .5 or not child.get("creditCode") or not child.get("name"):
                continue
            row = {"id": child["creditCode"], "name": child["name"],
                   "verification_status": "provider_record",
                   "relationship_note": f"{company['name']}持股{ratio:.2%}；登记状态：{child.get('regStatus', '未返回')}。天眼查询日期：{datetime.now(ZoneInfo('Asia/Shanghai')).date()}。"}
            result.append(row)
            if child["name"] not in seen:
                queue.append(row)
    return result


def collect_list(settings, category, method, company_name, url):
    records, seen, expected = [], set(), 0
    max_pages = getattr(settings, "company_intelligence_tyc_max_pages", 50)
    try:
        for page in range(1, max_pages + 1):
            items, total, truncated = list_page(query_cli(settings, category, method, company_name, page))
            if isinstance(total, (int, float)):
                expected = max(expected, total)
            before = len(seen)
            for item in items:
                row = normalise_list(company_name, method, item, url)
                if row["source_record_id"] not in seen:
                    seen.add(row["source_record_id"])
                    records.append(row)
            if expected and len(seen) >= expected:
                return records
            if not items or len(seen) == before or (len(items) < 20 and not truncated):
                if expected > len(seen):
                    raise TianyanCollectionError("partial", f"天眼{method}标称{expected}条，分页实际取得{len(seen)}条独立记录")
                return records
        raise TianyanCollectionError("partial", "天眼回填达到分页上限，仍有记录待补充")
    except TianyanCollectionError as exc:
        exc.records = records
        raise


def collect_company(company_name: str, mode: str, settings) -> list[dict]:
    records: list[dict] = []
    try:
        registration = query_cli(settings, "company", "registration-info", company_name)
        base = registration.get("sources", {}).get("base", {})
        if base.get("name") != company_name or not base.get("id") or not base.get("creditCode"):
            raise TianyanCollectionError("partial", "天眼主体未精确匹配，已停止该企业采集")
        url = f"https://www.tianyancha.com/company/{base['id']}"
        fields = {"creditCode": "统一社会信用代码", "regStatus": "状态", "estiblishTime": "成立日期",
                  "regCapital": "注册资本", "industry": "行业", "businessScope": "经营范围"}
        summary = "；".join(f"{label}：{base[k]}" for k, label in fields.items() if base.get(k))
        records.append(_record(company_name, "工商登记快照", summary, url + "#registration"))
        if mode == "baseline":
            equity = query_cli(settings, "company", "equity-tree", company_name)
            children = [child for root in equity.get("items", []) for child in root.get("children", [])]
            description = "；".join(f"{c.get('name')}（持股 {float(c.get('percent') or 0):.2%}，{c.get('regStatus', '状态未返回')}）" for c in children)
            records.append(_record(company_name, "对外投资关系快照", description or "该次投资树查询未返回下属投资对象，不表示全网无关联企业。", url + "#equity"))
        risk = query_cli(settings, "risk", "overview", company_name)
        meta = risk.get("_riskOverview", {})
        # The provider explicitly warns that displayRowCount is NOT an event total.
        groups = []
        for group in risk.get("riskList", []):
            dimensions = "、".join(f"{d.get('title', '未命名')}（来源计数{d.get('total', '未知')}）" for d in group.get("list", []))
            if dimensions:
                groups.append(f"{group.get('name', '未分类')}：{dimensions}")
        detail = "；".join(groups) or "本次未返回风险分类明细"
        records.append(_record(company_name, "风险维度查询快照", "查询状态：" + str(meta.get("dataStatus", "未提供")) + "；" + detail + "。各维度可能重叠，不得相加为风险事件总数；周边/历史/预警不等于自身当前风险。需结合具体司法、行政记录核验，不能据此作出无风险或违法结论。", url + "#risk-overview", "business"))
        methods = [("operation", "news-sentiment"), ("operation", "bidding-info")]
        if mode == "baseline":
            methods += [("company", "change-records"), ("operation", "qualifications")]
        warnings = []
        for category, method in methods:
            try:
                records.extend(collect_list(settings, category, method, company_name, url))
            except TianyanCollectionError as exc:
                if exc.code in {"auth_required", "quota_exceeded"}:
                    raise
                records.extend(exc.records)
                warnings.append(str(exc))
        if warnings:
            raise TianyanCollectionError("partial", "；".join(warnings))
        return records
    except TianyanCollectionError as exc:
        exc.records = records + exc.records
        raise
