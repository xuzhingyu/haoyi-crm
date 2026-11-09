import { request } from './api'

// Each record kind is validated by its explicit server schema.
// Server-validated record schemas have heterogeneous field values.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RecordData = Record<string, any>
export type StudioRow = RecordData & { id: number; kind: string; version: number; created_at: string }
export const requestKey = () => globalThis.crypto?.randomUUID?.() ?? `request-${Date.now()}-${Math.random().toString(36).slice(2)}`
export const studio = {
  list: (kind: string) => request<StudioRow[]>(`/api/studio/records/${kind}`),
  save: (kind: string, data: RecordData, key: string, row?: StudioRow) => request<StudioRow>(`/api/studio/records/${kind}${row ? '/' + row.id : ''}`, { method: row ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data, request_key: key, version: row?.version }) }),
  actions: () => request<RecordData[]>('/api/studio/actions'),
  action: (id: number, data: RecordData) => request(`/api/studio/actions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  createAction: (data: RecordData, key: string) => request('/api/studio/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data, request_key: key }) }),
  totals: (id: number) => request<RecordData>(`/api/studio/contracts/${id}/totals`),
  history: (id: number) => request<StudioRow[]>(`/api/studio/history/${id}`),
  evidence: (id: number) => request<StudioRow>(`/api/studio/evidence/${id}`),
  summary: () => request<RecordData>('/api/studio/summary'),
  aiStatus: () => request<{local_configured: boolean; news_configured: boolean}>('/api/studio/ai/status'),
  draft: (text: string, party_id: number | null, mode: string) => request<RecordData>('/api/studio/ai/drafts', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text, party_id, mode}) }),
  confirm: (id: number, data: RecordData, key: string) => request<StudioRow>(`/api/studio/ai/drafts/${id}/confirm`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({data, request_key: key}) }),
  news: () => request<RecordData>('/api/studio/news'),
  refreshNews: (key: string) => request('/api/studio/news/refresh', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({data: {}, request_key: key})}),
  article: (id: number, data: RecordData) => request(`/api/studio/news/articles/${id}`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({data, request_key: requestKey()})}),
  articleAction: (id: number, data: RecordData, key: string) => request(`/api/studio/news/articles/${id}/action`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({data, request_key: key})}),
}

export const money = (value: unknown) => Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const today = () => new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Shanghai'}).format(new Date())
