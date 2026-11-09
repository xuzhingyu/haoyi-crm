from conftest import TEST_OPERATOR_PASSWORD, TEST_EXECUTIVE_PASSWORD
import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import create_app
from app.studio_models import NewsJob, StudioRecord


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'studio.db'}")) as c:
        yield c


def create(client, kind, data, key=None):
    return client.post('/api/studio/records/' + kind, json={"data": data, "request_key": key or str(uuid4())})


def contract(client):
    p = create(client, 'party', {"name": "苏州合作店", "category": "加盟店", "city": "苏州"})
    assert p.status_code == 200, p.text
    c = create(client, 'contract', {"name": "加盟合同", "party_id": p.json()['id'], "signed_on": "2026-09-18"})
    assert c.status_code == 200, c.text
    return c.json()


def edit(client, kind, row, values):
    return client.patch(f'/api/studio/records/{kind}/{row["id"]}', json={"data": values, "version": row['version'], "request_key": str(uuid4())})


def test_training_capacity_cancellation_and_snapshot(client):
    c = contract(client)
    first = create(client, 'enrollment', {"contract_id": c['id'], "name": "甲"}).json()
    assert create(client, 'enrollment', {"contract_id": c['id'], "name": "乙"}).status_code == 200
    assert create(client, 'enrollment', {"contract_id": c['id'], "name": "丙"}).status_code == 400
    extra = create(client, 'enrollment', {"contract_id": c['id'], "name": "丁", "category": "额外"}).json()
    assert extra['price'] == '6800'
    assert edit(client, 'enrollment', first, {"status": "已取消"}).status_code == 200
    assert create(client, 'enrollment', {"contract_id": c['id'], "name": "丙"}).status_code == 200
    assert edit(client, 'contract', c, {"training_price": '7000'}).status_code == 200
    saved = client.get('/api/studio/records/enrollment').json()
    assert next(x for x in saved if x['id'] == extra['id'])['price'] == '6800'
    totals = client.get(f'/api/studio/contracts/{c["id"]}/totals').json()
    assert totals['training_due'] == '6800'
    assert totals['seats_remaining'] == 0


def test_payments_precision_refunds_and_idempotency(client):
    c = contract(client)
    key = str(uuid4())
    data = {"contract_id": c['id'], "amount": '100.10', "paid_on": '2026-09-18', "evidence": '银行流水1'}
    a = create(client, 'payment', data, key).json()
    b = create(client, 'payment', data, key).json()
    assert a['id'] == b['id']
    assert create(client, 'payment', {**data, "direction": "退款", "amount": '101'}).status_code == 400
    assert create(client, 'payment', {**data, "direction": "退款", "amount": '0.10'}).status_code == 200
    totals = client.get(f'/api/studio/contracts/{c["id"]}/totals').json()
    assert totals['franchise_paid'] == '100.00'
    assert edit(client, 'payment', a, {"amount": '2'}).status_code == 400
    assert create(client, 'payment', {**data, "amount": '0.001'}).status_code == 422


def test_repair_stage_totals_unknown_basis_and_cancellation(client):
    c = contract(client)
    r = create(client, 'repair', {"contract_id": c['id'], "name": '车架号001', "dispatched": '60000', "dispatched_on": '2026-09-18', "evidence": '派车单'}).json()
    totals = client.get(f'/api/studio/contracts/{c["id"]}/totals').json()
    assert totals['dispatched'] == '60000'
    assert totals['settled'] == '0'
    assert totals['fulfillment'] == '待明确'
    assert not totals['overdue']
    assert edit(client, 'contract', c, {"basis": "派单"}).status_code == 200
    assert client.get(f'/api/studio/contracts/{c["id"]}/totals').json()['fulfillment'] == '已兑现'
    assert edit(client, 'repair', r, {"status": "已撤销"}).status_code == 400
    assert edit(client, 'repair', r, {"status": "已撤销", "reason": "车辆退回"}).status_code == 200
    assert client.get(f'/api/studio/contracts/{c["id"]}/totals').json()['dispatched'] == '0'


def test_note_creates_one_action_and_draft_confirmation_is_atomic(client, monkeypatch):
    from app import studio_ai
    monkeypatch.setattr(studio_ai, 'model_call', lambda *a, **kw: {"summary": "考虑加盟", "next_action": "安排考察", "due_date": "2026-09-21"})
    draft = client.post('/api/studio/ai/drafts', json={"text": "张总想考察", "mode": "note"}).json()
    data = {"data": draft['data'], "request_key": str(uuid4())}
    first = client.post(f'/api/studio/ai/drafts/{draft["id"]}/confirm', json=data)
    second = client.post(f'/api/studio/ai/drafts/{draft["id"]}/confirm', json={**data, "request_key": str(uuid4())})
    assert first.status_code == 200, first.text
    assert first.json()['id'] == second.json()['id']
    actions = client.get('/api/studio/actions').json()
    assert sum(a['title'] == '安排考察' for a in actions) == 1


def test_ai_unconfigured_does_not_fake_response(client, monkeypatch):
    monkeypatch.delenv('STUDIO_LOCAL_URL', raising=False)
    response = client.post('/api/studio/ai/drafts', json={"text": "客户沟通记录"})
    assert response.status_code == 503
    assert '未配置' in response.json()['detail']


