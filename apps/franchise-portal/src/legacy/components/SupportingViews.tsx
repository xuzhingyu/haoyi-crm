import { Presence } from '../../ui/Presence';
import { Pagination } from '../../ui/Pagination';
import { useClientPagination } from '../../ui/usePagination';
import { useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError, type AuthUser, type Lead, type Opportunity, type Region, type Training, type UserSettings } from '../services/api'
import { ActionDialog, ActionDrawer, ConfirmActionDialog, EntityHistory, FeedbackBanner, StatusActions } from './operations'
import { NetworkCanvas } from './NetworkCanvas'
import { useListPosition, useRecordNavigation, useViewState } from '../hooks/useWorkContext'
import { RecordNavigation, SavedViews } from './operations/WorkContext'
import { BatchFeedbackForm, FollowUpForm, OpportunityForm, TrainingCreateForm } from './operations/WorkForms'
import type { MapViewState } from './networkMapModel'

function useData<T>(load: () => Promise<T>, extra: unknown = 0) {
  const loader = useRef(load); loader.current = load
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    setError(''); setLoading(true)
    loader.current().then((value) => { if (alive) setData(value) }).catch(() => { if (alive) setError('数据暂时无法加载，请重试') }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // extra/tick retrigger fetch; load is read from latest render
  }, [extra, tick])
  return { data, error, loading, setData, reload: () => setTick((value) => value + 1) }
}

function ViewShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="support-view"><header className="topbar"><div><h1>{title}</h1><p>{subtitle}</p></div></header>{children}</section>
}
function State({ error, empty, loading, retry }: { error: string; empty: boolean; loading?: boolean; retry?: () => void }) {
  if (loading) return <p className="view-loading" role="status">正在加载，请稍候…</p>
  return error ? <div className="error-state" role="alert">{error}{retry && <button type="button" onClick={retry}>重新加载</button>}</div> : empty ? <p className="collection-empty">暂无可展示数据，可调整筛选条件或添加记录。</p> : null
}
const statusLabel = (status: string) => ({ active: '进行中', new: '待审核', reviewed: '已审核', dispatched: '待反馈', overdue: '待催问', high_risk: '高风险', decision: '待决策', confirmed: '已反馈', archived: '已归档', voided: '已作废', draft: '草稿', published: '已发布', pending: '待处理', applied: '已确认应用' }[status] ?? status)
function fail(error: unknown) {
  return error instanceof ApiError ? error.detail : '操作失败，请检查输入后重试'
}
function aggregateLeadRegions(leads: Lead[]): Region[] {
  const regions = new Map<string, Region>()
  leads.forEach((lead) => {
    const key = `${lead.province ?? ''}-${lead.city ?? ''}`
    const current = regions.get(key) ?? { province: lead.province, city: lead.city, lead_total: 0, monthly_order_capacity: 0, franchise_total: 0 }
    current.lead_total += 1
    current.monthly_order_capacity += lead.monthly_order_count ?? 0
    regions.set(key, current)
  })
  return [...regions.values()]
}

type ViewProps = { selectedId?: number | null; onOpen?: (id: number | null) => void; user?: AuthUser | null }

