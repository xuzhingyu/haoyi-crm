import { createContext, useContext } from 'react'

export const WorkspaceScope = createContext('local:operator')
export const useWorkspaceScope = () => useContext(WorkspaceScope)
export const workspaceKey = (scope: string, name: string) => `workbench:ux:v1:${encodeURIComponent(scope)}:${name}`

export function readStored(kind: 'session' | 'local', key: string): unknown {
  try { return JSON.parse((kind === 'session' ? sessionStorage : localStorage).getItem(key) ?? 'null') }
  catch { return null }
}
export function writeStored(kind: 'session' | 'local', key: string, value: unknown): boolean {
  try {
    const storage = kind === 'session' ? sessionStorage : localStorage
    if (value === null) storage.removeItem(key)
    else storage.setItem(key, JSON.stringify(value))
    return true
  } catch { return false }
}
export function clearWorkspaceSession() {
  try { Object.keys(sessionStorage).filter((key) => key.startsWith('workbench:ux:v1:')).forEach((key) => sessionStorage.removeItem(key)) }
  catch { /* Storage can be disabled by the browser. */ }
}
export function stringFields<T extends Record<string, string>>(value: unknown, defaults: T): T {
  const result = { ...defaults }
  if (!value || typeof value !== 'object') return result
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const entry = (value as Record<string, unknown>)[String(key)]
    if (typeof entry === 'string') result[key] = entry as T[keyof T]
  }
  return result
}
