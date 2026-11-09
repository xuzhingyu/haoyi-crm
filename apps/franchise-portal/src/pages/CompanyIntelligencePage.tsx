import { Pagination } from '../ui/Pagination';
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { CompanyCollectionRun, CompanyIntelligence } from '../api/types';
import { Empty, ErrorState, ExternalLink, Loading, PageHeading } from '../components';
import { dateTime, errorText, safeUrl, useLoad, useWorkspace } from '../workspace';
import './company-intelligence.css';

const categoryLabels: Record<string, string> = { news: '媒体新闻', business: '经营信息', sentiment: '舆情信息' };
const verificationLabels: Record<string, string> = {
  provider_record: '天眼记录', official_record: '官方记录', company_statement: '企业自述', media_report: '媒体报道',
  verified: '已核验', confirmed: '已核验', official: '官方来源', primary_source: '一手来源',
  pending: '待核验', unverified: '待核验', pending_verification: '待核验', source_verified: '来源已核对',
  self_reported: '企业自述', historical_self_reported: '历史企业自述', media_reported: '媒体报道',
};
const stateLabels: Record<string, string> = {
  queued: '排队中', running: '采集中', succeeded: '已完成', completed: '已完成', partial: '部分完成',
  failed: '采集失败', not_started: '尚未采集', not_configured: '未配置', disabled: '未启用',
  pending_authorization: '待授权', unauthorized: '待授权', not_authorized: '待授权', configured: '已配置',
  ready: '已就绪', connected: '已连接', unavailable: '暂不可用', idle: '等待采集',
};
const isActive = (run?: CompanyCollectionRun | null) => Boolean(run && ['queued', 'running'].includes(run.status));
const primaryCompanyIds = new Set(['rongda', 'haoyi', 'hengbao']);

function CompanyScope({ companies }: { companies: CompanyIntelligence['companies'] }) {
  return <div className="company-scope">{companies.map(company => <div key={company.id}><strong>{company.name}</strong><span>{verificationLabels[company.verification_status] ?? '待核验'}</span>{company.relationship_note && <p>{company.relationship_note}</p>}</div>)}</div>;
}

