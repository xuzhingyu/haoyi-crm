import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { readStored, workspaceKey, writeStored } from './workspaceStorage'

export type Route = 'news' | 'partners' | 'delivery' | 'overview' | 'contributions' | 'personal' | 'executive' | 'leads' | 'batches' | 'franchises' | 'opportunities' | 'trainings' | 'knowledge' | 'reports' | 'notifications' | 'settings'
const routes: Route[] = ['news', 'partners', 'delivery', 'overview', 'contributions', 'personal', 'executive', 'leads', 'batches', 'franchises', 'opportunities', 'trainings', 'knowledge', 'reports', 'notifications', 'settings']
export const routeEvent = 'workbench:route'
export type HashState = { route: Route; selectedId: number | null; params: URLSearchParams }
export function routePath(route: Route) { return route === 'personal' ? '/tasks?view=business' : `/crm/${route}` }
export const parseHash = (): HashState => {
  const path = window.location.pathname.split('/crm/')[1]?.split('/')[0]
  const route = routes.includes(path as Route) ? path as Route : 'personal'
  const params = new URLSearchParams(window.location.search)
  const id = Number(params.get('id'))
  return { route, selectedId: Number.isSafeInteger(id) && id > 0 ? id : null, params }
}
export function replaceRouteParams(params: URLSearchParams) {
  const query = params.toString()
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.dispatchEvent(new Event(routeEvent))
}
export function useHashRoute(scope = 'local:operator') {
  const location = useLocation()
  const push = useNavigate()
  const state = parseHash()
  const navigate = useCallback((next: Route, id?: number | null, extra?: Record<string, string>) => {
    const current = parseHash()
    writeStored('session', workspaceKey(scope, `route:${current.route}`), current.params.toString())
    const remembered = readStored('session', workspaceKey(scope, `route:${next}`))
    const params = current.route === next ? new URLSearchParams(location.search) : new URLSearchParams(typeof remembered === 'string' ? remembered : '')
    if (id !== undefined) { if (id) params.set('id', String(id)); else params.delete('id') }
    Object.entries(extra ?? {}).forEach(([key, value]) => params.set(key, value))
    if (next === 'personal') params.set('view', 'business')
    const query = params.toString()
    push(`${next === 'personal' ? '/tasks' : `/crm/${next}`}${query ? `?${query}` : ''}`)
  }, [scope, location.search, push])
  return { ...state, navigate }
}
