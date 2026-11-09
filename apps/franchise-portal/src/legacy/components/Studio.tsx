import { Presence, usePresence } from '../../ui/Presence';
import { Pagination } from '../../ui/Pagination';
import { useClientPagination } from '../../ui/usePagination';
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, CheckCircle2, Plus, Sparkles, Newspaper, ClipboardList, Search } from 'lucide-react'
import { ActionDialog, FeedbackBanner } from './operations'
import { studio, money, today, requestKey, type RecordData, type StudioRow } from '../services/studio'
import { schemas, type Field } from './studioFields'
import type { Route } from '../hooks/useHashRoute'
import { readStored, writeStored, workspaceKey, useWorkspaceScope } from '../hooks/workspaceStorage'

const message = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试'
const initial = (kind: string, row?: RecordData) => Object.fromEntries(schemas[kind].fields.map(f => [f.key, row?.[f.key] ?? f.default ?? (f.type === 'select' ? f.options?.[0] : f.type === 'checkbox' ? false : f.type === 'multi' ? [] : '')]))
const dataFrom = (kind: string, values: RecordData) => Object.fromEntries(schemas[kind].fields.map(f => [f.key, (f.type === 'number' || f.type === 'ref') ? (values[f.key] === '' ? null : Number(values[f.key])) : f.type === 'date' ? values[f.key] || null : values[f.key]]))

function useReferenceNames(kind: string) {
  const [names,setNames]=useState<Record<string,string>>({})
  useEffect(()=>{
    let active=true
    const refs=[...new Set(schemas[kind].fields.map(f=>f.ref).filter(Boolean))] as string[]
    void Promise.all(refs.map(async ref=>({ref,rows:await studio.list(ref)}))).then(groups=>{
      if(active)setNames(Object.fromEntries(groups.flatMap(({ref,rows})=>Array.isArray(rows)?rows.map(row=>[`${ref}:${row.id}`,row.name]):[])))
    }).catch(()=>{ /* Table retains explicit reference labels when related data is unavailable. */ })
    return()=>{active=false}
  },[kind])
  return (field:Field,value:unknown) => {
    if(value===null||value===undefined||value==='')return '待补充'
    if(field.ref){const one=(v:unknown)=>names[`${field.ref}:${v}`]||`关联记录 #${v}`;return Array.isArray(value)?value.map(one).join('、'):one(value)}
    if(typeof value==='boolean')return value?'是':'否'
    return Array.isArray(value)?value.join('、'):String(value)
  }
}