export function LeadsView({ selectedId, onOpen, user }: ViewProps) {
  const { data, error, reload, loading } = useData(api.leads)
  const [view, setView] = useViewState('leads', { q: '', mode: '表格', status: '', province: '', city: '', layer: 'network', selectedProvince: '', selectedCity: '' })
  const mode = ['表格', '卡片', '地图'].includes(view.mode) ? view.mode : '表格'
  const setMode = (mode: string) => setView({ mode })
  const query = view.q
  const setQuery = (q: string) => setView({ q })
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [err, setErr] = useState('')
  const [confirm, setConfirm] = useState<'void' | 'archive' | null>(null)
  const [form, setForm] = useState({ shop_name: '', province: '', city: '', source: '手工补录' })
  const canWrite = user?.role !== 'executive'
  const leads = (data ?? []).filter((lead) => (!view.status || (lead.status || 'active') === view.status) && [lead.shop_name, lead.province, lead.city, lead.source].some((value) => value?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
  const pagination = useClientPagination(leads, JSON.stringify([query, view.status]))
  const regions = aggregateLeadRegions(leads)
  const selected = regions.find((region) => region.province === view.selectedProvince && (region.city || '') === view.selectedCity) ?? null
  const setSelected = (region: Region | null) => setView({ selectedProvince: region?.province || '', selectedCity: region?.city || '' })
  const mapView: MapViewState = { level: view.province ? view.city ? 'city' : 'province' : 'national', province: view.province || undefined, city: view.city || undefined, layer: (['network', 'pending', 'focus', 'franchise', 'risk'].includes(view.layer) ? view.layer : 'network') as MapViewState['layer'] }
  const nav = useRecordNavigation('leads', leads, selectedId, onOpen, api.lead)
  const { record: detail, open } = nav
  useListPosition('leads', !loading, nav.id)
  return <ViewShell title="客户线索" subtitle="汽修厂档案与新能源维修基础，支持不同查看方式">
    <div className="view-actions">
      <button onClick={() => setMode('表格')} aria-pressed={mode === '表格'}>表格</button>
      <button onClick={() => setMode('卡片')} aria-pressed={mode === '卡片'}>卡片</button>
      <button onClick={() => setMode('地图')} aria-pressed={mode === '地图'}>地图</button>
    </div>
    <div className="lead-search-row"><label className="search-field"><input aria-label="搜索线索" placeholder="搜索门店、地区或来源" value={query} onChange={(event) => setQuery(event.target.value)} /><span>{leads.length} 条线索</span></label>
    <label className="filter-field">线索状态<select aria-label="线索状态" value={view.status} onChange={(event) => setView({ status: event.target.value })}><option value="">全部状态</option>{[...new Set((data ?? []).map((item) => item.status || 'active'))].map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
    </div><SavedViews route="leads" value={view} onChange={setView} />
    <FeedbackBanner message={message} error={err} />
    {canWrite && <form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (saving) return; setSaving(true); setErr(''); setMessage(''); void api.createLead(form).then(() => { setMessage('线索已保存'); reload() }).catch((error) => setErr(fail(error))).finally(() => setSaving(false)) }}>
      <label>门店名称 <input aria-label="门店名称" placeholder="填写汽修厂名称" value={form.shop_name} onChange={(event) => setForm({ ...form, shop_name: event.target.value })} required /></label>
      <label>省份<input aria-label="省份" placeholder="例如：江苏省" value={form.province} onChange={(event) => setForm({ ...form, province: event.target.value })} /></label>
      <label>城市<input aria-label="城市" placeholder="例如：南京市" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label>
      <button type="submit" disabled={saving}>{saving ? '保存中…' : '新增线索'}</button>
    </form>}
    <State error={error} loading={loading} retry={reload} empty={!!data && !leads.length} />
    {mode === '表格' && !!leads.length && <div className="table-scroll" role="region" aria-label="线索表格，可横向滚动" tabIndex={0}><table><thead><tr><th>汽修厂</th><th>区域</th><th>新能源工位</th><th>月订单</th><th>来源</th></tr></thead><tbody>{pagination.items.map((item) => <tr key={item.id} onClick={() => void open(item.id)}><td><button type="button" className="record-link" onClick={(event) => { event.stopPropagation(); void open(item.id) }}>{item.shop_name}</button></td><td>{[item.province, item.city, item.district].filter(Boolean).join(' / ') || '未提供'}</td><td>{item.new_energy_lifts ?? '未提供'}</td><td>{item.monthly_order_count ?? '未提供'}</td><td>{item.source}</td></tr>)}</tbody></table></div>}
    {mode === '卡片' && <div className="lead-cards">{pagination.items.map((item) => <article key={item.id} data-hy-item-id={`lead:${item.id}`} tabIndex={0} role="button" aria-label={`查看${item.shop_name}`} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void open(item.id) } }} onClick={() => void open(item.id)}><strong>{item.shop_name}</strong><p>{[item.province, item.city].filter(Boolean).join(' / ') || '地区待补充'}</p><small>新能源工位 {item.new_energy_lifts ?? '未提供'} · 月订单 {item.monthly_order_count ?? '未提供'}</small></article>)}</div>}
    {mode === '地图' && (regions.length ? <NetworkCanvas regions={regions} selected={selected} onSelect={setSelected} view={mapView} onViewChange={(next) => setView({ province: next.province || '', city: next.city || '', layer: next.layer || 'network' })} /> : <div className="collection-empty">暂无可用于地图聚合的线索数据</div>)}
    {mode !== '地图' && !loading && !error && <Pagination label="客户线索分页" page={pagination.page} pageSize={pagination.pageSize} total={pagination.total} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />}
    <ActionDrawer title={detail?.shop_name || '线索详情'} open={nav.id !== null} busy={busy} onClose={nav.close}>
      <RecordNavigation nav={nav} busy={busy} />
      {detail && <>
        <p>{[detail.province, detail.city].filter(Boolean).join(' / ')} · {statusLabel(detail.status || 'active')}</p>
        {canWrite && <StatusActions busy={busy} actions={[
          { label: '转商机', onClick: () => void api.convertLead(detail.id, { opportunity_type: 'franchise' }).then(() => setMessage('已转商机')).catch((error) => setErr(fail(error))) },
          { label: '归档', onClick: () => { setErr(''); setConfirm('archive') } },
          { label: '作废', onClick: () => { setErr(''); setConfirm('void') }, danger: true },
        ]} />}
        {canWrite && <FollowUpForm key={detail.id} lead={detail} onBusy={setBusy} onSaved={() => { setMessage('跟进已记录'); nav.reload(); reload() }} onNext={nav.nextId === undefined ? undefined : nav.next} />}
        {(detail.follow_ups ?? []).map((item) => <p key={item.id}>{item.status} · {item.note}{!item.completed_at && canWrite && <button type="button" disabled={busy} onClick={() => void api.completeFollowUp(item.id).then(() => nav.reload()).catch((error) => setErr(fail(error)))}>完成</button>}</p>)}
        <EntityHistory events={detail.history ?? []} />
      </>}
    </ActionDrawer>
    <Presence present={Boolean(confirm)}>{confirm && <ConfirmActionDialog title={confirm === 'void' ? '作废线索' : '归档线索'} error={err} message="正式记录不会删除，只会停止后续跟进。" reasonRequired={confirm === 'void'} onClose={() => setConfirm(null)} onConfirm={(reason) => { if (!detail) return; const run = confirm === 'void' ? api.voidLead(detail.id, reason) : api.archiveLead(detail.id, reason); return run.then(() => { setMessage('已更新状态'); setConfirm(null); nav.close(); reload() }).catch((error) => setErr(fail(error))) }} />}</Presence>
  </ViewShell>
}

