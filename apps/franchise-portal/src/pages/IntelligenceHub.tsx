import { Pagination } from '../ui/Pagination';
import { useCursorPagination } from '../ui/useCursorPagination';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Bell, Bookmark, RefreshCw, Search, Sparkles } from 'lucide-react';
import type { Article, IntelligenceFollow, IntelligenceOverview } from '../api/types';
import { Confirm, Empty, ErrorState, ExternalLink, Loading, Modal, PageHeading, SectionHeading, Status } from '../components';
import { dateTime, errorText, safeUrl, sourceNatureLabel, topics, useLoad, useWorkspace } from '../workspace';
import { Presence } from '../ui/Presence';

const sourceStateLabels: Record<string, string> = { pending: '待接入', paused: '已暂停', error: '采集异常', active: '已启用' };

export function IntelligenceMetrics({ data }: { data: IntelligenceOverview }) {
  return <dl className="intelligence-metrics" aria-label="情报资料统计">
    <div><dt>已入库情报</dt><dd>{data.total.toLocaleString('zh-CN')}</dd></div>
    <div><dt>已启用信源</dt><dd>{data.sources.filter(source => source.status === 'active').length}</dd></div>
    <div><dt>我的收藏</dt><dd>{data.saved.toLocaleString('zh-CN')}</dd></div>
    <div><dt>关注内情报</dt><dd>{data.followed.toLocaleString('zh-CN')}</dd></div>
  </dl>;
}