export function CompanyIntelligencePage() {
  const { api, user, notify } = useWorkspace();
  const [companyId, setCompanyId] = useState('');
  const [category, setCategory] = useState('');
  const [day, setDay] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [submittedRun, setSubmittedRun] = useState<CompanyCollectionRun | null>(null);
  const state = useLoad(useCallback(() => api.getCompanyIntelligence({ company_id: companyId, category, date: day, page: String(page), limit: String(pageSize) }), [api, companyId, category, day, page, pageSize]));
  useEffect(() => {
    if (!state.loading && !state.error && state.data) setPage(previous => Math.min(previous, Math.max(1, Math.ceil(state.data!.total / pageSize))));
  }, [state.loading, state.error, state.data, pageSize]);
  const latestRun = state.data?.runs[0];
  const activeRun = isActive(latestRun) || (isActive(submittedRun) && !state.data?.runs.some(run => run.id === submittedRun?.id));
  const canCollect = user.roles.includes('hq_admin') && !user.roles.includes('hq_executive');
  useEffect(() => {
    if (!activeRun) return;
    const timer = window.setInterval(state.reload, 5000);
    return () => window.clearInterval(timer);
  }, [activeRun, state.reload]);

  async function collect(mode: 'baseline' | 'daily') {
    if (submitting || activeRun) return;
    setSubmitting(true); setActionError('');
    try {
      const run = await api.collectCompanyIntelligence(mode);
      setSubmittedRun(run); state.reload();
      notify(['queued', 'running'].includes(run.status) ? '采集任务已提交' : (stateLabels[run.status] ?? '采集状态已更新'));
    } catch (error) { setActionError(errorText(error)); }
    finally { setSubmitting(false); }
  }

  const data = state.data;
  const additionalCompanies = data?.companies.filter(company => !primaryCompanyIds.has(company.id)) ?? [];
  const briefing = data?.briefings.find(item => !day || item.day === day);
  const filterActive = Boolean(companyId || category || day);
  const clearFilters = () => { setCompanyId(''); setCategory(''); setDay(''); setPage(1); };
  return <div className="page company-intelligence-page">
    <PageHeading title="企业动态" action={<div className="company-actions">
      <button type="button" className="button secondary" onClick={state.reload} disabled={state.loading}><RefreshCw size={16} />刷新</button>
      {canCollect && <><button type="button" className="button secondary" disabled={submitting || activeRun} onClick={() => void collect('baseline')}>历史回填</button><button type="button" className="button primary" disabled={submitting || activeRun} onClick={() => void collect('daily')}>{submitting ? '提交中…' : activeRun ? '采集中…' : '立即更新'}</button></>}
    </div>} />
    {actionError && <ErrorState error={actionError} />}
    {state.error && <ErrorState error={state.error} retry={state.reload} />}
    {data && <>
      <section className="company-summary panel" aria-label="采集概况">
        <div className="company-coverage"><div className="section-heading"><h2>监测范围</h2><span className="company-state">{activeRun ? '采集中' : stateLabels[data.coverage.status] ?? data.coverage.status}</span></div>
          <p>{data.coverage.message}</p>
          <CompanyScope companies={data.companies.filter(company => primaryCompanyIds.has(company.id))} />
          {additionalCompanies.length > 0 && <details className="company-additional-scope"><summary>控股及历史企业（{additionalCompanies.length}）</summary><CompanyScope companies={additionalCompanies} /></details>}
        </div>
        <dl className="company-source-status"><div><dt>天眼 AI</dt><dd>{stateLabels[data.coverage.tianyan_status] ?? data.coverage.tianyan_status}</dd></div><div><dt>每日汇总</dt><dd>{data.coverage.schedule}</dd></div><div><dt>最近采集</dt><dd>{data.coverage.last_run_at ? dateTime(data.coverage.last_run_at, true) : '尚未采集'}</dd></div>
          {latestRun && <div><dt>最近任务</dt><dd>{stateLabels[latestRun.status] ?? latestRun.status}</dd></div>}
        </dl>
      </section>
      {latestRun?.error && <ErrorState error={latestRun.error} />}
      {briefing && <section className="panel company-briefing" aria-label="企业日报"><div><h2>{briefing.day} 日报</h2><p>{briefing.summary}</p><small>全部监测企业 · 按北京时间发现日期统计，历史回填不等于当日发布。</small></div><dl>{(['news', 'business', 'sentiment'] as const).map(kind => <div key={kind}><dt>{categoryLabels[kind]}</dt><dd>{briefing[`${kind}_count`]}</dd></div>)}</dl></section>}
    </>}
    <section className="panel company-records" aria-label="企业信息记录">
      <div className="company-filters">
        <div className="company-filter-field"><label htmlFor="company-filter-company">企业</label><select id="company-filter-company" value={companyId} onChange={event => { setCompanyId(event.target.value); setPage(1); }}><option value="">全部企业</option>{data?.companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></div>
        <div className="company-filter-field"><label htmlFor="company-filter-category">信息类型</label><select id="company-filter-category" value={category} onChange={event => { setCategory(event.target.value); setPage(1); }}><option value="">全部类型</option>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="company-filter-field"><label htmlFor="company-filter-date">发现日期（北京时间）</label><input id="company-filter-date" type="date" value={day} onChange={event => { setDay(event.target.value); setPage(1); }} /></div>
        {filterActive && <button type="button" className="button secondary" onClick={clearFilters}>清除筛选</button>}
      </div>
      {state.loading ? <Loading /> : !state.error && data && <>
        <div className="company-list-heading"><h2>信息记录</h2><span>{data.total} 条</span></div>
        {data.items.length ? <div className="company-record-list">{data.items.map(item => <article key={item.id} className="company-record">
          <div className="company-record-meta"><span className={`company-category company-category-${item.category}`}>{categoryLabels[item.category] ?? item.category}</span><span>{item.company_name}</span><span>{verificationLabels[item.verification_status] ?? '待核验'}</span></div>
          <h3><ExternalLink href={safeUrl(item.source_url)}>{item.title}</ExternalLink></h3>
          <p>{item.summary}</p>
          <div className="company-record-source"><ExternalLink href={safeUrl(item.source_url)}>{item.source_name}</ExternalLink><span>来源日期：{dateTime(item.published_at)}</span><span>发现：{dateTime(item.observed_at, true)}</span></div>
        </article>)}</div> : <Empty title={filterActive ? '没有符合条件的记录' : '暂无企业动态'} text={filterActive ? undefined : '采集结果将在这里展示；未返回记录不代表没有经营或舆情风险。'} action={filterActive ? <button type="button" className="button secondary" onClick={clearFilters}>清除筛选</button> : undefined} />}
        <Pagination label="信息记录分页" page={page} pageSize={pageSize} total={data.total} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} busy={state.loading} />
      </>}
    </section>
  </div>;
}