export function OpportunitiesView({ selectedId, onOpen, user }: ViewProps) {
  const [view, setView] = useViewState('opportunities', { kind: 'all', q: '', stage: '', mode: '列表' })
  const kind = view.kind
  const setKind = (kind: string) => setView({ kind, stage: '' })
  // Full records retain every business type and lifecycle field.
  const { data, error, loading, reload } = useData(() => api.opportunities('all'))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [err, setErr] = useState('')
  const [confirm, setConfirm] = useState<'close' | 'sign' | null>(null)
  const canWrite = user?.role !== 'executive'
  const opportunities = (data ?? []).filter((item) => (kind === 'all' || !['franchise', 'channel'].includes(kind) || item.opportunity_type === kind) && (!view.stage || item.stage === view.stage) && item.shop_name.toLocaleLowerCase().includes(view.q.trim().toLocaleLowerCase()))
  const pagination = useClientPagination(opportunities, JSON.stringify([kind, view.stage, view.q]))
  const groups = opportunities.reduce<Record<string, Opportunity[]>>((all, item) => ({ ...all, [item.stage]: [...(all[item.stage] ?? []), item] }), {})
  const nav = useRecordNavigation('opportunities', Object.values(groups).flat(), selectedId, onOpen, (id) => { const found = data?.find((item) => item.id === id); return found ? Promise.resolve(found) : Promise.reject(new Error('missing')) })
  const { record: detail } = nav
  const navRef = useRef(nav); navRef.current = nav
  useEffect(() => { if (data && navRef.current.id !== null) navRef.current.reload() }, [data])
  useListPosition('opportunities', !loading, nav.id)
  return <ViewShell title="加盟商机" subtitle="查看合作阶段，明确下一步动作，保留每次推进依据">
    <div className="view-actions"><button aria-pressed={view.mode !== '看板'} onClick={() => setView({mode:'列表'})}>列表</button><button aria-pressed={view.mode === '看板'} onClick={() => setView({mode:'看板'})}>看板</button></div>
    <div className="view-actions"><button onClick={() => setKind('all')} aria-pressed={kind === 'all'}>全部</button><button onClick={() => setKind('franchise')} aria-pressed={kind === 'franchise'}>加盟</button><button onClick={() => setKind('channel')} aria-pressed={kind === 'channel'}>渠道</button></div>
    <div className="filter-row"><label>搜索商机<input aria-label="搜索商机" value={view.q} onChange={(event) => setView({ q: event.target.value })} placeholder="搜索门店名称" /></label><label>商机阶段<select aria-label="商机阶段" value={view.stage} onChange={(event) => setView({ stage: event.target.value })}><option value="">全部阶段</option>{[...new Set((data ?? []).map((item) => item.stage))].map((stage) => <option key={stage}>{stage}</option>)}</select></label><span>{opportunities.length} 条商机</span></div>
    <SavedViews route="opportunities" value={view} onChange={setView} />
    <FeedbackBanner message={message} error={err} />
    <State error={error} loading={loading} retry={reload} empty={!!data && !opportunities.length} />
    {view.mode === '看板' ? <div className="kanban">{Object.entries(groups).map(([stage, items]) => <section key={stage}><h2>{stage} <span>{items.length}</span></h2>{items.map((item) => <article key={item.id} tabIndex={0} role="button" onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); nav.open(item.id) } }} onClick={() => nav.open(item.id)}><strong>{item.shop_name}</strong><p>预计价值 {item.estimated_value.toLocaleString()} 元</p>{item.next_action && <small>下一步 {item.next_action}</small>}</article>)}</section>)}</div> : <div className="table-scroll"><table><thead><tr><th>合作对象</th><th>阶段</th><th>预计价值</th><th>下一步行动</th><th>跟进日期</th></tr></thead><tbody>{pagination.items.map(item=><tr key={item.id}><td><button className="record-link" onClick={()=>nav.open(item.id)}>{item.shop_name}</button></td><td>{item.stage}</td><td>{item.estimated_value.toLocaleString()} 元</td><td>{item.next_action || '待补充'}</td><td>{item.next_action_date || '未约定'}</td></tr>)}</tbody></table></div>}

    {view.mode !== '看板' && !loading && !error && <Pagination label="商机分页" page={pagination.page} pageSize={pagination.pageSize} total={pagination.total} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />}
    <ActionDrawer title={detail?.shop_name || '商机详情'} open={nav.id !== null} busy={busy} onClose={nav.close}>
      <RecordNavigation nav={nav} busy={busy} />
      {detail && <>
        <p>{detail.stage} · {statusLabel(detail.status || 'active')}</p>
        {canWrite && <OpportunityForm key={detail.id} opportunity={detail} stages={(data ?? []).filter((item) => item.opportunity_type === detail.opportunity_type).map((item) => item.stage)} onBusy={setBusy} onSaved={() => { setMessage('商机已更新'); reload() }} onNext={nav.nextId === undefined ? undefined : nav.next} />}
        {canWrite && <StatusActions busy={busy} actions={[{ label: '签约转加盟商', onClick: () => { setErr(''); setConfirm('sign') } }, { label: '失败关闭', onClick: () => { setErr(''); setConfirm('close') }, danger: true }]} />}
      </>}
    </ActionDrawer>
    <Presence present={Boolean(confirm === 'close')}>{confirm === 'close' && <ConfirmActionDialog title="关闭商机" error={err} message="失败关闭必须填写原因，记录将保留。" reasonRequired onClose={() => setConfirm(null)} onConfirm={(reason) => { if (!detail) return; return api.closeOpportunity(detail.id, reason).then(() => { setMessage('商机已关闭'); setConfirm(null); nav.close(); reload() }).catch((error) => setErr(fail(error))) }} />}</Presence>
    <Presence present={Boolean(confirm === 'sign')}>{confirm === 'sign' && <ConfirmActionDialog title="签约转档" error={err} message="将创建加盟商档案、初始交付计划和 30/60/90 回访。" onClose={() => setConfirm(null)} onConfirm={() => { if (!detail) return; return api.signOpportunity(detail.id).then(() => { setMessage('已转加盟商'); setConfirm(null); nav.close(); reload() }).catch((error) => setErr(fail(error))) }} />}</Presence>
  </ViewShell>
}

