import { useEffect, useId, useRef, useState } from 'react'
import { Pagination } from '../../ui/Pagination'
import { Presence } from '../../ui/Presence'
import { useClientPagination } from '../../ui/usePagination'
import { isThisWeek, useFormDraft, useListPosition, useRecordNavigation, useViewState } from '../hooks/useWorkContext'
import { api, ApiError, type AuthUser, type FranchiseProfile } from '../services/api'
import { ActionDialog, ActionDrawer, ConfirmActionDialog, FeedbackBanner } from './operations'
import { DraftNotice, RecordNavigation, SavedViews } from './operations/WorkContext'
import './franchises.css'

const deliveryLabels: Record<string, string> = {
  planned: '待安排', unknown: '待确认', applied: '已确认应用', issue: '存在问题',
  completed: '已完成', done: '已完成', in_progress: '进行中', cancelled: '已取消',
}
const milestoneLabels: Record<string, string> = { d30: '30 天回访', d60: '60 天回访', d90: '90 天回访', monthly: '月度回访' }
const statusLabel = (value: string) => ({ active: '进行中', archived: '已归档', closed: '已关闭' }[value] ?? value)
const fail = (error: unknown) => error instanceof ApiError ? error.detail : '操作失败，请重试'
const regionLabel = (item: { province: string | null; city: string | null }) => [item.province, item.city].filter(Boolean).join(' / ') || '地区未提供'
const nameOf = (item: FranchiseProfile) => item.shop_name || item.franchise_code
function nextVisit(item: FranchiseProfile) {
  return item.support.filter(visit => !visit.completed_on).sort((a, b) => (a.due_on || '9999').localeCompare(b.due_on || '9999'))[0]
}
function Badge({ children, tone = 'neutral' }: { children: string; tone?: 'neutral' | 'info' | 'success' | 'warning' }) {
  return <span className={`franchise-badge franchise-badge-${tone}`}>{children}</span>
}

