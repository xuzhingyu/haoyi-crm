import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { parseHash, replaceRouteParams, routeEvent, type Route } from './useHashRoute'
import { readStored, stringFields, useWorkspaceScope, workspaceKey, writeStored } from './workspaceStorage'

export function useViewState<T extends Record<string, string>>(route: Route, defaults: T) {
  const scope = useWorkspaceScope()
  const key = workspaceKey(scope, `view:${route}`)
  const initial = () => {
    const current = parseHash()
    const cached = stringFields(readStored('session', key), defaults)
    return current.route === route ? stringFields(Object.fromEntries(current.params), cached) : cached
  }
  const initialRef = useRef(initial); initialRef.current = initial
  const [value, setValue] = useState<T>(initial)
  const currentValue = useRef(value)
  currentValue.current = value
  useEffect(() => {
    const sync = () => { if (parseHash().route === route) { const next = initialRef.current(); currentValue.current = next; setValue(next) } }
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    window.addEventListener(routeEvent, sync)
    return () => { window.removeEventListener('hashchange', sync); window.removeEventListener('popstate', sync); window.removeEventListener(routeEvent, sync) }
  }, [key, route])
  const update = (patch: Partial<T>) => {
    const next = { ...currentValue.current, ...patch }
    currentValue.current = next
    setValue(next)
    writeStored('session', key, next)
    const current = parseHash()
    if (current.route === route) {
      // Explicit empty values allow Back to restore a cleared filter.
      Object.entries(next).forEach(([field, text]) => current.params.set(field, text))
      replaceRouteParams(current.params)
    }
  }
  return [value, update] as const
}

/** Event-time writes survive immediate navigation; mounting never overwrites a pending draft. */
export function useFormDraft<T extends Record<string, string>>(name: string, initial: T) {
  const scope = useWorkspaceScope()
  const key = workspaceKey(scope, `draft:${name}`)
  const [pending, setPending] = useState<T | null>(() => {
    const stored = readStored('session', key)
    return stored && typeof stored === 'object' && Object.keys(initial).every((field) => typeof (stored as Record<string, unknown>)[field] === 'string') ? stringFields(stored, initial) : null
  })
  const [value, setValue] = useState(initial)
  const [status, setStatus] = useState('')
  const change = (patch: Partial<T>) => {
    const next = { ...value, ...patch }
    setValue(next)
    setStatus(writeStored('session', key, next) ? '已暂存，尚未提交（仅当前标签页）' : '浏览器无法暂存，请在离开前提交或复制内容')
  }
  const clear = (next = initial) => { writeStored('session', key, null); setPending(null); setValue(next); setStatus('') }
  const restore = () => { if (pending) { setValue(pending); setPending(null); setStatus('已恢复暂存，尚未提交') } }
  return { value, change, pending, restore, clear, status }
}

export function useRecordNavigation<T extends { id: number }>(route: Route, items: T[], selectedId: number | null | undefined, onOpen?: (id: number | null) => void, load?: (id: number) => Promise<T>) {
  const scope = useWorkspaceScope()
  const key = workspaceKey(scope, `sequence:${route}`)
  const [id, setId] = useState<number | null>(selectedId ?? null)
  const [record, setRecord] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)
  const [ids, setIds] = useState<number[]>(() => {
    const stored = readStored('session', key)
    return Array.isArray(stored) && stored.every((item) => Number.isSafeInteger(item) && item > 0) && (selectedId == null || stored.includes(selectedId)) ? [...new Set(stored)] : []
  })
  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => { if (selectedId !== undefined) setId(selectedId) }, [selectedId])
  const itemsRef = useRef(items)
  itemsRef.current = items
  const itemSignature = load ? '' : JSON.stringify(items)
  useEffect(() => {
    let alive = true
    setRecord(null); setError('')
    if (id === null) { setLoading(false); return }
    setLoading(true)
    const promise = loadRef.current ? loadRef.current(id) : Promise.resolve(itemsRef.current.find((item) => item.id === id) ?? null)
    void promise.then((value) => { if (alive) { setRecord(value); if (!value) setError('当前记录已不在列表中，可继续查看下一条或返回列表。') } })
      .catch(() => { if (alive) setError('详情加载失败，记录可能已不可访问。可重试或继续查看其他记录。') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [id, tick, itemSignature])
  useEffect(() => {
    if (id !== null && !ids.length && items.length) {
      const next = items.map((item) => item.id)
      setIds(next); writeStored('session', key, next)
    }
  }, [id, items, ids.length, key])
  const open = (next: number, capture = true) => {
    if (capture) {
      const sequence = items.map((item) => item.id)
      setIds(sequence); writeStored('session', key, sequence)
      // Capture synchronously: the browser may deliver its scroll event after the drawer opens.
      if (id === null) writeStored('session', workspaceKey(scope, `scroll:${route}`), window.scrollY)
    }
    setId(next); onOpen?.(next)
  }
  const position = id === null ? -1 : ids.indexOf(id)
  const nextId = position >= 0 ? ids[position + 1] : ids[0]
  const previousId = position > 0 ? ids[position - 1] : undefined
  const close = () => { setId(null); setRecord(null); onOpen?.(null) }
  return { id, record: record?.id === id ? record : null, setRecord, error, loading, open, close, reload: () => setTick((value) => value + 1), position, total: ids.length, nextId, previousId,
    next: () => { if (nextId !== undefined) open(nextId, false) }, previous: () => { if (previousId !== undefined) open(previousId, false) } }
}

export function useListPosition(route: Route, ready: boolean, detailId?: number | null, inline = false) {
  const scope = useWorkspaceScope()
  const key = workspaceKey(scope, `scroll:${route}`)
  const restoring = useRef(true)
  const detail = useRef(detailId)
  detail.current = detailId
  const positionKey = inline ? detailId : detailId === null
  useLayoutEffect(() => {
    if (!ready) return
    const stored = readStored('session', key)
    const top = typeof stored === 'number' && Number.isFinite(stored) ? Math.max(0, stored) : 0
    const frame = requestAnimationFrame(() => {
      if (inline && detail.current && window.innerWidth <= 900) document.querySelector('.support-view .detail-panel')?.scrollIntoView({ block: 'start', behavior: 'instant' })
      else window.scrollTo({ top, behavior: 'instant' })
      restoring.current = false
    })
    return () => cancelAnimationFrame(frame)
  }, [key, ready, inline, positionKey])
  useEffect(() => {
    const save = () => { if (!restoring.current && !detail.current) writeStored('session', key, window.scrollY) }
    window.addEventListener('scroll', save, { passive: true })
    return () => window.removeEventListener('scroll', save)
  }, [key])
}

export function dateShortcut(kind: 'today' | 'tomorrow' | 'monday', now = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const date = new Date(`${day}T00:00:00Z`)
  const offset = kind === 'tomorrow' ? 1 : kind === 'monday' ? ((8 - date.getUTCDay()) % 7 || 7) : 0
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}
export function isThisWeek(due: string | null, now = new Date()) {
  if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return false
  const today = new Date(`${dateShortcut('today', now)}T00:00:00Z`)
  today.setUTCDate(today.getUTCDate() - (today.getUTCDay() + 6) % 7)
  const start = today.toISOString().slice(0, 10)
  today.setUTCDate(today.getUTCDate() + 6)
  return due >= start && due <= today.toISOString().slice(0, 10)
}