export function TrainingsView({ selectedId, onOpen, user, franchiseId, onReturnToFranchise }: ViewProps & { franchiseId?: number | null; onReturnToFranchise?: () => void }) {
  const { data, error, reload, loading } = useData(api.trainings)
  const [message, setMessage] = useState('')
  const [err, setErr] = useState('')
  const [detail, setDetail] = useState<Training | null>(null)
  const [confirm, setConfirm] = useState(false)
  const canWrite = user?.role !== 'executive'
  const trainings = useMemo(() => data ?? [], [data])
  const pagination = useClientPagination(trainings)
  useEffect(() => { if (selectedId) setDetail(trainings.find((item) => item.id === selectedId) ?? null) }, [selectedId, trainings])
  return <ViewShell title="培训交付" subtitle="已授课不等于已应用；应用确认与 30/60/90 天回访在加盟商中心维护">
    <FeedbackBanner message={message} error={err} />
    {onReturnToFranchise && <button type="button" onClick={onReturnToFranchise}>返回来源加盟商</button>}
    {canWrite && <TrainingCreateForm key={franchiseId ?? 'unlinked'} franchiseId={franchiseId} onSaved={() => { setMessage('培训已安排'); reload() }} />}
    <State error={error} loading={loading} retry={reload} empty={!!data && !trainings.length} />
    <div className="delivery-list">{pagination.items.map((item) => <article key={item.id} tabIndex={0} role="button" onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setDetail(item); onOpen?.(item.id) } }} onClick={() => { setDetail(item); onOpen?.(item.id) }}><strong>{item.training_name}</strong><p>{item.shop_name ?? '未关联门店'}</p><span className={item.status === '已完成' ? 'tag green-tag' : 'tag'}>{item.status}</span><small>{item.completed_at ? `完成于 ${item.completed_at}` : '尚未完成，需安排跟进'}</small></article>)}</div>
    {!loading && !error && <Pagination label="培训记录分页" page={pagination.page} pageSize={pagination.pageSize} total={pagination.total} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />}
    <ActionDialog title={detail?.training_name || '培训详情'} open={Boolean(detail)} onClose={() => { setDetail(null); onOpen?.(null) }}>
      {detail && canWrite && <StatusActions actions={[
        { label: '标记已授课', onClick: () => void api.completeTraining(detail.id).then(() => { setMessage('已授课'); reload() }), disabled: detail.status !== '待安排', reason: '仅待安排课程可完成授课' },
        { label: '取消', onClick: () => setConfirm(true), disabled: detail.status !== '待安排', reason: '已结束课程不可取消', danger: true },
      ]} />}
    </ActionDialog>
    <Presence present={Boolean(confirm && detail)}>{confirm && detail && <ConfirmActionDialog title="取消培训" error={err} message="取消后课程不再计入待安排。" reasonRequired onClose={() => setConfirm(false)} onConfirm={(reason) => api.cancelTraining(detail.id, reason).then(() => { setMessage('培训已取消'); setConfirm(false); reload() }).catch((error) => setErr(fail(error)))} />}</Presence>
  </ViewShell>
}