function useRecords(kind: string) {
  const [rows, setRows] = useState<StudioRow[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const reload = useCallback(async () => {
    setLoading(true)
    try { const result = await studio.list(kind); setRows(Array.isArray(result) ? result : []); setError('') } catch (e) { setError(message(e)) } finally { setLoading(false) }
  }, [kind])
  useEffect(() => { void reload() }, [reload])
  return { rows, error, loading, reload }
}

function Fields({kind, values, setValues, disabled = false}: {kind: string; values: RecordData; setValues: (v: RecordData) => void; disabled?: boolean}) {
  const [refs, setRefs] = useState<Record<string, StudioRow[]>>({})
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    const kinds = [...new Set(schemas[kind].fields.map(f => f.ref).filter(Boolean))] as string[]
    Promise.all(kinds.map(async ref => [ref, await studio.list(ref)] as const)).then(entries => { if (alive) setRefs(Object.fromEntries(entries)) }).catch(e => { if (alive) setError(message(e)) })
    return () => { alive = false }
  }, [kind])
  const change = (key: string, value: unknown) => setValues({...values, [key]: value})
  const referenceOptions = (field: Field) => (refs[field.ref || ''] || []).filter(row => field.key !== 'center_id' || row.category === '培训中心').map(row => ({value: row.id, label: `${row.name} · ${row.city || row.province || row.category || '合同'} #${row.id}`}))
  return <div className="studio-form">{error && <p role="alert">关联资料读取失败：{error}</p>}{schemas[kind].fields.map(field => <label key={field.key} className={field.type === 'textarea' || field.type === 'multi' ? 'wide' : ''}>
    <span>{field.label}{field.required && ' *'}</span>
    {field.type === 'textarea' ? <textarea value={values[field.key] || ''} required={field.required} disabled={disabled} onChange={e => change(field.key, e.target.value)} rows={field.key === 'content' ? 16 : 3} />
      : field.type === 'select' || field.type === 'ref' ? <select value={values[field.key] ?? ''} required={field.required} disabled={disabled} onChange={e => change(field.key, e.target.value)}>{field.type === 'ref' ? <><option value="">请选择</option>{referenceOptions(field).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</> : field.options?.map(option => <option key={option} value={option}>{option || '无'}</option>)}</select>
      : field.type === 'multi' ? <select multiple value={(values[field.key] || []).map(String)} disabled={disabled} onChange={e => change(field.key, Array.from(e.target.selectedOptions, option => field.ref ? Number(option.value) : option.value))}>{(field.ref ? referenceOptions(field) : field.options?.map(value => ({value, label: value})) || []).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      : field.type === 'checkbox' ? <input type="checkbox" checked={!!values[field.key]} disabled={disabled} onChange={e => change(field.key, e.target.checked)} />
      : <input type={field.type} step={field.type === 'number' ? '0.01' : undefined} min={field.type === 'number' ? 0 : undefined} value={values[field.key] ?? ''} required={field.required} disabled={disabled} onChange={e => change(field.key, e.target.value)} />}
  </label>)}</div>
}

export function RecordEditor({kind, row, seed, onClose, onSaved}: {kind: string; row?: StudioRow; seed?: RecordData; onClose: () => void; onSaved: () => void}) {
  const { isPresent } = usePresence()
  const [values, setValues] = useState(() => initial(kind, row || seed))
  const original = useRef(JSON.stringify(values))
  const key = useRef(requestKey())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const close = () => { if (original.current === JSON.stringify(values) || window.confirm('内容尚未保存，确定关闭？')) onClose() }
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (isPresent && original.current !== JSON.stringify(values)) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [values, isPresent])
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const data = dataFrom(kind, values)
      if (kind === 'action') {
        if (row) await studio.action(row.id, {...data, source_type: row.source_type || '', source_id: row.source_id || null})
        else await studio.createAction(data, key.current)
      } else await studio.save(kind, data, key.current, row)
      original.current = JSON.stringify(values)
      onSaved(); onClose()
    } catch (e) { setError(message(e)) } finally { setBusy(false) }
  }
  return <ActionDialog title={`${row ? '编辑' : '新增'}${schemas[kind].label}`} open onClose={close} busy={busy}><form onSubmit={submit} className="studio-editor">
    {kind === 'relationship' && <button type="button" onClick={() => setValues({...values, relationship: '合资', headquarters_share: 70, partner_share: 30})}>填入70% / 30%合资模板</button>}
    {kind === 'contract' && <p className="studio-hint">金额和权益独立保存在本合同中；兑现口径和期限未明确时留空。</p>}
    {kind === 'report' && !row && <p className="studio-hint">保存后按所选期间生成事实报告草稿，随后可编辑正文并发布。</p>}
    <Fields kind={kind} values={values} setValues={setValues} disabled={busy}/>
    {error && <p className="studio-error" role="alert">{error}</p>}
    <div className="studio-buttons"><button type="button" onClick={close} disabled={busy}>取消</button><button className="primary" disabled={busy}>{busy ? '正在保存…' : '确认保存'}</button></div>
  </form></ActionDialog>
}