export function IntelligencePage() {
  const { api, notify, user } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const topic = params.get('topic') ?? '';
  const source = params.get('source') ?? '';
  const view = params.get('view') ?? '';
  const search = params.get('q') ?? '';
  const [query, setQuery] = useState(search);
  const [busy, setBusy] = useState(false);
  const filters = useCallback(() => ({ topic, source_id: source, q: search, saved: view === 'saved' ? 'true' : '', followed: view === 'followed' ? 'true' : '', limit: '20' }), [topic, source, search, view]);
  const state = useCursorPagination(useCallback(query => api.getArticles({ ...filters(), ...query }), [api, filters]), JSON.stringify([topic, source, search, view]));
  const summary = useLoad(useCallback(() => api.getIntelligenceOverview(), [api]));
  const follows = useLoad(useCallback(() => api.getIntelligenceFollows(), [api]));
  const selectedId = params.get('article');
  const reset = state.reset;
  function filter(key: string, value: string) { const updated = new URLSearchParams(params); if (value) updated.set(key, value); else updated.delete(key); updated.delete('article'); reset(); setParams(updated); }
  function refreshView() { reset(); state.reload(); summary.reload(); }
  async function toggleSave(article: Article) {
    setBusy(true); try { await api.saveArticle(article.id, !article.saved); notify(article.saved ? '已取消收藏' : '已收藏'); refreshView(); }
    catch (error) { notify(errorText(error), true); } finally { setBusy(false); }
  }
  async function follow(kind: 'topic' | 'source', value: string) {
    setBusy(true); try { const existing = follows.data?.items.find(item => item.kind === kind && item.value === value); if (existing) await api.unfollowIntelligence(existing.id); else await api.followIntelligence({ kind, value }); follows.reload(); refreshView(); notify(existing ? '已取消关注' : '已关注'); }
    catch (error) { notify(errorText(error), true); } finally { setBusy(false); }
  }
  async function collect() { setBusy(true); try { await api.refreshSources(); notify('采集请求已提交，完成后刷新资料'); summary.reload(); } catch (error) { notify(errorText(error), true); } finally { setBusy(false); } }
  const items = state.items;
  const topicCounts = new Map(summary.data?.topics.map(item => [item.topic, item.count]));
  const coverageSources = [...(summary.data?.sources ?? [])].sort((a, b) => Number(b.status === 'active' || b.article_count > 0) - Number(a.status === 'active' || a.article_count > 0) || b.article_count - a.article_count);
  const selectedFollow = follows.data?.items.some(item => item.kind === (source ? 'source' : 'topic') && item.value === (source || topic));
  return <div className="page intelligence-page">
    <PageHeading title="行业情报" action={<div className="inline-actions"><button className="button secondary" onClick={refreshView}><RefreshCw size={16} />刷新</button>{user.permissions.includes('sources:write') && <button className="button primary" disabled={busy} onClick={() => void collect()}>立即采集</button>}</div>} />
    {summary.data && <IntelligenceMetrics data={summary.data} />}
    {summary.error && <ErrorState error={summary.error} retry={summary.reload} />}
    <div className="intelligence-toolbar">
      <div className="topic-tabs" aria-label="情报分类"><button aria-pressed={!topic} className={!topic ? 'selected' : ''} onClick={() => filter('topic', '')}>全部{summary.data && <span>{summary.data.total}</span>}</button>{Object.entries(topics).map(([key, label]) => <button key={key} aria-pressed={topic === key} className={topic === key ? 'selected' : ''} onClick={() => filter('topic', key)}>{label}{topicCounts.has(key) && <span>{topicCounts.get(key)}</span>}</button>)}</div>
      <div className="filter-row intelligence-filter-row"><form className="search-field" onSubmit={event => { event.preventDefault(); filter('q', query.trim()); }}><Search size={18} /><input aria-label="搜索情报" placeholder="搜索标题与摘要" value={query} onChange={event => setQuery(event.target.value)} /><button type="submit">搜索</button></form><label className="source-filter">信源<select value={source} onChange={event => filter('source', event.target.value)}><option value="">全部信源</option>{summary.data?.sources.map(item => <option key={item.id} value={item.id}>{item.name}（{item.article_count}）</option>)}</select></label></div>
      <div className="intelligence-view-row"><div className="segmented-control" aria-label="情报范围">{[['', '全部资料'], ['followed', '我的关注'], ['saved', '我的收藏']].map(([value, label]) => <button key={value} aria-pressed={view === value} className={view === value ? 'selected' : ''} onClick={() => filter('view', value)}>{label}</button>)}</div>{(topic || source) && <button className="button secondary small" disabled={busy || !follows.data} onClick={() => void follow(source ? 'source' : 'topic', source || topic)}><Bell size={15} />{selectedFollow ? '取消关注' : `关注此${source ? '信源' : '专题'}`}</button>}<span className="muted">本页 {items.length} 条</span></div>
    </div>
    <div className="intelligence-layout"><div>
      {state.error ? <ErrorState error={state.error} retry={state.reload} /> : state.loading ? <Loading text="正在读取行业情报…" /> : items.length ? <div className="article-list">{items.map(article => <article className="article-row" key={article.id}><div className="article-date"><span>{article.published_at ? dateTime(article.published_at).slice(5) : '日期未知'}</span><small>{topics[article.topic] ?? article.topic}</small></div><div className="article-main"><button className="article-title" onClick={() => { const updated = new URLSearchParams(params); updated.set('article', article.id); setParams(updated); }}>{article.title}<ArrowUpRight size={18} /></button><p>{article.summary || '来源仅提供标题索引，请阅读原文。'}</p><div className="article-footer"><span>{article.source_name} · {sourceNatureLabel(article.source_nature ?? article.nature)}</span><span>采集 {dateTime(article.fetched_at)}</span>{article.note && <span>有批注</span>}{article.analysis && <span className="ai-label"><Sparkles size={12} />已有解读</span>}</div><div className="article-row-actions"><button className="button quiet small" aria-label={`${article.saved ? '取消收藏' : '收藏'}：${article.title}`} aria-pressed={article.saved} disabled={busy} onClick={() => void toggleSave(article)}><Bookmark size={15} fill={article.saved ? 'currentColor' : 'none'} />{article.saved ? '已收藏' : '收藏'}</button>{user.permissions.includes('research:write') && <Link className="button quiet small" to={`/research?article=${encodeURIComponent(article.id)}`}>研究此条 <ArrowRight size={15} /></Link>}</div></div></article>)}</div> : <Empty title={view === 'saved' ? '还没有收藏情报' : view === 'followed' ? '关注范围内暂无情报' : '没有符合条件的情报'} action={<button className="button secondary" onClick={() => { reset(); setQuery(''); setParams({}); }}>查看全部资料</button>} />}
      <Pagination label="情报列表分页" page={state.page} pageSize={state.pageSize} hasNext={state.hasNext} onPageChange={state.setPage} onPageSizeChange={state.setPageSize} busy={state.loading || busy} />
    </div><aside className="intelligence-side"><section className="home-panel"><SectionHeading title="我的关注" />{follows.error ? <ErrorState error={follows.error} retry={follows.reload} /> : follows.data?.items.length ? <ul className="follow-list">{follows.data.items.map(item => <li key={item.id}><button onClick={() => filter(item.kind === 'source' ? 'source' : 'topic', item.value)}>{item.label}</button><button className="button quiet small" disabled={busy} aria-label={`取消关注：${item.label}`} onClick={() => void follow(item.kind, item.value)}>取消关注</button></li>)}</ul> : <p className="muted">选择专题或信源后，可加入关注。</p>}</section>
      <section className="home-panel"><SectionHeading title="信源覆盖"><Link to="/settings">管理 <ArrowUpRight size={15} /></Link></SectionHeading>{coverageSources.length ? <div className="source-coverage-list">{coverageSources.map(item => <button key={item.id} className={source === item.id ? 'selected' : ''} onClick={() => filter('source', item.id)}><span><strong>{item.name}</strong><small>{sourceNatureLabel(item.nature)} · {sourceStateLabels[item.status] ?? '待核对'}{item.last_error && item.status !== 'error' ? ' · 最近采集异常' : ''}</small></span><b>{item.article_count}</b></button>)}</div> : <p className="muted">暂无已登记信源</p>}{summary.data?.latest_sync_at && <p className="sync-meta">最近同步 {dateTime(summary.data.latest_sync_at, true)}</p>}{summary.data?.sync_error && <p className="source-error">{summary.data.sync_error}</p>}</section>
    </aside></div>
    <Presence present={Boolean(selectedId)}>{selectedId && <ArticleDetail key={selectedId} id={selectedId} onClose={() => { const updated = new URLSearchParams(params); updated.delete('article'); setParams(updated); }} onChange={refreshView} follows={follows.data?.items ?? []} onFollow={() => { follows.reload(); summary.reload(); }} />}</Presence>
  </div>;
}