export function KnowledgeView({ user }: ViewProps) {
  const [query, setQuery] = useState('')
  const { data, error, reload, loading } = useData(() => api.knowledge(query), query)
  const [message, setMessage] = useState('')
  const [err, setErr] = useState('')
  const canWrite = user?.role !== 'executive'
  const docs = data ?? []
  const pagination = useClientPagination(docs, query)
  return <ViewShell title="知识库" subtitle="加盟政策、培训资料与成功案例，AI 回答仅引用已入库资料">
    <FeedbackBanner message={message} error={err} />
    <input aria-label="搜索知识" placeholder="搜索标题或正文" value={query} onChange={(event) => setQuery(event.target.value)} />
    {canWrite && <form className="stack-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void api.createKnowledge({ title: String(form.get('title')), category: String(form.get('category')), content: String(form.get('content')), status: 'draft' }).then(() => { setMessage('草稿已保存'); reload() }).catch((error) => setErr(fail(error))) }}>
      <label>知识标题<input name="title" aria-label="知识标题" placeholder="填写便于检索的标题" required /></label>
      <label>知识分类<input name="category" aria-label="知识分类" placeholder="例如：加盟政策、培训资料" required /></label>
      <label>知识正文<textarea name="content" aria-label="知识正文" placeholder="填写或粘贴资料正文" required /></label>
      <button type="submit">新增草稿</button>
    </form>}
    <State error={error} loading={loading} retry={reload} empty={!!data && !docs.length} />
    <div className="knowledge-list">{pagination.items.map((item) => <article key={item.id}><span className="tag">{item.category}{item.version ? ` · ${item.version}` : ''}</span><h2>{item.title}</h2><p>{item.content}</p><small>更新于 {new Date(item.updated_at).toLocaleDateString('zh-CN')}{item.status ? ` · ${statusLabel(item.status)}` : ''}</small>{canWrite && item.status === 'draft' && <button type="button" onClick={() => void api.publishKnowledge(item.id).then(() => { setMessage('已发布新版本'); reload() })}>发布</button>}</article>)}</div>
    {!loading && !error && <Pagination label="知识文档分页" page={pagination.page} pageSize={pagination.pageSize} total={pagination.total} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />}
  </ViewShell>
}

