import type { Research } from '../api/types';
import { Pagination } from '../ui/Pagination';
import { useCursorPagination } from '../ui/useCursorPagination';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Bell, FileText, Link2, Plus, RefreshCw, Send } from 'lucide-react';
import { Empty, ErrorState, Loading, PageHeading, SectionHeading, Status } from '../components';
import { dateTime, errorText, isRunning, money, useLoad, useWorkspace } from '../workspace';

const researchTopics = [
  { title: '新能源车险', question: '根据已采集资料，梳理新能源车险和理赔服务的最新变化，列明政策依据、适用时间及浩宜可跟进的事项。' },
  { title: '三电维修', question: '根据已采集资料，梳理动力电池检测、三电维修与回收政策，对比要求并指出维修门店需要补齐的能力。' },
  { title: '服务网络', question: '根据已采集资料，比较保险与汽车企业的维修服务网络布局，整理合作机会、证据和待核实问题。' },
  { title: '经营行动清单', question: '结合授权经营汇总和相关情报，识别当前优先事项，形成可执行的内部跟进清单，区分事实和建议。', business: true },
];

export function ResearchPage() {
  const { api, notify, user } = useWorkspace(); const navigate = useNavigate(); const [params] = useSearchParams();
  const [question, setQuestion] = useState(params.get('question') ?? ''); const [createTask, setCreateTask] = useState(true); const [watch, setWatch] = useState(false); const [business, setBusiness] = useState(false);
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState(''); const [watchOnly, setWatchOnly] = useState(false);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const filters = useCallback(() => ({ limit: '20', status, watch: watchOnly ? 'true' : '' }), [status, watchOnly]);
  const state = useCursorPagination(useCallback(query => api.getResearch({ ...filters(), ...query }), [api, filters]), JSON.stringify([status, watchOnly]));
  const evidence = useLoad(useCallback(() => api.getArticles({ limit: '4' }), [api]));
  const reload = state.reload; const active = state.data?.items.some(item => isRunning(item.status));
  useEffect(() => { if (!active) return; const timer = window.setInterval(reload, 8000); return () => window.clearInterval(timer); }, [active, reload]);
  function reset() { state.reset(); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!question.trim() || busy) return; setBusy(true);
    try { const result = await api.createResearch({ question: question.trim(), article_ids: params.get('article') ? [params.get('article')!] : [], create_task: createTask, watch, include_business_context: business }); navigate(`/research/${result.id}`); }
    catch (error) { notify(errorText(error), true); } finally { setBusy(false); }
  }
  async function toggleWatch(item: Research) { setBusy(true); try { await api.watchResearch(item.id, !item.watch); reset(); state.reload(); notify(item.watch ? '已停止每日关注' : '已开启每日关注'); } catch (error) { notify(errorText(error), true); } finally { setBusy(false); } }
  const items = state.items;
  return <div className="page research-page research-hub"><PageHeading title="AI 研究" action={<Link className="button secondary" to="/intelligence">查看资料 <ArrowUpRight size={16} /></Link>} />
    <div className="research-start-layout"><section><div className="research-topic-grid" aria-label="研究专题">{researchTopics.map(item => <button key={item.title} onClick={() => { setQuestion(item.question); setBusiness(!!item.business && user.permissions.includes('crm:read')); questionRef.current?.focus(); }}><span>{item.title}</span><Plus size={16} /></button>)}</div>
      <form className="research-composer" onSubmit={event => void submit(event)}><label htmlFor="research-question">研究问题</label><textarea id="research-question" ref={questionRef} placeholder="写下要研究的问题，报告将保留引用依据" value={question} onChange={event => setQuestion(event.target.value)} maxLength={4000} rows={4} required />{params.get('article') && <div className="context-chip"><Link2 size={14} />已关联一条行业情报</div>}<footer><div className="research-options"><label className="check-label"><input type="checkbox" checked={watch} onChange={event => setWatch(event.target.checked)} />每日持续关注</label><label className="check-label"><input type="checkbox" checked={createTask} onChange={event => setCreateTask(event.target.checked)} />允许生成内部待办</label>{user.permissions.includes('crm:read') && <label className="check-label"><input type="checkbox" checked={business} onChange={event => setBusiness(event.target.checked)} />结合经营汇总</label>}</div><button className="button primary" type="submit" disabled={busy || !question.trim()}><Send size={17} />{busy ? '提交中…' : '开始研究'}</button></footer></form><p className="research-note">计入每日共享 AI 额度；经营数据仅使用脱敏汇总，正式业务变更需人工确认。</p>
    </section><aside className="home-panel research-evidence"><SectionHeading title="可用资料"><Link to="/intelligence">全部 <ArrowUpRight size={15} /></Link></SectionHeading>{evidence.error ? <ErrorState error={evidence.error} retry={evidence.reload} /> : evidence.loading ? <Loading /> : evidence.data?.items.length ? evidence.data.items.map(article => <Link key={article.id} to={`/intelligence?article=${encodeURIComponent(article.id)}`}><h3>{article.title}</h3><small>{article.source_name} · {dateTime(article.published_at)}</small></Link>) : <Empty title="尚无采集资料" action={<Link className="quiet-link" to="/settings">查看信源状态</Link>} />}</aside></div>
    <section className="research-history"><SectionHeading title="研究记录"><button className="button secondary small" onClick={() => { reset(); state.reload(); }}><RefreshCw size={14} />刷新</button></SectionHeading><div className="research-history-filters"><div className="segmented-control" aria-label="研究范围"><button aria-pressed={!watchOnly} className={!watchOnly ? 'selected' : ''} onClick={() => { reset(); setWatchOnly(false); }}>全部研究</button><button aria-pressed={watchOnly} className={watchOnly ? 'selected' : ''} onClick={() => { reset(); setWatchOnly(true); }}><Bell size={15} />持续关注</button></div><label>状态<select value={status} onChange={event => { reset(); setStatus(event.target.value); }}><option value="">全部状态</option><option value="queued">排队中</option><option value="running">进行中</option><option value="completed">已完成</option><option value="blocked">等待处理</option><option value="failed">未完成</option><option value="cancelled">已停止</option></select></label></div>
      {state.error ? <ErrorState error={state.error} retry={state.reload} /> : state.loading && !state.data ? <Loading /> : items.length ? <div>{items.map(item => <article className="research-record" key={item.id}><Link className="research-history-row" to={`/research/${item.id}`}><FileText size={20} /><div><h3 title={item.title || item.question}>{item.title || item.question}</h3><p>{dateTime(item.created_at, true)} · {money(item.cost_cny)}{item.include_business_context ? ' · 含经营汇总' : ''}</p>{item.phase && <small>{item.phase}</small>}</div><Status value={item.status} /><ArrowUpRight size={17} /></Link><button className="button quiet small" disabled={busy} aria-label={`${item.watch ? '停止每日关注' : '每日关注'}：${item.title || item.question}`} aria-pressed={!!item.watch} onClick={() => void toggleWatch(item)}><Bell size={15} />{item.watch ? '已关注 · 关闭' : '每日关注'}</button></article>)}</div> : <Empty title={watchOnly ? '还没有持续关注的专题' : status ? '当前状态下暂无研究' : '从一个业务问题开始'} text={watchOnly ? '选择一个研究开启每日关注，后续结果会继续保留。' : undefined} />}
    <Pagination label="研究记录分页" page={state.page} pageSize={state.pageSize} hasNext={state.hasNext} onPageChange={state.setPage} onPageSizeChange={state.setPageSize} busy={state.loading || busy} /></section>
  </div>;
}