function ArticleDetail({ id, onClose, onChange, follows, onFollow }: { id: string; onClose: () => void; onChange: () => void; follows: IntelligenceFollow[]; onFollow: () => void }) {
  const { api, notify, user } = useWorkspace();
  const state = useLoad(useCallback(() => api.getArticle(id), [api, id]));
  const [busy, setBusy] = useState(false); const [draft, setDraft] = useState<string | null>(null); const [discard, setDiscard] = useState(false); const [noteError, setNoteError] = useState('');
  const article = state.data; const note = draft ?? article?.note ?? ''; const dirty = !!article && note !== (article.note ?? '');
  const analyzing = !!article && ['queued', 'running'].includes(article.analysis_status); const reload = state.reload;
  useEffect(() => { if (!analyzing) return; const timer = window.setInterval(reload, 5000); return () => window.clearInterval(timer); }, [analyzing, reload]);
  function close() { if (dirty) setDiscard(true); else onClose(); }
  async function saveNote(event: FormEvent) { event.preventDefault(); setBusy(true); setNoteError(''); try { const saved = await api.updateArticleNote(id, note); setDraft(saved.note); state.reload(); onChange(); notify('批注已保存'); } catch (error) { setNoteError(errorText(error)); } finally { setBusy(false); } }
  async function analyze() { setBusy(true); try { await api.analyzeArticle(id); state.reload(); onChange(); notify('分析请求已提交'); } catch (error) { notify(errorText(error), true); } finally { setBusy(false); } }
  async function save() { if (!article) return; setBusy(true); try { await api.saveArticle(id, !article.saved); state.reload(); onChange(); } catch (error) { notify(errorText(error), true); } finally { setBusy(false); } }
  async function followSource() { if (!article) return; setBusy(true); try { const existing = follows.find(item => item.kind === 'source' && item.value === article.source_id); if (existing) await api.unfollowIntelligence(existing.id); else await api.followIntelligence({ kind: 'source', value: article.source_id }); onFollow(); } catch (error) { notify(errorText(error), true); } finally { setBusy(false); } }
  return <><Modal title="情报详情" onClose={close} busy={busy} wide>{state.error ? <ErrorState error={state.error} retry={state.reload} /> : !article ? <Loading /> : <div className="article-detail"><div className="article-footer"><span>{article.source_name} · {sourceNatureLabel(article.source_nature ?? article.nature)}</span><span>{topics[article.topic] ?? article.topic}</span></div><h2>{article.title}</h2><div className="article-times"><span>发布：{dateTime(article.published_at, true)}</span><span>采集：{dateTime(article.fetched_at, true)}</span></div><div className="article-reading-actions"><ExternalLink href={safeUrl(article.url)}>阅读原文</ExternalLink><button className="button secondary small" disabled={busy} onClick={() => void save()}><Bookmark size={15} />{article.saved ? '取消收藏' : '收藏'}</button><button className="button secondary small" disabled={busy} onClick={() => void followSource()}><Bell size={15} />{follows.some(item => item.kind === 'source' && item.value === article.source_id) ? '取消关注信源' : '关注信源'}</button></div>
      <section><h3>{article.content_kind === 'index_only' ? '标题索引' : '来源摘录'}</h3><p className="prose">{article.content || article.summary || '来源未提供正文，请阅读原文。'}</p>{article.snapshot_hash && <small className="snapshot-meta">已保存采集快照 · {article.snapshot_hash.slice(0, 12)}</small>}</section>
      <section className="ai-analysis"><SectionHeading title="AI 解读">{analyzing && <Status value={article.analysis_status} />}</SectionHeading>{article.analysis ? <p className="prose">{article.analysis}</p> : <p>{analyzing ? '正在分析，完成后会显示结果。' : '可基于此条资料生成解读，计入今日共享额度。'}</p>}<small>AI 解读为辅助判断，请结合原文和实际业务核实。</small></section>
      <section><form className="article-note" onSubmit={event => void saveNote(event)}><label htmlFor={`note-${id}`}>我的批注</label><textarea id={`note-${id}`} rows={3} maxLength={4000} value={note} onChange={event => setDraft(event.target.value)} placeholder="记录业务判断、疑问或下一步" aria-describedby={noteError ? `note-error-${id}` : undefined} aria-invalid={!!noteError} />{noteError && <p className="source-error" id={`note-error-${id}`} role="alert">{noteError}</p>}<div><small>批注保存在 CRM，仅自己可见。</small><button type="submit" className="button secondary" disabled={busy || !dirty}>保存批注</button></div></form></section>
      {user.permissions.includes('research:write') && <div className="article-detail-actions"><button className="button secondary" onClick={() => void analyze()} disabled={busy || analyzing}><Sparkles size={16} />{article.analysis ? '重新分析' : '生成解读'}</button><Link className="button primary" to={`/research?article=${encodeURIComponent(article.id)}`} onClick={event => { if (dirty) { event.preventDefault(); setNoteError('请先保存批注，再进入研究。'); } else onClose(); }}>围绕这条信息研究 <ArrowRight size={16} /></Link></div>}
    </div>}</Modal><Presence present={discard}>{discard && <Confirm title="放弃未保存的批注？" onClose={() => setDiscard(false)} onConfirm={onClose}><p>本次编辑尚未保存，关闭后将丢失。</p></Confirm>}</Presence></>;
}