export function ReportsView({ user }: ViewProps) {
  const { data, error, reload, loading } = useData(api.reports)
  const [message, setMessage] = useState('')
  const [err, setErr] = useState('')
  const [period, setPeriod] = useState('本月')
  const canWrite = user?.role !== 'executive'
  const reports = data ?? []
  const pagination = useClientPagination(reports)
  return <ViewShell title="报告中心" subtitle="经营报告来自同一聚合快照，可下载 PPT/PDF">
    <FeedbackBanner message={message} error={err} />
    {canWrite && <div className="view-actions">
      <select aria-label="报告周期" value={period} onChange={(event) => setPeriod(event.target.value)}><option>本月</option><option>上月</option><option>本季度</option></select>
      <button type="button" onClick={() => void api.report(period).then(() => { setMessage('草稿已生成'); reload() }).catch((error) => setErr(fail(error)))}>生成草稿</button>
    </div>}
    <State error={error} loading={loading} retry={reload} empty={!!data && !reports.length} />
    <div className="report-list">{pagination.items.map((item) => <article key={item.id}><strong>{item.report_name}</strong><p>数据周期：{item.period}{item.published ? ' · 已发布' : ' · 草稿'}{item.published_at ? ` · ${item.published_at}` : ''}</p><a href={item.pdf_url} download>PDF</a><a href={item.pptx_url} download>PPT</a>{canWrite && !item.published && !item.voided && <button type="button" onClick={() => void api.publishReport(item.id).then(() => { setMessage('报告已发布并冻结快照'); reload() })}>发布</button>}</article>)}</div>
    {!loading && !error && <Pagination label="报告快照分页" page={pagination.page} pageSize={pagination.pageSize} total={pagination.total} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />}
  </ViewShell>
}

