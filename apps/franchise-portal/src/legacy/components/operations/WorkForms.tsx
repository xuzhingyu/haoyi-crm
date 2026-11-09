import { useEffect, useRef, useState } from 'react'
import { api, ApiError, type FranchiseProfile, type Lead, type LeadBatch, type Opportunity } from '../../services/api'
import { useFormDraft } from '../../hooks/useWorkContext'
import { DraftNotice, QuickDate, StageInput } from './WorkContext'

const fail = (error: unknown) => error instanceof ApiError ? error.detail : '保存失败，输入已保留，请重试'
type SaveProps = { onSaved: () => void; onNext?: () => void; onBusy: (value: boolean) => void }

export function FollowUpForm({ lead, onSaved, onNext, onBusy }: SaveProps & { lead: Lead }) {
  const draft = useFormDraft(`followup:${lead.id}`, { note: '', due_date: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (next: boolean) => {
    if (busy || draft.pending) return
    setBusy(true); onBusy(true); setError('')
    try { await api.addFollowUp(lead.id, draft.value); draft.clear(); onSaved(); if (next) onNext?.() }
    catch (error) { setError(fail(error)) }
    finally { setBusy(false); onBusy(false) }
  }
  return <form className="stack-form" onSubmit={(event) => { event.preventDefault(); void submit((event.nativeEvent as SubmitEvent).submitter?.getAttribute('data-next') === 'true') }}>
    <DraftNotice draft={draft} />
    <fieldset disabled={busy || Boolean(draft.pending)}>
      <label>跟进备注<textarea name="note" aria-label="跟进备注" placeholder="记录沟通结果与下一步" required value={draft.value.note} onChange={(event) => draft.change({ note: event.target.value })} /></label>
      <QuickDate label="跟进截止日期" name="due_date" value={draft.value.due_date} onChange={(value) => draft.change({ due_date: value })} />
      <div className="form-submit-actions"><button type="submit">{busy ? '保存中…' : '新增跟进'}</button>{onNext && <button type="submit" data-next="true">保存并查看下一条</button>}</div>
    </fieldset>{error && <p role="alert" className="action-error">{error}</p>}
  </form>
}

export function OpportunityForm({ opportunity, stages, onSaved, onNext, onBusy }: SaveProps & { opportunity: Opportunity; stages: string[] }) {
  const draft = useFormDraft(`opportunity:${opportunity.id}`, { stage: opportunity.stage, stage_reason: '', next_action: opportunity.next_action ?? '', next_action_date: opportunity.next_action_date ?? '', estimated_value: String(opportunity.estimated_value) })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (next: boolean) => {
    if (busy || draft.pending) return
    setBusy(true); onBusy(true); setError('')
    try { await api.updateOpportunity(opportunity.id, { ...draft.value, estimated_value: Number(draft.value.estimated_value) }); draft.clear(draft.value); onSaved(); if (next) onNext?.() }
    catch (error) { setError(fail(error)) }
    finally { setBusy(false); onBusy(false) }
  }
  return <form className="stack-form" onSubmit={(event) => { event.preventDefault(); void submit((event.nativeEvent as SubmitEvent).submitter?.getAttribute('data-next') === 'true') }}>
    <DraftNotice draft={draft} /><fieldset disabled={busy || Boolean(draft.pending)}>
      <StageInput value={draft.value.stage} stages={stages} onChange={(stage) => draft.change({ stage })} />
      {draft.value.stage !== opportunity.stage && <label>阶段变更原因<textarea name="stage_reason" aria-label="阶段变更原因" required placeholder="说明判断依据，方便后续追溯" value={draft.value.stage_reason} onChange={(event) => draft.change({ stage_reason: event.target.value })} /></label>}
      <label>下一步动作<input name="next_action" aria-label="下一步动作" value={draft.value.next_action} onChange={(event) => draft.change({ next_action: event.target.value })} /></label>
      <QuickDate label="下一步期限" name="next_action_date" value={draft.value.next_action_date} onChange={(next_action_date) => draft.change({ next_action_date })} />
      <label>预计价值<input name="estimated_value" aria-label="预计价值" type="number" step="any" value={draft.value.estimated_value} onChange={(event) => draft.change({ estimated_value: event.target.value })} /></label>
      <div className="form-submit-actions"><button type="submit">{busy ? '保存中…' : '保存推进'}</button>{onNext && <button type="submit" data-next="true">保存并查看下一条</button>}</div>
    </fieldset>{error && <p role="alert" className="action-error">{error}</p>}
  </form>
}

export function BatchFeedbackForm({ batch, onSaved, onBusy }: SaveProps & { batch: LeadBatch }) {
  const draft = useFormDraft(`batch:${batch.id}`, { text: batch.raw_feedback ?? '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    if (busy || draft.pending) return
    setBusy(true); onBusy(true); setError('')
    try {
      await api.saveFeedback(batch.id, draft.value.text)
      const generated = await api.draftFeedback(batch.id)
      await api.confirmDraft(generated.id)
      draft.clear(draft.value); onSaved()
    } catch (error) { setError(fail(error)) }
    finally { setBusy(false); onBusy(false) }
  }
  return <form className="stack-form" onSubmit={(event) => { event.preventDefault(); void submit() }}><DraftNotice draft={draft} /><fieldset disabled={busy || Boolean(draft.pending)}><label className="field-label">微信反馈原文<textarea aria-label="微信反馈原文" placeholder="粘贴该批次的微信反馈内容" value={draft.value.text} onChange={(event) => draft.change({ text: event.target.value })} /></label><button type="submit" disabled={!batch.dispatched_at}>{busy ? '处理中…' : '生成并确认反馈草稿'}</button>{!batch.dispatched_at && <small>请先分发批次</small>}</fieldset>{error && <p role="alert" className="action-error">{error}</p>}</form>
}

const franchiseLabel = (item: FranchiseProfile) => `${item.shop_name || '未命名门店'} · ${[item.province, item.city].filter(Boolean).join(' / ') || '地区未提供'} · ${item.franchise_code}`
export function FranchiseSelector({ value, onChange, onValidity }: { value: string; onChange: (id: string) => void; onValidity: (valid: boolean) => void }) {
  const [items, setItems] = useState<FranchiseProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [tick, setTick] = useState(0)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let alive = true
    setLoading(true); setError('')
    void api.franchises().then((data) => { if (alive) setItems(data) }).catch(() => { if (alive) setError('加盟商加载失败') }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [tick])
  const selected = items.find((item) => String(item.id) === value)
  const valid = !query.trim() && (!value || Boolean(selected))
  useEffect(() => { onValidity(valid) }, [valid, onValidity])
  const matches = items.filter((item) => franchiseLabel(item).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return <div className="franchise-selector"><label>关联加盟商<input ref={ref} aria-label="搜索加盟商" placeholder="搜索门店、地区或加盟商编号" value={query} onFocus={() => setExpanded(true)} onChange={(event) => { setQuery(event.target.value); setExpanded(true) }} onKeyDown={(event) => { if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); setExpanded(false) } }} /></label>
    <p className="selector-selection">{selected ? `已选：${franchiseLabel(selected)}` : value ? '原关联加盟商尚未加载或已不可访问' : '未关联加盟商（可选）'}{(value || query) && <button type="button" onClick={() => { onChange(''); setQuery('') }}>清除选择</button>}</p>
    {loading && <p role="status">正在加载加盟商…</p>}
    {error && <p role="alert">{error}<button type="button" onClick={() => setTick((value) => value + 1)}>重试加盟商加载</button></p>}
    {!valid && !loading && !error && <small>请从结果中选定加盟商，或清除选择后提交。</small>}
    {expanded && !loading && !error && <div className="selector-results" role="group" aria-label="加盟商搜索结果">{matches.length ? matches.map((item) => <button type="button" key={item.id} onClick={() => { onChange(String(item.id)); setQuery(''); ref.current?.focus(); setExpanded(false) }}>{franchiseLabel(item)}</button>) : <p>没有匹配的加盟商，可调整搜索词。</p>}<button type="button" onClick={() => setExpanded(false)}>收起搜索结果</button></div>}
  </div>
}

export function TrainingCreateForm({ franchiseId, onSaved }: { franchiseId?: number | null; onSaved: () => void }) {
  const draft = useFormDraft(`training:new:${franchiseId ?? 'unlinked'}`, { training_name: '', franchise_id: franchiseId ? String(franchiseId) : '' })
  const [busy, setBusy] = useState(false)
  const [valid, setValid] = useState(!franchiseId)
  const [error, setError] = useState('')
  const submit = async () => {
    if (busy || !valid || draft.pending) return
    setBusy(true); setError('')
    try { await api.createTraining({ training_name: draft.value.training_name, franchise_id: Number(draft.value.franchise_id) || null }); draft.clear(); onSaved() }
    catch (error) { setError(fail(error)) }
    finally { setBusy(false) }
  }
  return <form className="stack-form training-create-form" onSubmit={(event) => { event.preventDefault(); void submit() }}><DraftNotice draft={draft} /><fieldset disabled={busy || Boolean(draft.pending)}>
    <label>培训名称<input name="training_name" aria-label="培训名称" placeholder="填写课程或培训主题" required value={draft.value.training_name} onChange={(event) => draft.change({ training_name: event.target.value })} /></label>
    <FranchiseSelector value={draft.value.franchise_id} onChange={(franchise_id) => draft.change({ franchise_id })} onValidity={setValid} />
    <button type="submit" disabled={!valid}>{busy ? '保存中…' : '新增培训'}</button>
  </fieldset>{error && <p role="alert" className="action-error">{error}</p>}</form>
}
