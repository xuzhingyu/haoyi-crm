import { useId, useState } from 'react'
import { dateShortcut } from '../../hooks/useWorkContext'
import { readStored, stringFields, useWorkspaceScope, workspaceKey, writeStored } from '../../hooks/workspaceStorage'
import type { Route } from '../../hooks/useHashRoute'

type SavedView = { id: string; name: string; values: Record<string, string> }
export function SavedViews<T extends Record<string, string>>({ route, value, onChange, presets = [] }: {
  route: Route; value: T; onChange: (value: T) => void; presets?: { name: string; value: T }[]
}) {
  const scope = useWorkspaceScope()
  const key = workspaceKey(scope, `saved:${route}`)
  const [views, setViews] = useState<SavedView[]>(() => {
    const stored = readStored('local', key)
    return Array.isArray(stored) ? stored.filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string' && item.values && typeof item.values === 'object').slice(0, 20) : []
  })
  const [selected, setSelected] = useState('')
  const [editing, setEditing] = useState<'save' | 'rename' | null>(null)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const persist = (next: SavedView[]) => {
    if (!writeStored('local', key, next)) { setMessage('浏览器无法保存常用视图，当前筛选仍可使用'); return false }
    setViews(next); setMessage('常用视图已保存，仅当前浏览器可用'); return true
  }
  const commit = () => {
    const title = name.trim()
    if (!title) { setMessage('请填写视图名称'); return }
    if (views.some((item) => item.name === title && (editing === 'save' || item.id !== selected))) { setMessage('视图名称已存在，请换一个名称'); return }
    if (editing === 'save' && views.length >= 20) { setMessage('最多保存 20 个视图，请先删除不再使用的视图'); return }
    const id = editing === 'rename' ? selected : crypto.randomUUID()
    const next = editing === 'rename' ? views.map((item) => item.id === selected ? { ...item, name: title } : item) : [...views, { id, name: title, values: value }]
    if (persist(next)) { setSelected(id); setEditing(null) }
  }
  return <div className="saved-views" role="group" aria-label="常用视图管理">
    <div className="view-actions">
      {presets.map((preset) => <button type="button" key={preset.name} aria-pressed={Object.keys(preset.value).every((field) => preset.value[field] === value[field])} onClick={() => { onChange(preset.value); setSelected('') }}>{preset.name}</button>)}
      <label>常用视图<select aria-label="常用视图" value={selected} onChange={(event) => { const id = event.target.value; setSelected(id); setEditing(null); const found = views.find((item) => item.id === id); if (found) onChange(stringFields(found.values, value)) }}><option value="">选择已保存视图</option>{views.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <button type="button" onClick={() => { setEditing('save'); setName(''); setMessage('') }}>保存当前视图</button>
      {selected && <>
        <button type="button" onClick={() => persist(views.map((item) => item.id === selected ? { ...item, values: value } : item))}>更新为当前筛选</button>
        <button type="button" onClick={() => { setEditing('rename'); setName(views.find((item) => item.id === selected)?.name ?? '') }}>重命名视图</button>
        <button type="button" onClick={() => { if (persist(views.filter((item) => item.id !== selected))) { setSelected(''); setEditing(null) } }}>删除视图</button>
      </>}
    </div>
    {editing && <form className="view-name-form" onSubmit={(event) => { event.preventDefault(); commit() }}><label>视图名称<input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} autoFocus required /></label><button type="submit">保存名称</button><button type="button" onClick={() => setEditing(null)}>取消</button></form>}
    {message && <small role="status">{message}</small>}
  </div>
}

export function DraftNotice({ draft }: { draft: { pending: unknown; restore: () => void; clear: () => void; status: string } }) {
  return draft.pending ? <div className="draft-notice" role="status"><span>发现此表单的未提交暂存，请先恢复或放弃。</span><button type="button" onClick={draft.restore}>恢复暂存</button><button type="button" onClick={() => draft.clear()}>放弃暂存</button></div> : draft.status ? <p className="draft-status" role="status">{draft.status}</p> : null
}

export function QuickDate({ label, name, value, onChange }: { label: string; name: string; value: string; onChange: (value: string) => void }) {
  return <div className="quick-date"><label>{label}<input type="date" name={name} aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} /></label><div aria-label={`${label}快捷选择`}>{(['today', 'tomorrow', 'monday'] as const).map((kind, i) => <button key={kind} type="button" title={dateShortcut(kind)} onClick={() => onChange(dateShortcut(kind))}>{['今天', '明天', '下周一'][i]}</button>)}</div>{value && <small>已选日期：{value}</small>}</div>
}

type Navigation = { position: number; total: number; previousId?: number; nextId?: number; previous: () => void; next: () => void; close: () => void; error: string; loading: boolean; reload: () => void }
export function RecordNavigation({ nav, busy = false, showReturn = true }: { nav: Navigation; busy?: boolean; showReturn?: boolean }) {
  return <div className="record-navigation"><nav aria-label="连续查看记录"><button type="button" onClick={nav.previous} disabled={busy || nav.previousId === undefined}>上一条</button><span aria-live="polite">{nav.position < 0 ? '当前记录不在筛选结果中' : `第 ${nav.position + 1} 条 / 共 ${nav.total} 条`}</span><button type="button" onClick={nav.next} disabled={busy || nav.nextId === undefined}>下一条</button>{showReturn && <button type="button" disabled={busy} onClick={nav.close}>返回列表</button>}</nav>{nav.loading && <p role="status">正在加载详情…</p>}{nav.error && <p role="alert">{nav.error}<button type="button" onClick={nav.reload}>重试详情</button></p>}</div>
}

export function StageInput({ value, stages, onChange }: { value: string; stages: string[]; onChange: (value: string) => void }) {
  const id = useId()
  return <label>阶段<input name="stage" aria-label="阶段" list={id} value={value} onChange={(event) => onChange(event.target.value)} /><datalist id={id}>{[...new Set(stages)].filter(Boolean).map((stage) => <option value={stage} key={stage} />)}</datalist><small>可选择已有阶段，也可继续填写其他阶段。</small></label>
}