export function BatchesView({ selectedId, onOpen, user }: ViewProps) {
  const { data, error, reload, loading } = useData(api.batches)
  const [view, setView] = useViewState('batches', { q: '', status: '' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const canWrite = user?.role !== 'executive'
  const batches = (data ?? []).filter((item) => (!view.status || (view.status === 'pending' ? ['new', 'reviewed'].includes(item.status) : view.status === 'late7' ? ['high_risk', 'decision'].includes(item.status) : item.status === view.status)) && `${item.id} ${item.target_region || ''} ${item.franchise_code || ''}`.toLocaleLowerCase().includes(view.q.trim().toLocaleLowerCase()))
  const pagination = useClientPagination(batches, JSON.stringify([view.status, view.q]))
  const nav = useRecordNavigation('batches', batches, selectedId, onOpen, api.batch)
  const { record: selected, setRecord: setSelected, open } = nav
  useListPosition('batches', !loading && !nav.loading, nav.id, true)
  const dispatch = async (franchiseId: number) => {
    if (!selected) return
    try { setSelected(await api.dispatchBatch(selected.id, franchiseId)); setMessage('已分发'); reload() }
    catch (error) { setMessage(fail(error)) }
  }
  const status = selected?.status
  return <ViewShell title="批次与线索" subtitle="Excel 导入形成可追溯批次，检查后整批分发，微信反馈需确认后才入账">
    <div className="filter-row"><label>搜索批次<input aria-label="搜索批次" placeholder="批次号、地区或加盟商编号" value={view.q} onChange={(event) => setView({ q: event.target.value })} /></label><label>批次状态<select aria-label="批次状态" value={view.status} onChange={(event) => setView({ status: event.target.value })}><option value="">全部状态</option><option value="pending">待分发</option><option value="late7">超过七天未反馈</option>{[...new Set((data ?? []).map((item) => item.status))].map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label><span>{batches.length} 个批次</span></div>
    <SavedViews route="batches" value={view} onChange={setView} presets={[{ name: '全部批次', value: { q: '', status: '' } }, { name: '待分发', value: { q: '', status: 'pending' } }, { name: '超过七天未反馈', value: { q: '', status: 'late7' } }]} />
    <State error={error} loading={loading} retry={reload} empty={!!data && !batches.length} />
    <FeedbackBanner message={message} />
    <div className="split-view">
      <div className="report-list">{pagination.items.map((item) => <article key={item.id}><strong>批次 {item.id}</strong><p>{item.target_region || '未识别区域'} · {statusLabel(item.status)}</p><small>{item.row_count} 行{item.franchise_code ? ` · ${item.franchise_code}` : ''}</small><button onClick={() => void open(item.id)}>查看详情</button></article>)}</div>
      {nav.id !== null && <section className="detail-panel">
        <RecordNavigation nav={nav} busy={busy} />
        {selected && <div key={selected.id} className="record-content">
        <h2>批次 {selected.id}</h2>
        <p>{statusLabel(selected.status)} · {selected.quality || '未评价'}</p>
        <details className="batch-rows"><summary>查看门店明细 · {selected.rows?.length ?? selected.row_count} 行</summary><div className="batch-row-list">{selected.rows?.map((row) => <p key={row.id}>{row.shop_name} · 第 {row.source_row} 行</p>)}</div></details>
        {canWrite && status === 'new' && <button type="button" disabled={busy} onClick={() => void api.reviewBatch(selected.id).then((item) => { setSelected(item); setMessage('已审核'); reload() })}>审核</button>}
        {canWrite && selected.candidates?.map((item) => <button key={item.franchise_id} disabled={busy || Boolean(item.conflict) || !['new', 'reviewed'].includes(selected.status)} title={item.conflict || undefined} onClick={() => void dispatch(item.franchise_id)}>{item.franchise_code} {item.conflict || item.reason}</button>)}
        {canWrite && <BatchFeedbackForm key={selected.id} batch={selected} onBusy={setBusy} onSaved={() => { setMessage('反馈已确认入账'); nav.reload(); reload() }} />}
        {canWrite && selected.confirmed_feedback && ['较差', '一般', '较好'].map((quality) => <button key={quality} type="button" disabled={busy} onClick={() => void api.setBatchQuality(selected.id, quality, '人工评价').then(setSelected)}>{quality}</button>)}
        {canWrite && selected.status === 'confirmed' && <button type="button" disabled={busy} onClick={() => void api.archiveBatch(selected.id).then((item) => { setSelected(item); setMessage('已归档'); reload() })}>归档</button>}
      </div>}</section>}
    </div>
    {!loading && !error && <Pagination label="批次分页" page={pagination.page} pageSize={pagination.pageSize} total={pagination.total} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />}
  </ViewShell>
}

export { FranchisesView } from './FranchisesView'

export function NotificationsView() {
  const { data, error, reload, loading } = useData(api.notifications)
  const [actionError, setActionError] = useState('')
  const [pending, setPending] = useState(false)
  const run = async (action: () => Promise<unknown>) => { setPending(true); setActionError(''); try { await action(); reload() } catch (cause) { setActionError(fail(cause)) } finally { setPending(false) } }
  const items = data ?? []
  const pagination = useClientPagination(items)
  return <ViewShell title="通知中心" subtitle="逾期跟进、待分发批次和到期动作会汇总到这里">
    <div className="view-actions"><button type="button" disabled={pending} onClick={() => void run(api.readAllNotifications)}>全部已读</button></div>
    <FeedbackBanner error={actionError} />
    <State error={error} loading={loading} retry={reload} empty={!!data && !items.length} />
    <div className="report-list">{pagination.items.map((item) => <article key={item.id}><strong>{item.title}</strong><p>{item.detail}</p><small>{item.read_at ? '已读' : '未读'}</small>{item.href && <a href={item.href}>查看来源</a>}<button type="button" disabled={pending} onClick={() => void run(() => api.readNotification(item.id))}>标为已读</button><button type="button" disabled={pending} onClick={() => void run(() => api.archiveNotification(item.id))}>归档</button></article>)}</div>
    {!loading && !error && <Pagination label="通知分页" page={pagination.page} pageSize={pagination.pageSize} total={pagination.total} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />}
  </ViewShell>
}

export function SettingsView({ user }: ViewProps) {
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const load = () => { setError(''); void api.settings().then(setSettings).catch(() => setError('设置暂时无法加载，请重试')) }
  useEffect(() => { load() }, [])
  if (!settings) return <ViewShell title="系统设置" subtitle="默认周期、提醒与通知偏好"><State error={error} empty={false} loading={!error} retry={load} /></ViewShell>
  return <ViewShell title="系统设置" subtitle="默认周期、提醒与通知偏好">
    <FeedbackBanner message={message} error={error} />
    <section className="settings-card" aria-label="使用偏好">
    <p className="settings-account">当前账号：{user?.display_name || '林'} · {user?.role === 'executive' ? '领导只读账号' : '经营账号'}</p>
    <form className="stack-form" onSubmit={(event) => { event.preventDefault(); if (pending) return; setPending(true); setError(''); setMessage(''); void api.saveSettings(settings).then((value) => { setSettings(value); setMessage('设置已保存') }).catch(() => setError('设置保存失败，填写内容已保留，请重试')).finally(() => setPending(false)) }}>
      <label>默认周期<select aria-label="默认周期" value={settings.default_period} onChange={(event) => setSettings({ ...settings, default_period: event.target.value })}><option>本月</option><option>上月</option><option>本季度</option></select></label>
      <label>提前提醒天数<input aria-label="提前提醒天数" type="number" value={settings.reminder_days} onChange={(event) => setSettings({ ...settings, reminder_days: Number(event.target.value) })} /></label>
      <label className="checkbox-field"><input type="checkbox" checked={settings.notify_overdue} onChange={(event) => setSettings({ ...settings, notify_overdue: event.target.checked })} />逾期跟进通知</label>
      <label className="checkbox-field"><input type="checkbox" checked={settings.notify_batches} onChange={(event) => setSettings({ ...settings, notify_batches: event.target.checked })} />批次待办通知</label>
      <button type="submit" disabled={pending}>{pending ? '保存中…' : '保存设置'}</button>
    </form>
    </section>
  </ViewShell>
}