def test_version_conflict_and_invalid_relationship(client):
    a = create(client, 'party', {"name": "总部"}).json()
    b = create(client, 'party', {"name": "机构"}).json()
    assert create(client, 'relationship', {"from_id":a['id'], "to_id":b['id'], "relationship":"合资", "headquarters_share":70, "partner_share":40}).status_code == 422
    assert edit(client, 'party', a, {"name": "总部更新"}).status_code == 200
    assert edit(client, 'party', a, {"name": "覆盖更新"}).status_code == 409


def test_news_parse_dedupe_and_failure_retains_previous(client, monkeypatch):
    from app import industry
    sources = client.get('/api/studio/records/news_source').json()
    assert len(sources) == 4
    assert {source['topic'] for source in sources} == {'新能源维修', '培训技术', '同行布局', '保险与全损车'}
    published = datetime.now(timezone.utc).isoformat()
    source = create(client, 'news_source', {"name":"公开新闻", "url":"https://news.example.com/feed", "format":"rss"})
    assert source.status_code == 200
    xml = f'<rss><channel><item><title>新能源维修培训</title><link>https://news.example.com/a</link><pubDate>{published}</pubDate><description>公开报道内容</description></item><item><title>新能源维修培训</title><link>https://news.example.com/b</link><pubDate>{published}</pubDate></item><item><title>旧闻</title><pubDate>2020-01-01T00:00:00Z</pubDate></item></channel></rss>'
    monkeypatch.setattr(industry, 'fetch_public', lambda url: xml)
    with client.app.state.session_factory() as session:
        job = industry.queue(session, 1, automatic=True)
        again = industry.queue(session, 1, automatic=True)
        assert job.id == again.id
        industry.run_job(session, job)
    output = client.get('/api/studio/news').json()
    assert output['status'] == 'success'
    assert len(output['articles']) == 1
    assert output['articles'][0]['event_date'] is None
    monkeypatch.setattr(industry, 'fetch_public', lambda url: (_ for _ in ()).throw(ValueError('来源不可用')))
    with client.app.state.session_factory() as session:
        industry.run_job(session, industry.queue(session,1))
    failed = client.get('/api/studio/news').json()
    assert failed['status'] == 'failed'
    assert len(failed['articles']) == 1


def test_public_fetch_rejects_private_addresses(monkeypatch):
    from app import industry
    monkeypatch.setattr(industry.socket, 'getaddrinfo', lambda *a,**k: [(2,1,6,'',('127.0.0.1',80))])
    with pytest.raises(ValueError):
        industry.public_address('http://example.com/')
    with pytest.raises(ValueError):
        industry.public_address('file:///etc/passwd')


def test_executive_cannot_access_private_records_or_unpublished_reports(tmp_path, monkeypatch):
    monkeypatch.setenv('AUTH_DISABLED','0')
    with TestClient(create_app(database_url=f"sqlite:///{tmp_path/'auth.db'}")) as c:
        operator = c.post('/api/auth/login',json={"username":"lin","password":TEST_OPERATOR_PASSWORD}).json()['token']
        c.headers['Authorization']='Bearer '+operator
        report = create(c,'report',{"name":"测试报告","start":"2026-09-01","end":"2026-09-30"}).json()
        leader = c.post('/api/auth/login',json={"username":"leader","password":TEST_EXECUTIVE_PASSWORD}).json()['token']
        c.headers['Authorization']='Bearer '+leader
        assert c.get('/api/studio/records/party').status_code == 403
        assert c.get('/api/studio/actions').status_code == 403
        assert c.get('/api/studio/news').status_code == 403
        assert c.get('/api/studio/records/report').json() == []
        assert create(c,'party',{"name":"不允许"}).status_code == 403
        c.headers['Authorization']='Bearer '+operator
        assert edit(c,'report',report,{"content":"发布内容", "status":"已发布"}).status_code == 200
        c.headers['Authorization']='Bearer '+leader
        reports=c.get('/api/studio/records/report').json()
        assert reports[0]['content']=='发布内容'
        assert 'evidence_ids' not in reports[0]


def test_report_metrics_are_real_and_include_source_evidence(client):
    c=contract(client)
    payment=create(client,'payment',{"contract_id":c['id'],"amount":"26800","paid_on":"2026-09-18","evidence":"流水"}).json()
    r=create(client,'report',{"name":"9月","start":"2026-09-01","end":"2026-09-30"}).json()
    assert r['metrics']['signed']==1
    assert r['metrics']['net_receipts']=='26800'
    assert payment['id'] in r['evidence_ids']
    assert edit(client,'report',r,{"metrics":{"signed":100}}).status_code == 400


def test_opportunity_stage_change_requires_and_records_reason(client):
    opportunity = client.get('/api/opportunities').json()[0]
    target = opportunity['stage'] + '-下一阶段'
    denied = client.patch(f'/api/opportunities/{opportunity["id"]}', json={"stage": target})
    assert denied.status_code == 400
    updated = client.patch(f'/api/opportunities/{opportunity["id"]}', json={"stage": target, "stage_reason": "客户已确认合同条款"})
    assert updated.status_code == 200
    history = client.get(f'/api/opportunities/{opportunity["id"]}/history').json()
    assert history[0]['reason'] == "客户已确认合同条款"
