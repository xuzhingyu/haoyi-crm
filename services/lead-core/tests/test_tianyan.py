from types import SimpleNamespace
from unittest.mock import patch

import pytest

from lead_core.company_intelligence.tianyan import (
    TianyanCollectionError,
    collect_list,
    discover_companies,
    list_page,
    normalise_list,
    query_cli,
)


def test_cli_uses_arguments_without_shell_and_hides_errors(tmp_path):
    entry = tmp_path / "index.js"
    entry.touch()
    settings = SimpleNamespace(company_intelligence_tyc_cli_entry=str(entry))
    name = '测试 & echo secret'
    with patch("subprocess.run", return_value=SimpleNamespace(returncode=0, stdout='{"items":[]}')) as run:
        query_cli(settings, "company", "registration-info", name)
        assert name in run.call_args.args[0]
        assert run.call_args.kwargs["shell"] is False
    with patch("subprocess.run", return_value=SimpleNamespace(returncode=1, stdout="", stderr="token=PRIVATE unauthorized")):
        with pytest.raises(TianyanCollectionError) as caught:
            query_cli(settings, "company", "registration-info", name)
        assert caught.value.code == "auth_required"
        assert "PRIVATE" not in str(caught.value)


def test_news_missing_source_and_bid_role_are_explicit():
    news = normalise_list("公司", "news-sentiment", {"docid": "1", "title": "报道", "emotion": -1, "rtm": "2026-11-09 00:01:00"}, "https://www.tianyancha.com/company/1")
    assert news["category"] == "sentiment"
    assert news["published_at"].endswith("+08:00")
    assert "原文及主体关联待核验" in news["summary"]
    assert "#tyc-" in news["source_url"]
    bid = normalise_list("公司", "bidding-info", {"title": "中标公告", "enterpriseIdentity": "投标方", "bidWinner": "另一企业"}, "https://www.tianyancha.com/company/1")
    assert "本企业角色：投标方" in bid["summary"]
    assert "不等于本企业中标" in bid["summary"]


def test_pagination_continues_beyond_twenty_and_preserves_partial():
    settings = SimpleNamespace(company_intelligence_tyc_max_pages=5)
    first = {"items": [{"id": str(n), "title": str(n)} for n in range(20)], "total": 21}
    last = {"items": [{"id": "20", "title": "20"}], "total": 21}
    with patch("lead_core.company_intelligence.tianyan.query_cli", side_effect=[first, last]) as query:
        rows = collect_list(settings, "operation", "news-sentiment", "公司", "https://www.tianyancha.com/company/1")
        assert len(rows) == 21 and query.call_count == 2
    with patch("lead_core.company_intelligence.tianyan.query_cli", side_effect=[first, {"items": [], "total": 0}]):
        with pytest.raises(TianyanCollectionError) as caught:
            collect_list(settings, "operation", "news-sentiment", "公司", "https://www.tianyancha.com/company/1")
        assert caught.value.code == "partial" and len(caught.value.records) == 20


def test_qualification_multi_source_and_error():
    data = {"sources": {"cert": {"status": "ok", "items": [{"id": "1"}], "total": 1}, "bq": {"status": "empty", "items": [], "total": 0}}}
    assert list_page(data) == ([{"id": "1"}], 1, False)
    data["sources"]["bq"]["status"] = "denied"
    with pytest.raises(TianyanCollectionError):
        list_page(data)


def test_recursive_discovery_excludes_minorities_and_cycles():
    roots = [{"id": "a", "name": "甲"}]
    results = [{"items": [{"name": "甲", "children": [
        {"name": "乙", "creditCode": "b", "percent": "0.68"},
        {"name": "丙", "creditCode": "c", "percent": "0.2"}]}]},
        {"items": [{"name": "乙", "children": [{"name": "甲", "creditCode": "a", "percent": "1"}]}]}]
    with patch("lead_core.company_intelligence.tianyan.query_cli", side_effect=results) as query:
        rows = discover_companies(SimpleNamespace(), roots)
        assert query.call_count == 2
        assert {row["name"] for row in rows} == {"甲", "乙"}
        assert "68.00%" in rows[0]["relationship_note"]