function RecordDetail({kind, row, onClose, onEdit}: {kind: string; row: StudioRow; onClose: () => void; onEdit?: () => void}) {
  const display=useReferenceNames(kind)
  const [totals, setTotals] = useState<RecordData | null>(null)
  const [related, setRelated] = useState<StudioRow[]>([])
  const [error, setError] = useState('')
  const [evidence,setEvidence]=useState<StudioRow[]>([])
  useEffect(() => {
    let alive = true
    async function load() {
      if (kind === 'contract') { const data = await studio.totals(row.id); if (alive) setTotals(data) }
      if (kind === 'party') {
        const data = await Promise.all(['note','relationship','contract','insurance'].map(studio.list))
        if (alive) setRelated(data.flat().filter(x => x.party_id === row.id || x.from_id === row.id || x.to_id === row.id).sort((a,b) => b.created_at.localeCompare(a.created_at)))
      }
      if(kind==='report' && row.evidence_ids?.length){const data=await Promise.all(row.evidence_ids.map(studio.evidence));if(alive)setEvidence(data)}
    }
    void load().catch(e => { if (alive) setError(message(e)) })
    return () => { alive = false }
  }, [kind,row.id,row.evidence_ids])
  return <ActionDialog title={row.name || row.summary || schemas[kind].label} open onClose={onClose} footer={onEdit && <button className="primary" onClick={onEdit}>编辑记录</button>}>
    <p className="studio-hint">记录 #{row.id} · 最近更新 {new Date(row.updated_at || row.created_at).toLocaleString('zh-CN')}</p>
    {error && <p role="alert">{error}</p>}
    {kind === 'report' ? <article className="studio-report"><h2>{row.name}</h2><p>{row.start} — {row.end} · {row.status}</p><pre>{row.content}</pre><button onClick={() => { const blob = new Blob([row.content], {type:'text/plain;charset=utf-8'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = row.name + '.txt'; a.click(); URL.revokeObjectURL(url) }}>下载报告文本</button>{evidence.length>0&&<section><h3>报告依据（仅运营账号）</h3>{evidence.map(item=><details key={item.id}><summary>{schemas[item.kind]?.label||'行业资讯'} · {item.name||item.summary||item.title||item.amount}</summary><p>{item.evidence||item.url||item.result||'参见业务记录'}{item.amount?` · 金额 ${money(item.amount)} 元`:''}</p><p>{item.created_at}</p></details>)}</section>}</article> : <dl className="studio-detail">{schemas[kind].fields.map(f => <div key={f.key}><dt>{f.label}</dt><dd>{display(f,row[f.key])}</dd></div>)}</dl>}
    {totals && <section><h3>合同履约台账</h3><div className="studio-metrics">{[['franchise_paid','加盟净收款'],['training_paid','培训净收款'],['training_due','培训应收'],['dispatched','派单'],['completed','完工'],['settled','结算'],['received','到账']].map(([key,label]) => <div key={key}><span>{label}</span><strong>¥{money(totals[key])}</strong></div>)}</div><p>剩余赠送名额：{totals.seats_remaining} · 兑现：{totals.fulfillment}{totals.overdue ? ' · 已逾期' : ''}</p><p className="studio-hint">各阶段金额独立累计，不相加；待明确口径不判断兑现完成。</p></section>}
    {kind === 'party' && <section><h3>业务推进时间线</h3><ol className="studio-timeline">{related.map(item => <li key={item.id}><small>{item.created_at.slice(0,10)} · {schemas[item.kind]?.label}</small><strong>{item.summary || item.name || item.relationship}</strong><p>{item.result || item.status || item.distribution || '待补充'}</p>{item.next_action && <p>下一步：{item.next_action} · {item.due_date || '未约定日期'}</p>}</li>)}</ol>{!related.length && <p className="studio-empty">暂无业务进展，可先添加沟通或合作关系。</p>}</section>}
  </ActionDialog>
}

const ledgerColumns: Record<string,string[]> = {
  party:['name','category','province','city','status'],
  relationship:['from_id','to_id','relationship','region','headquarters_share'],
  insurance:['name','party_id','region','status'],
  contract:['name','party_id','signed_on','fee','promise'],
  payment:['contract_id','category','direction','amount','paid_on'],
  enrollment:['name','contract_id','category','status','scheduled_on'],
  repair:['name','contract_id','source','status','received'],
  note:['summary','party_id','role','due_date','next_action'],
  report:['name','start','end','status'],
  news_source:['name','topic','nature','format','enabled'],
  news_preference:['name','regions','automatic_regions'],
}

export function Ledger({kind, readOnly = false}: {kind: string; readOnly?: boolean}) {
  const display=useReferenceNames(kind)
  const {rows,error,loading,reload} = useRecords(kind)
  const [q,setQ] = useState('')
  const [status,setStatus] = useState('')
  const nextEdit = useRef<StudioRow | null>(null)
  const [selected,setSelected] = useState<StudioRow | null>(null)
  const [editing,setEditing] = useState<StudioRow | undefined | null>(null)
  const [success,setSuccess] = useState('')
  const list = rows.filter(row => (!status || row.status === status || row.category === status) && JSON.stringify(row).toLowerCase().includes(q.toLowerCase()))
  const pagination = useClientPagination(list, JSON.stringify([kind, q, status]))
  const preferred = ledgerColumns[kind] || []
  const cols = preferred.map(key=>schemas[kind].fields.find(field=>field.key===key)).filter((field): field is Field=>Boolean(field))
  return <section className="studio-ledger">
    <header className="studio-section-heading"><div><h2>{schemas[kind].label}</h2><p>{rows.length} 条记录 · 修改有迹可循</p></div>{!readOnly && <button className="primary" onClick={() => setEditing(undefined)}><Plus size={16}/>新增{schemas[kind].label}</button>}</header>
    <div className="studio-toolbar"><label className="studio-search"><Search size={16}/><input aria-label={`搜索${schemas[kind].label}`} placeholder="搜索名称、地区或记录内容" value={q} onChange={e=>setQ(e.target.value)}/></label><select aria-label="筛选状态" value={status} onChange={e=>setStatus(e.target.value)}><option value="">全部状态 / 类型</option>{[...new Set(rows.flatMap(x=>[x.status,x.category]).filter(Boolean))].map(x=><option key={x}>{x}</option>)}</select></div>
    {error ? <p className="studio-error" role="alert">{error}<button onClick={()=>void reload()}>重试</button></p> : loading ? <p role="status">正在读取…</p> : !list.length ? <p className="studio-empty">暂无符合条件的记录。{readOnly ? (kind === 'report' ? '已发布的报告会显示在这里。' : '') : '可新增记录，或调整搜索条件。'}</p> : <div className="table-scroll"><table><thead><tr>{cols.map(f=><th key={f.key}>{f.label}</th>)}<th>操作</th></tr></thead><tbody>{pagination.items.map(row=><tr key={row.id}>{cols.map((f,i)=><td key={f.key}>{i===0 ? <button className="studio-link" onClick={()=>{nextEdit.current=null;setSelected(row)}}>{display(f,row[f.key])}</button> : display(f,row[f.key])}</td>)}<td><button onClick={()=>{nextEdit.current=null;setSelected(row)}}>查看详情</button></td></tr>)}</tbody></table></div>}
    {!loading && !error && <Pagination label={`${schemas[kind].label}分页`} page={pagination.page} pageSize={pagination.pageSize} total={pagination.total} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />}
    <Presence present={Boolean(selected)} onExited={()=>{if(nextEdit.current){setEditing(nextEdit.current);nextEdit.current=null}}}>{selected && <RecordDetail kind={kind} row={selected} onClose={()=>setSelected(null)} onEdit={!readOnly && !['payment','note'].includes(kind) ? ()=>{nextEdit.current=selected;setSelected(null)} : undefined}/>}</Presence>
    <Presence present={Boolean(editing !== null)}>{editing !== null && <RecordEditor kind={kind} row={editing} onClose={()=>setEditing(null)} onSaved={()=>{setSuccess('记录已保存');void reload()}}/>}</Presence>
    <FeedbackBanner message={success}/>
  </section>
}

export function LedgerPage({title, kinds, readOnly = false, legacy, legacyLabel = '相关业务记录'}: {title:string; kinds:string[]; readOnly?:boolean; legacy?:React.ReactNode; legacyLabel?:string}) {
  const [tab,setTab] = useState(kinds[0])
  return <main className="studio-page"><header className="studio-page-heading"><div><h1>{title}</h1><p>把合作关系、推进过程和实际交付留在同一处。</p></div></header><nav className="studio-tabs" aria-label={`${title}分类`}>{kinds.map(k=><button key={k} aria-pressed={tab===k} onClick={()=>setTab(k)}>{schemas[k].label}</button>)}{legacy && <button aria-pressed={tab==='legacy'} onClick={()=>setTab('legacy')}>{legacyLabel}</button>}</nav>{tab==='legacy' ? legacy : <Ledger key={tab} kind={tab} readOnly={readOnly}/>}</main>
}

export function QuickRecord({onSaved}: {onSaved:()=>void}) {
  const scope = useWorkspaceScope()
  const storageKey = workspaceKey(scope, 'quick-record')
  const stored = useRef(readStored('session', storageKey) as RecordData | null)
  const [text,setText] = useState(stored.current?.text || '')
  const [party,setParty] = useState(stored.current?.party || '')
  const [mode,setMode] = useState('note')
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [success,setSuccess] = useState('')
  const [draft,setDraft] = useState<RecordData | null>(stored.current?.draft || null)
  const [values,setValues] = useState<RecordData>(stored.current?.values || initial('note'))
  const [available,setAvailable] = useState<boolean | null>(null)
  const {rows:parties} = useRecords('party')
  const key = useRef(requestKey())
  useEffect(()=>{writeStored('session', storageKey, {text, party, draft, values})},[storageKey,text,party,draft,values])
  useEffect(()=>{
    const beforeUnload=(e:BeforeUnloadEvent)=>{if(text || draft){e.preventDefault();e.returnValue=''}}
    window.addEventListener('beforeunload',beforeUnload)
    return()=>window.removeEventListener('beforeunload',beforeUnload)
  },[text,draft])
  useEffect(()=>{studio.aiStatus().then(x=>setAvailable(x.local_configured)).catch(e=>setError(message(e)))},[])
  const generate = async () => {
    setBusy(true);setError('');setSuccess('')
    try { const result = await studio.draft(text,party ? Number(party):null,mode);setDraft(result);setValues(initial('note',result.data)) } catch(e){setError(message(e))} finally{setBusy(false)}
  }
  const manual = () => {setDraft({id:null});setValues({...initial('note'),summary:text,party_id:party})}
  const save = async (event:React.FormEvent) => {
    event.preventDefault();setBusy(true);setError('')
    try {
      const data=dataFrom('note',values)
      if(draft?.id) await studio.confirm(draft.id,data,key.current)
      else await studio.save('note',data,key.current)
      setText('');setDraft(null);setValues(initial('note'));key.current=requestKey();setSuccess('已保存沟通记录和下一步待办');onSaved()
    }catch(e){setError(message(e))}finally{setBusy(false)}
  }
  return <section className="studio-panel studio-quick"><header className="studio-section-heading"><h2><Sparkles size={19}/>快速记录</h2></header><p className="studio-hint">先记下来，再整理成下一步。</p>
    {!draft ? <><label>关联机构或门店<select value={party} onChange={e=>setParty(e.target.value)}><option value="">暂不关联</option>{parties.map(p=><option value={p.id} key={p.id}>{p.name} · {p.city || p.category} #{p.id}</option>)}</select></label><label>辅助方式<select value={mode} onChange={e=>setMode(e.target.value)}><option value="note">沟通建议</option><option value="preparation">合作准备</option><option value="delivery">交付分析</option><option value="report">报告起草</option></select></label><label>沟通纪要<textarea rows={7} value={text} onChange={e=>setText(e.target.value)} placeholder="今天联系了谁？有什么进展、顾虑和约定？"/></label>
      {available===false && <p className="studio-hint">AI 暂不可用，可先人工整理。</p>}
      <p className="studio-hint">AI 只分析经营数量汇总，不读取这段纪要；沟通事实仍由你填写。</p><div className="studio-buttons"><button disabled={!text.trim()||busy||available===false} className="primary" onClick={()=>void generate()}><Sparkles size={16}/>{busy?'正在分析…':'生成经营建议'}</button><button disabled={busy} onClick={manual}>人工整理</button></div></> : <form onSubmit={save}><p className="studio-badge">待确认草稿 · 尚未入账</p>{draft.notice && <p className="studio-hint" role="status">{draft.notice}</p>}<Fields kind="note" values={values} setValues={setValues} disabled={busy}/><div className="studio-buttons"><button type="button" disabled={busy} onClick={()=>{if(window.confirm('放弃当前草稿修改？原始输入会保留。'))setDraft(null)}}>返回</button><button className="primary" disabled={busy}>{busy?'正在保存…':'确认入账'}</button></div></form>}
    {error && <p role="alert" className="studio-error">{error}</p>}{success && <p role="status" className="studio-success">{success}</p>}
  </section>
}

export function TodayPage({onOpen}: {onOpen:(route:Route)=>void}) {
  const [actions,setActions]=useState<RecordData[]>([])
  const [news,setNews]=useState<RecordData|null>(null)
  const [summary,setSummary]=useState<RecordData>({})
  const [notes,setNotes]=useState<StudioRow[]>([])
  const [error,setError]=useState('')
  const [q,setQ]=useState('')
  const [showQuick,setShowQuick]=useState(false)
  const [edit,setEdit]=useState<StudioRow | undefined | null>(null)
  const [recent,setRecent]=useState<StudioRow | null>(null)
  const [expandedGroups,setExpandedGroups]=useState<string[]>(['overdue','today'])
  const reload=useCallback(async()=>{
    const results=await Promise.allSettled([studio.actions(),studio.news(),studio.summary(),studio.list('note')])
    if(results[0].status==='fulfilled')setActions(Array.isArray(results[0].value)?results[0].value:[])
    if(results[1].status==='fulfilled')setNews(results[1].value)
    if(results[2].status==='fulfilled')setSummary(results[2].value)
    if(results[3].status==='fulfilled')setNotes(Array.isArray(results[3].value)?results[3].value:[])
    setError(results.some(r=>r.status==='rejected')?'部分内容加载失败，请重试。':'')
  },[])
  useEffect(()=>{void reload()},[reload])
  const pending=actions.filter(a=>a.status==='待处理' && (a.title+a.detail).includes(q)).sort((a,b)=>(a.due_date||'9999').localeCompare(b.due_date||'9999'))
  const taskGroups = [
    {key:'overdue',label:'已逾期',tone:'is-danger',items:pending.filter(a=>a.due_date && a.due_date<today())},
    {key:'today',label:'今天到期',tone:'is-today',items:pending.filter(a=>a.due_date===today())},
    {key:'later',label:'后续待办',tone:'is-later',items:pending.filter(a=>a.due_date && a.due_date>today())},
    {key:'unscheduled',label:'未定日期',tone:'is-unscheduled',items:pending.filter(a=>!a.due_date)},
  ]
  const toggleGroup=(key:string)=>setExpandedGroups(current=>current.includes(key)?current.filter(item=>item!==key):[...current,key])
  return <main className="studio-page"><header className="studio-page-heading"><div><span className="studio-eyebrow">{new Date().toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'})}</span><h1>今日工作</h1><p>掌握行业变化，推动每一项合作。</p></div><div className="studio-buttons"><button onClick={()=>onOpen('leads')}>线索与招商<ArrowUpRight size={16}/></button><button className="primary studio-quick-trigger" onClick={()=>setShowQuick(true)}><Plus size={16}/>记录</button></div></header>
    {error && <p role="alert" className="studio-error">{error}<button onClick={()=>void reload()}>重新加载</button></p>}
    <div className="studio-home"><div className="studio-main">
      <section className="studio-panel studio-morning"><header className="studio-section-heading"><div><h2><Newspaper size={20}/>历史行业资讯</h2></div><button className="studio-link" onClick={()=>onOpen('news')}>查看历史<ArrowUpRight size={16}/></button></header><p className="studio-hint">最新简报见<Link to="/intelligence">行业情报</Link>，工作日08:30更新。</p>
        {news?.articles?.length ? news.articles.slice(0,3).map((a:StudioRow)=><article className="studio-brief-row" key={a.id}><span className="studio-badge">{a.topic}</span><div><a href={a.url} target="_blank" rel="noreferrer">{a.title}</a><p>{a.summary}</p><small>{a.source_name} · {a.nature}</small></div></article>) : <p className="studio-empty">暂无历史资讯。</p>}
      </section>
      <section className="studio-panel studio-tasks-panel"><header className="studio-section-heading"><div><h2><ClipboardList size={20}/>待办任务 <span className="studio-count">{pending.length}</span></h2><p>按紧急程度和截止日期推进。</p></div><button onClick={()=>setEdit(undefined)}><Plus size={16}/>新增待办</button></header><label className="studio-search"><Search size={16}/><input aria-label="搜索今日待办" placeholder="搜索待办或业务对象" value={q} onChange={e=>setQ(e.target.value)}/></label>
        <div className="studio-task-groups">{taskGroups.filter(group=>group.items.length>0).map(group=>{const expanded=expandedGroups.includes(group.key)||group.items.length<=3;const visible=expanded?group.items:group.items.slice(0,3);return <section className={`studio-task-group ${group.tone}`} key={group.key}><header><span>{group.label}</span><strong>{group.items.length}</strong></header><div className="studio-task-list">{visible.map(a=><button className="studio-task" key={a.id} onClick={()=>setEdit(a as StudioRow)}><span><strong>{a.title}</strong><small>{a.detail||'点击补充关联对象与推进原因'}</small></span><time>{a.due_date||'—'}</time><ArrowUpRight size={17}/></button>)}</div>{group.items.length>3&&<button type="button" className="studio-group-toggle" onClick={()=>toggleGroup(group.key)}>{expanded?'收起':'展开全部'} · {group.items.length}项</button>}</section>})}</div>{!pending.length && <p className="studio-empty"><CheckCircle2 size={23}/>暂无待处理事项，可记录新的沟通或添加下一步。</p>}
      </section>
      <section className="studio-panel"><header className="studio-section-heading"><h2>经营摘要</h2><button className="studio-link" onClick={()=>onOpen('overview')}>经营概览<ArrowUpRight size={16}/></button></header><div className="studio-metrics">{[['parties','合作主体','partners'],['contracts','合同记录','delivery'],['enrollments','完成培训','delivery'],['notes','推动记录','contributions']].map(([key,label,route])=><button key={key} onClick={()=>onOpen(route as Route)}><span>{label}</span><strong>{summary[key]??'—'}</strong><small>查看明细 ↗</small></button>)}</div></section>
      <section className="studio-panel"><header className="studio-section-heading"><h2>最近的推动</h2><button className="studio-link" onClick={()=>onOpen('contributions')}>全部记录</button></header><ol className="studio-timeline">{notes.slice(0,5).map(n=><li key={n.id}><small>{n.created_at.slice(0,10)} · {n.role}</small><button className="studio-link" onClick={()=>setRecent(n)}>{n.summary}</button><p>结果：{n.result||'待补充'}{n.next_action?` · 下一步：${n.next_action}`:''}</p></li>)}</ol>{!notes.length&&<p className="studio-empty">从第一条沟通记录开始积累。</p>}</section>
    </div><aside className={`studio-quick-column ${showQuick?'is-open':''}`}><Presence present={showQuick}>{showQuick&&<ActionDialog title="快速记录" open onClose={()=>{if(window.confirm('关闭记录面板？请确认已保存内容。'))setShowQuick(false)}}><QuickRecord onSaved={()=>void reload()}/></ActionDialog>}</Presence>{!showQuick&&<QuickRecord onSaved={()=>void reload()}/>}</aside></div>
    <Presence present={Boolean(edit!==null)}>{edit!==null&&<RecordEditor kind="action" row={edit} onClose={()=>setEdit(null)} onSaved={()=>void reload()}/>}</Presence><Presence present={Boolean(recent)}>{recent&&<RecordDetail kind="note" row={recent} onClose={()=>setRecent(null)}/>}</Presence>
  </main>
}

export function NewsPage(){
  const [data,setData]=useState<RecordData|null>(null)
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const [tab,setTab]=useState('archive')
  const [article,setArticle]=useState<StudioRow|null>(null)
  const [action,setAction]=useState('')
  const [due,setDue]=useState('')
  const [party,setParty]=useState('')
  const [articleKey,setArticleKey]=useState(requestKey)
  const [showFavorites,setShowFavorites]=useState(false)
  const {rows:parties}=useRecords('party')
  const reload=useCallback(async()=>{try{setData(await studio.news());setError('')}catch(e){setError(message(e))}},[])
  useEffect(()=>{void reload()},[reload])
  const run=async(fn:()=>Promise<unknown>)=>{setBusy(true);try{await fn();await reload()}catch(e){setError(message(e))}finally{setBusy(false)}}
  const articles: StudioRow[] = (showFavorites ? data?.favorites : data?.articles) ?? []
  const pagination = useClientPagination(articles, String(showFavorites))
  const history = useClientPagination<RecordData>(data?.history ?? [])
  return <main className="studio-page"><header className="studio-page-heading"><h1>历史资讯与收藏</h1><div className="studio-buttons"><Link className="button secondary" to="/settings">信源管理</Link><Link className="button primary" to="/intelligence">查看最新情报<ArrowUpRight size={16}/></Link></div></header>
    <nav className="studio-tabs" aria-label="历史资讯分类">{(['archive','news_source','news_preference'] as const).map(t=><button key={t} aria-pressed={tab===t} onClick={()=>setTab(t)}>{{archive:'历史资讯',news_source:'历史来源',news_preference:'历史偏好'}[t]}</button>)}</nav>
    {tab!=='archive'?<Ledger key={tab} kind={tab} readOnly/>:<><section className="studio-panel"><div className="studio-section-heading"><h2>{showFavorites?'我的收藏':'历史资讯'}</h2><button aria-pressed={showFavorites} onClick={()=>setShowFavorites(!showFavorites)}>{showFavorites?'全部历史':'我的收藏'}</button></div>{data?.edition?.generated_at && <p className="studio-hint">归档于 {new Date(data.edition.generated_at).toLocaleString('zh-CN')}</p>}
      {error&&<p role="alert" className="studio-error">{error}</p>}
      {pagination.items.map((a:StudioRow)=><article key={a.id} className="studio-news-item"><div className="studio-news-meta"><span className="studio-badge">{a.topic}</span><span>{a.nature} · {a.source_name}</span><time>{new Date(a.published).toLocaleString('zh-CN')}</time></div><h3><a href={a.url} target="_blank" rel="noreferrer">{a.title}<ArrowUpRight size={16}/></a></h3><p>{a.summary||'请查看原文内容。'}</p><p className="studio-hint">事件时间：{a.event_date||'来源未明确'}</p><aside className="studio-ai-insight"><strong>{a.ai_generated?'AI分析 · 建议供判断':'分析状态'}</strong><p>{a.analysis}</p>{a.suggestion&&<p>建议：{a.suggestion}</p>}</aside><div className="studio-buttons"><button disabled={busy} onClick={()=>void run(()=>studio.article(a.id,{favorite:!a.favorite}))}>{a.favorite?'取消收藏':'收藏'}</button><button disabled={busy} onClick={()=>{setArticle(a);setAction(a.suggestion||'核实资讯及合作适用条件');setParty(a.party_id?String(a.party_id):'');setArticleKey(requestKey())}}>关联业务 / 转待办</button><button disabled={busy} onClick={()=>void run(()=>studio.article(a.id,{report_material:!a.report_material}))}>{a.report_material?'移出报告素材':'加入报告素材'}</button></div></article>)}
      {!(showFavorites?data?.favorites:data?.articles)?.length&&<p className="studio-empty">{showFavorites?'暂无收藏。':'暂无历史资讯。'}</p>}
      {data && !error && <Pagination label="历史资讯分页" page={pagination.page} pageSize={pagination.pageSize} total={pagination.total} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />}
    </section><details className="studio-panel"><summary>历史生成记录</summary>{history.items.map((job:RecordData)=><p key={job.id}>{job.date} · #{job.id} · {({success:'已完成',failed:'失败',pending:'当时未处理',running:'当时未完成'} as RecordData)[job.status]} · {job.count||0} 条 {job.error}</p>)}{data && !error && <Pagination label="历史生成记录分页" page={history.page} pageSize={history.pageSize} total={history.total} onPageChange={history.setPage} onPageSizeChange={history.setPageSize} />}</details></>}
    <Presence present={Boolean(article)}>{article&&<ActionDialog title="确认资讯跟进事项" open busy={busy} onClose={()=>setArticle(null)}><div className="studio-form"><h3 className="wide">{article.title}</h3><label className="wide">关联机构或门店<select value={party} onChange={e=>setParty(e.target.value)}><option value="">暂不关联</option>{parties.map(p=><option key={p.id} value={p.id}>{p.name} · {p.city} #{p.id}</option>)}</select></label><label className="wide">下一步行动<textarea value={action} onChange={e=>setAction(e.target.value)}/></label><label>截止日期<input type="date" value={due} onChange={e=>setDue(e.target.value)}/></label><div className="studio-buttons wide"><button disabled={busy} onClick={()=>void run(async()=>{await studio.article(article.id,{party_id:party?Number(party):null});setArticle(null)})}>仅保存关联</button><button className="primary" disabled={busy||!action.trim()} onClick={()=>void run(async()=>{await studio.articleAction(article.id,{party_id:party?Number(party):null,next_action:action,due_date:due||null},articleKey);setArticle(null)})}>确认创建待办</button></div>{error&&<p role="alert">{error}</p>}</div></ActionDialog>}</Presence>
  </main>
}