/** The draft is scoped to the account, franchise and browser tab, as other CRM forms are. */
function TerritoryDialog({ franchise, onClose, onSaved }: { franchise: FranchiseProfile; onClose: () => void; onSaved: (item: FranchiseProfile) => void }) {
  const draft = useFormDraft(`territory:${franchise.id}`, { province: '', city: '', exclusive: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [discard, setDiscard] = useState(false)
  const submitting = useRef(false)
  const closeAfterDiscard = useRef(false)
  const provinceRef = useRef<HTMLInputElement>(null)
  const errorId = useId()
  const formId = useId()
  const dirty = Object.values(draft.value).some(Boolean)
  const requestClose = () => { if (!submitting.current) { if (dirty) setDiscard(true); else onClose() } }
  const submit = async () => {
    if (submitting.current || draft.pending) return
    if (!draft.value.province.trim()) { setError('请填写授权省份'); provinceRef.current?.focus(); return }
    submitting.current = true; setBusy(true); setError('')
    try {
      const item = await api.addTerritory(franchise.id, { province: draft.value.province.trim(), city: draft.value.city.trim(), exclusive: draft.value.exclusive === 'yes' })
      draft.clear(); onSaved(item); onClose()
    } catch (cause) { setError(fail(cause)) }
    finally { submitting.current = false; setBusy(false) }
  }
  return <>
    <ActionDialog title="新增授权" open onClose={requestClose} busy={busy} className="franchise-territory-dialog" footer={<>
      <button type="button" onClick={requestClose} disabled={busy}>取消</button>
      <button type="submit" form={formId} className="primary" disabled={busy || Boolean(draft.pending)}>{busy ? '保存中…' : '保存授权'}</button>
    </>}>
      <p className="franchise-form-subject">{nameOf(franchise)}</p>
      <form id={formId} className="franchise-territory-form" aria-busy={busy} onSubmit={event => { event.preventDefault(); void submit() }}>
        <DraftNotice draft={draft} />
        <fieldset disabled={busy || Boolean(draft.pending)}>
          <label>授权省份 <span className="required-mark">*</span><input ref={provinceRef} name="province" aria-label="授权省份" required value={draft.value.province} placeholder="例如：江苏省" aria-invalid={Boolean(error) || undefined} aria-describedby={error ? errorId : undefined} onChange={event => { draft.change({ province: event.target.value }); setError('') }} /></label>
          <label>授权城市<input name="city" aria-label="授权城市" value={draft.value.city} placeholder="例如：南京市" onChange={event => draft.change({ city: event.target.value })} /></label>
          <label className="franchise-checkbox"><input type="checkbox" name="exclusive" checked={draft.value.exclusive === 'yes'} onChange={event => draft.change({ exclusive: event.target.checked ? 'yes' : '' })} />独家授权</label>
        </fieldset>
        {error && <p className="action-error" id={errorId} role="alert">{error}</p>}
      </form>
    </ActionDialog>
    <Presence present={discard} onExited={() => { if (closeAfterDiscard.current) onClose() }}>{discard && <ConfirmActionDialog title="放弃未保存的授权？" message="本次填写的授权尚未提交，放弃后将清除这些内容。" confirmLabel="放弃修改" cancelLabel="继续编辑" onClose={() => setDiscard(false)} onConfirm={() => { draft.clear(); closeAfterDiscard.current = true; setDiscard(false) }} />}</Presence>
  </>
}

type Props = { selectedId?: number | null; onOpen?: (id: number | null) => void; user?: AuthUser | null; onCreateTraining?: (id: number) => void }
export function FranchisesView({ selectedId, onOpen, user, onCreateTraining }: Props) {
  const [data, setData] = useState<FranchiseProfile[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const [view, setView] = useViewState('franchises', { q: '', status: '', revisit: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [feedbackId, setFeedbackId] = useState<number | null>(selectedId ?? null)
  const [closeFor, setCloseFor] = useState<FranchiseProfile | null>(null)
  const [territoryFor, setTerritoryFor] = useState<FranchiseProfile | null>(null)
  const submitting = useRef(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const focusFrame = useRef<number | undefined>(undefined)
  useEffect(() => () => { if (focusFrame.current !== undefined) cancelAnimationFrame(focusFrame.current) }, [])
  const canWrite = user?.role !== 'executive'
  useEffect(() => {
    let alive = true
    setLoading(true); setLoadError('')
    void api.franchises().then(items => { if (alive) setData(items) })
      .catch(() => { if (alive) setLoadError('加盟商档案暂时无法加载，请重试') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [tick])
  const franchises = (data ?? []).filter(item => (!view.status || item.status === view.status)
    && (view.revisit !== 'week' || item.support.some(visit => !visit.completed_on && isThisWeek(visit.due_on)))
    && `${item.shop_name || ''} ${item.province || ''} ${item.city || ''} ${item.franchise_code}`.toLocaleLowerCase().includes(view.q.trim().toLocaleLowerCase()))
  const pagination = useClientPagination(franchises, JSON.stringify([view.status, view.revisit, view.q]))
  const nav = useRecordNavigation('franchises', franchises, selectedId, onOpen, api.franchise)
  const selected = nav.record
  const activeId = useRef(nav.id); activeId.current = nav.id
  // Browser history can change the selection while a modal has made the page inert.
  if (feedbackId !== nav.id) { setFeedbackId(nav.id); setCloseFor(null); setError(''); setMessage('') }
  useListPosition('franchises', !loading && !nav.loading, nav.id)
  const updateRecord = (item: FranchiseProfile) => {
    if (activeId.current === item.id) nav.setRecord(item)
    setData(items => items?.map(previous => previous.id === item.id ? item : previous) ?? null)
  }
  const run = async (key: string, action: () => Promise<FranchiseProfile>, success: string) => {
    if (submitting.current) return false
    const recordId = activeId.current
    submitting.current = true; setBusy(key); setError(''); setMessage('')
    try { updateRecord(await action()); if (activeId.current === recordId) setMessage(success); return true }
    catch (cause) { if (activeId.current === recordId) setError(fail(cause)); return false }
    finally { submitting.current = false; setBusy('') }
  }
  const open = (id: number) => { if (!submitting.current) { setError(''); setMessage(''); nav.open(id) } }
  const close = () => { if (!submitting.current) { setError(''); nav.close() } }
  const restoreListFocus = () => {
    // Presence calls onExited before the overlay's cleanup restores its original trigger.
    focusFrame.current = requestAnimationFrame(() => {
      if (document.activeElement === document.body) searchRef.current?.focus({ preventScroll: true })
    })
  }
  const changeRecord = (direction: 'next' | 'previous') => { if (!submitting.current) { setError(''); setMessage(''); nav[direction]() } }
  const next = selected ? nextVisit(selected) : undefined
  const application = selected?.delivery.find(item => item.kind === 'application' && item.status !== 'applied')
  const primaryAction = application ? `delivery:${application.id}` : next ? `support:${next.id}` : onCreateTraining ? 'training' : 'territory'
  return <section className="support-view franchise-workspace">
    <header className="topbar"><h1>加盟商中心</h1></header>
    <div className="franchise-list-panel">
      <div className="filter-row">
        <label>搜索加盟商档案<input ref={searchRef} aria-label="搜索加盟商档案" placeholder="门店名称、地区或编号" value={view.q} onChange={event => setView({ q: event.target.value })} /></label>
        <label>加盟商状态<select aria-label="加盟商状态" value={view.status} onChange={event => setView({ status: event.target.value })}><option value="">全部状态</option>{[...new Set((data ?? []).map(item => item.status))].map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
        <label>回访时间<select aria-label="回访时间" value={view.revisit} onChange={event => setView({ revisit: event.target.value })}><option value="">全部回访</option><option value="week">本周待回访</option></select></label>
        {!loading && !loadError && <span className="franchise-result-count">{franchises.length} 家加盟商</span>}
      </div>
      <SavedViews route="franchises" value={view} onChange={setView} presets={[{ name: '全部加盟商', value: { q: '', status: '', revisit: '' } }, { name: '本周待回访', value: { q: '', status: '', revisit: 'week' } }]} />
      {view.revisit === 'week' && <p className="filter-hint">按上海时区，本周一至周日到期且尚未完成的回访。</p>}
      {loading ? <p role="status" className="collection-empty">正在加载加盟商档案…</p> : loadError ? <div role="alert" className="error-state">{loadError}<button type="button" onClick={() => setTick(value => value + 1)}>重新加载</button></div> : <>
        {franchises.length ? <table className="franchise-table">
          <caption className="franchise-sr-only">加盟商档案</caption>
          <thead><tr><th scope="col">加盟商</th><th scope="col">所在地区</th><th scope="col">状态</th><th scope="col">下次回访</th><th scope="col">操作</th></tr></thead>
          <tbody>{pagination.items.map(item => {
            const visit = nextVisit(item)
            return <tr key={item.id} className={nav.id === item.id ? 'is-selected' : undefined} aria-current={nav.id === item.id ? 'true' : undefined}>
              <th scope="row"><strong>{nameOf(item)}</strong><small>{item.franchise_code}</small></th>
              <td data-label="所在地区">{regionLabel(item)}</td>
              <td data-label="状态"><Badge tone={['已关闭', '已归档', 'closed', 'archived'].includes(item.status) ? 'neutral' : 'info'}>{statusLabel(item.status)}</Badge></td>
              <td data-label="下次回访">{visit ? <><span>{visit.due_on || '日期待安排'}</span><small>{milestoneLabels[visit.milestone] || visit.milestone}</small></> : '暂无待回访'}</td>
              <td className="franchise-open"><button type="button" aria-haspopup="dialog" aria-expanded={nav.id === item.id} onClick={() => open(item.id)}>打开档案</button></td>
            </tr>
          })}</tbody>
        </table> : <p className="collection-empty">{view.q || view.status || view.revisit ? '没有匹配的加盟商，请调整筛选条件。' : '暂无加盟商档案。'}</p>}
        <Pagination label="加盟档案分页" page={pagination.page} pageSize={pagination.pageSize} total={pagination.total} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />
      </>}
    </div>
    <FeedbackBanner message={message} />
    <ActionDrawer open={nav.id !== null} title={selected ? nameOf(selected) : '加盟商档案'} onClose={close} onExited={restoreListFocus} busy={Boolean(busy)} className="franchise-drawer" footer={<>
      {selected && canWrite && !['已关闭', '已归档', 'closed', 'archived'].includes(selected.status) && <button type="button" className="danger franchise-close-account" disabled={Boolean(busy)} onClick={() => { setError(''); setMessage(''); setCloseFor(selected) }}>关闭加盟商</button>}
      <button type="button" disabled={Boolean(busy)} onClick={close}>返回列表</button>
    </>}>
      <RecordNavigation nav={{ ...nav, close, next: () => changeRecord('next'), previous: () => changeRecord('previous') }} busy={Boolean(busy)} showReturn={false} />
      {error && !closeFor && <p className="action-error" role="alert">{error}</p>}
      {selected && <>
        <div className="franchise-summary"><div><Badge tone="info">{statusLabel(selected.status)}</Badge><span>{selected.franchise_code}</span><p>{regionLabel(selected)}</p></div>{canWrite && onCreateTraining && <button type="button" className={primaryAction === 'training' ? 'primary' : undefined} disabled={Boolean(busy)} onClick={() => onCreateTraining(selected.id)}>新增培训</button>}</div>
        <section className="franchise-section" aria-label="授权区域">
          <div className="franchise-section-heading"><h3>授权区域</h3>{canWrite && <button type="button" className={primaryAction === 'territory' ? 'primary' : undefined} disabled={Boolean(busy)} onClick={() => { setError(''); setMessage(''); setTerritoryFor(selected) }}>新增授权</button>}</div>
          {selected.territories.length ? <ul className="franchise-rows">{selected.territories.map(item => <li key={item.id}><span>{regionLabel(item)}</span><Badge tone={item.exclusive ? 'info' : 'neutral'}>{item.exclusive ? '独家授权' : '非独家授权'}</Badge></li>)}</ul> : <p className="franchise-empty">暂无授权区域</p>}
        </section>
        <section className="franchise-section" aria-label="交付事项">
          <div className="franchise-section-heading"><h3>交付事项</h3></div>
          {selected.delivery.length ? <ul className="franchise-rows">{selected.delivery.map(item => <li key={item.id}>
            <div className="franchise-row-title"><strong>{item.name}</strong>{item.planned_on && <small>计划 {item.planned_on}</small>}</div>
            <Badge tone={['applied', 'completed', 'done', '已完成'].includes(item.status) ? 'success' : item.status === 'issue' ? 'warning' : 'neutral'}>{deliveryLabels[item.status] || item.status}</Badge>
            {item.kind === 'application' && item.status !== 'applied' && canWrite && <button type="button" className={primaryAction === `delivery:${item.id}` ? 'primary' : undefined} disabled={Boolean(busy)} onClick={() => void run(`delivery:${item.id}`, () => api.updateDelivery(item.id, { status: 'applied', evidence: '现场已确认应用' }), '已确认应用')}>{busy === `delivery:${item.id}` ? '保存中…' : '确认应用'}</button>}
          </li>)}</ul> : <p className="franchise-empty">暂无交付事项</p>}
        </section>
        <section className="franchise-section" aria-label="回访记录">
          <div className="franchise-section-heading"><h3>回访记录</h3></div>
          {selected.support.length ? <ul className="franchise-rows">{selected.support.map(item => <li key={item.id}>
            <div className="franchise-row-title"><strong>{milestoneLabels[item.milestone] || item.milestone}</strong><small>{item.completed_on ? `完成于 ${item.completed_on}` : item.due_on ? `应于 ${item.due_on} 回访` : '日期待安排'}</small></div>
            {item.completed_on ? <Badge tone="success">已完成</Badge> : canWrite ? <button type="button" className={primaryAction === `support:${item.id}` ? 'primary' : undefined} disabled={Boolean(busy)} onClick={() => void run(`support:${item.id}`, () => api.completeSupport(item.id, '回访完成'), '回访已完成')}>{busy === `support:${item.id}` ? '保存中…' : '完成回访'}</button> : <Badge>待回访</Badge>}
          </li>)}</ul> : <p className="franchise-empty">暂无回访记录</p>}
        </section>
      </>}
    </ActionDrawer>
    <Presence present={Boolean(territoryFor)}>{territoryFor && <TerritoryDialog key={territoryFor.id} franchise={territoryFor} onClose={() => setTerritoryFor(null)} onSaved={item => { updateRecord(item); if (activeId.current === item.id) { setError(''); setMessage('授权已保存') } }} />}</Presence>
    <Presence present={Boolean(closeFor)}>{closeFor && <ConfirmActionDialog title="关闭加盟商" message={`关闭「${nameOf(closeFor)}」后，档案状态将变为已关闭，历史记录仍保留。请填写关闭原因。`} confirmLabel="确认关闭" danger reasonRequired pending={Boolean(busy)} error={error} onClose={() => { setCloseFor(null); setError('') }} onConfirm={async reason => { if (activeId.current === closeFor.id && await run('close', () => api.closeFranchise(closeFor.id, reason), '加盟商已关闭')) setCloseFor(null) }} />}</Presence>
  </section>
}
