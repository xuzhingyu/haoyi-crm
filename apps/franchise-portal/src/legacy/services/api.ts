import { accessToken, developmentHeaders } from '../../auth'
export type Region = {
  province: string | null
  city: string | null
  lead_total: number
  monthly_order_capacity: number
  franchise_total?: number
  pending_batches?: number
  franchise_opportunities?: number
  channel_opportunities?: number
  delivery_risks?: number
  constituent_regions?: Array<{ province: string | null; city: string | null }>
}
export type Lead = {
  id: number
  shop_name: string
  province: string | null
  city: string | null
  district: string | null
  social_credit_code: string | null
  address: string | null
  new_energy_lifts: number | null
  monthly_order_count: number | null
  source: string
  status?: string
  phone?: string | null
  contact_name?: string | null
  follow_ups?: FollowUp[]
  history?: EntityEvent[]
}
export type FollowUp = { id: number; lead_id: number; status: string; note: string | null; due_date: string | null; completed_at: string | null }
export type EntityEvent = { id: number; action: string; actor?: string | null; reason?: string; created_at: string }
export type Opportunity = { id: number; shop_name: string; stage: string; estimated_value: number; opportunity_type?: string; next_action?: string | null; next_action_date?: string | null; willingness?: string | null; shop_capacity?: string | null; customer_base?: string | null; status?: string; lead_id?: number; exit_reason?: string | null }
export type Training = { id: number; shop_name: string | null; training_name: string; status: string; completed_at: string | null; franchise_id?: number | null; notes?: string | null }
export type KnowledgeDocument = { id: number; title: string; category: string; content: string; updated_at: string; version?: string; status?: string; parent_id?: number | null }
export type Report = { id: number; report_name: string; period: string; pdf_url: string; pptx_url: string; published?: boolean; published_at?: string | null; voided?: boolean }
export type ActionItem = { id: number; kind: string; title: string; detail: string; province: string | null; city: string | null; due_date: string | null; done: boolean; href?: string; source_type?: string | null; source_id?: number | null }
export type NotificationItem = { id: number; kind: string; title: string; detail: string; href: string; read_at: string | null; created_at: string }
export type UserSettings = { default_period: string; reminder_days: number; notify_overdue: boolean; notify_batches: boolean }
export type LeadBatch = { id: number; target_region: string | null; status: string; quality: string | null; franchise_id: number | null; franchise_code: string | null; row_count: number; dispatched_at: string | null; raw_feedback: string | null; confirmed_feedback: Record<string, unknown> | null; rows?: { id: number; lead_id: number | null; source_row: number; shop_name: string | null; status: string }[]; candidates?: FranchiseCandidate[] }
export type FranchiseCandidate = { franchise_id: number; franchise_code: string; shop_name: string | null; conflict: string | null; suggested: boolean; reason: string }
export type FranchiseProfile = { id: number; franchise_code: string; status: string; shop_name: string | null; province: string | null; city: string | null; territories: { id: number; province: string; city: string | null; exclusive: boolean }[]; delivery: { id: number; name: string; kind: string; status: string; planned_on: string | null; evidence: string | null }[]; support: { id: number; milestone: string; due_on: string | null; completed_on: string | null; notes: string | null }[] }
export type CityDetail = { province: string; city: string; leads: { id: number; shop_name: string; source: string }[]; opportunities: Opportunity[]; franchises: FranchiseProfile[]; actions: ActionItem[] }
export type Dashboard = {
  metrics: { lead_total: number; opportunity_total: number; franchise_total: number; training_total: number; training_completed: number; estimated_pipeline_value: number; monthly_order_capacity: number }
  funnel: { stage: string; count: number; estimated_value: number }[]
  regions: Region[]
  training: { total: number; completed: number; completion_rate: number }
  risks: { type: string; follow_up_id: number; lead_id: number; shop_name: string; due_date: string; reason: string }[]
  goals?: { period: string; qualified_franchise_opportunities: number; signed_franchises: number; qualified_channel_opportunities: number }
  unknowns?: { missing_next_action: number; application_unknown: number }
  updated_at?: string
  actions?: ActionItem[]
}

const configuredApiPrefix = `${(import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/$/, '')}/crm`

export const withApiPrefix = (path: string, apiPrefix = configuredApiPrefix) => {
  if (path === '/api') return apiPrefix
  return path.startsWith('/api/') ? `${apiPrefix.replace(/\/$/, '')}${path.slice('/api'.length)}` : path
}

const apiUrl = (path: string) => withApiPrefix(path)

const authHeaders = async (): Promise<Record<string,string>> => {
  const token = await accessToken()
  return {...developmentHeaders(), ...(token ? { Authorization: `Bearer ${token}` } : {})}
}

export class ApiError extends Error {
  status: number
  detail: string
  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
    this.detail = detail
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  Object.entries(await authHeaders()).forEach(([key, value]) => headers.set(key, String(value)))
  if (init?.method === 'POST' && /assistance|\/ai\/|news\/refresh/.test(path) && !headers.has('X-Request-ID')) headers.set('X-Request-ID', crypto.randomUUID())
  const result = await fetch(apiUrl(path), { ...init, headers })
  if (!result.ok) {
    if (result.status === 401) window.dispatchEvent(new Event('haoyi:session-expired'))
    let detail = result.status === 403 ? '当前账号没有此操作权限' : `业务请求未完成（${result.status}）`
    try {
      const body = await result.json() as { detail?: string }
      if (typeof body?.detail === 'string' && body.detail) detail = body.detail
    } catch {
      /* keep fallback */
    }
    throw new ApiError(result.status, detail)
  }
  if (result.status === 204) return undefined as T
  return result.json() as Promise<T>
}

export type Citation = { document_id: number; title: string; category: string; version?: string }
export type AssistanceMode = 'operations' | 'knowledge' | 'visit_prep' | 'weekly_report' | 'feedback' | 'opportunity' | 'review'
export type AssistanceHistoryItem = { role: 'user' | 'assistant'; content: string }
export type AssistanceRequest = {
  question: string
  mode?: AssistanceMode
  period?: string | null
  lead_id?: number | null
  region?: Pick<Region, 'province' | 'city' | 'constituent_regions'> | null
  history?: AssistanceHistoryItem[]
}
export type BusinessSource = { source: string; label: string }
export type Assistance = {
  guidance: string
  citations: Citation[]
  business_sources?: BusinessSource[]
  suggested_actions?: string[]
  sufficient_evidence: boolean
  provider: string
  fallback_reason?: string | null
  mode?: string
  draft_id?: number | null
  facts?: string
}
export type AuthUser = { id: number; username: string; display_name: string; role: string }
export const api = {
  dashboard: (period: string, signal?: AbortSignal, scope: 'personal' | 'executive' = 'personal') => request<Dashboard>(`/api/dashboard/${scope}?period=${encodeURIComponent(period)}`, { signal }),
  leads: () => request<Lead[]>('/api/leads'),
  lead: (id: number) => request<Lead>(`/api/leads/${id}`),
  createLead: (payload: Record<string, unknown>) => request<Lead>('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  updateLead: (id: number, payload: Record<string, unknown>) => request<Lead>(`/api/leads/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  addFollowUp: (id: number, payload: Record<string, unknown>) => request<FollowUp>(`/api/leads/${id}/follow-ups`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  completeFollowUp: (id: number) => request<FollowUp>(`/api/follow-ups/${id}/complete`, { method: 'POST' }),
  convertLead: (id: number, payload: Record<string, unknown>) => request<Opportunity>(`/api/leads/${id}/convert`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  archiveLead: (id: number, reason?: string) => request<Lead>(`/api/leads/${id}/archive`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }),
  voidLead: (id: number, reason: string) => request<Lead>(`/api/leads/${id}/void`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }),
  history: (entity: string, id: number) => request<EntityEvent[]>(`/api/entities/${entity}/${id}/history`),
  opportunities: (opportunityType?: string) => request<Opportunity[]>(opportunityType === 'all' ? '/api/opportunities?detail=true' : opportunityType ? `/api/opportunities?opportunity_type=${opportunityType}` : '/api/opportunities'),
  createOpportunity: (payload: Record<string, unknown>) => request<Opportunity>('/api/opportunities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  updateOpportunity: (id: number, payload: Record<string, unknown>) => request<Opportunity>(`/api/opportunities/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  closeOpportunity: (id: number, reason: string) => request<Opportunity>(`/api/opportunities/${id}/close`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }),
  signOpportunity: (id: number) => request<FranchiseProfile>(`/api/opportunities/${id}/sign`, { method: 'POST' }),
  trainings: () => request<Training[]>('/api/trainings'),
  createTraining: (payload: Record<string, unknown>) => request<Training>('/api/trainings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  updateTraining: (id: number, payload: Record<string, unknown>) => request<Training>(`/api/trainings/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  completeTraining: (id: number) => request<Training>(`/api/trainings/${id}/complete`, { method: 'POST' }),
  cancelTraining: (id: number, reason: string) => request<Training>(`/api/trainings/${id}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }),
  knowledge: (query?: string) => request<KnowledgeDocument[]>(query ? `/api/knowledge-documents?q=${encodeURIComponent(query)}` : '/api/knowledge-documents'),
  createKnowledge: (payload: Record<string, unknown>) => request<KnowledgeDocument>('/api/knowledge-documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  updateKnowledge: (id: number, payload: Record<string, unknown>) => request<KnowledgeDocument>(`/api/knowledge-documents/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  publishKnowledge: (id: number) => request<KnowledgeDocument>(`/api/knowledge-documents/${id}/publish`, { method: 'POST' }),
  archiveKnowledge: (id: number) => request<KnowledgeDocument>(`/api/knowledge-documents/${id}/archive`, { method: 'POST' }),
  reports: () => request<Report[]>('/api/reports'),
  assist: (input: string | AssistanceRequest, signal?: AbortSignal) => {
    const payload = typeof input === 'string' ? { question: input } : input
    return request<Assistance>('/api/assistance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal })
  },
  report: (period: string) => request<{ pdf_url: string; pptx_url: string }>('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ report_name: `${period}经营报告`, period }) }),
  publishReport: (id: number) => request<Report>(`/api/reports/${id}/publish`, { method: 'POST' }),
  voidReport: (id: number, reason: string) => request<Report>(`/api/reports/${id}/void`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }),
  previewImport: (file: File) => { const data = new FormData(); data.append('file', file); return request<{ valid_rows: number; invalid_rows: number }>('/api/imports/preview', { method: 'POST', body: data }) },
  uploadImport: (file: File) => { const data = new FormData(); data.append('file', file); return request('/api/imports/upload', { method: 'POST', body: data }) },
  batches: () => request<LeadBatch[]>('/api/batches'),
  batch: (id: number) => request<LeadBatch>(`/api/batches/${id}`),
  reviewBatch: (id: number) => request<LeadBatch>(`/api/batches/${id}/review`, { method: 'POST' }),
  dispatchBatch: (id: number, franchiseId: number) => request<LeadBatch>(`/api/batches/${id}/dispatch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ franchise_id: franchiseId }) }),
  saveFeedback: (id: number, text: string) => request<LeadBatch>(`/api/batches/${id}/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }),
  draftFeedback: (id: number) => request<{ id: number; draft: Record<string, unknown>; confirmed: boolean }>(`/api/batches/${id}/draft`, { method: 'POST' }),
  confirmDraft: (id: number) => request<{ id: number; confirmed: boolean }>(`/api/drafts/${id}/confirm`, { method: 'POST' }),
  setBatchQuality: (id: number, quality: string, reason?: string) => request<LeadBatch>(`/api/batches/${id}/quality`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quality, reason }) }),
  archiveBatch: (id: number) => request<LeadBatch>(`/api/batches/${id}/archive`, { method: 'POST' }),
  franchises: () => request<FranchiseProfile[]>('/api/franchises'),
  franchise: (id: number) => request<FranchiseProfile>(`/api/franchises/${id}`),
  createFranchise: (payload: Record<string, unknown>) => request<FranchiseProfile>('/api/franchises', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  updateFranchise: (id: number, payload: Record<string, unknown>) => request<FranchiseProfile>(`/api/franchises/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  closeFranchise: (id: number, reason: string) => request<FranchiseProfile>(`/api/franchises/${id}/close`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }),
  addTerritory: (id: number, payload: Record<string, unknown>) => request<FranchiseProfile>(`/api/franchises/${id}/territories`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  updateDelivery: (id: number, payload: Record<string, unknown>) => request<FranchiseProfile>(`/api/delivery-items/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  completeSupport: (id: number, notes?: string) => request<FranchiseProfile>(`/api/support-records/${id}/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }) }),
  actions: () => request<ActionItem[]>('/api/actions'),
  completeAction: (id: number) => request<{ id: number; done: boolean }>(`/api/actions/${id}/complete`, { method: 'POST' }),
  cityDetail: (province: string, city: string) => request<CityDetail>(`/api/map/city?province=${encodeURIComponent(province)}&city=${encodeURIComponent(city)}`),
  snapshots: () => request<{ id: number; period: string; version: number; frozen_at?: string }[]>('/api/snapshots'),
  snapshot: (id: number) => request<{ id: number; period: string; version: number; payload: Dashboard }>(`/api/snapshots/${id}`),
  freezeSnapshot: (period: string) => request('/api/snapshots', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ period }) }),
  notifications: () => request<NotificationItem[]>('/api/notifications'),
  readNotification: (id: number) => request<NotificationItem>(`/api/notifications/${id}/read`, { method: 'POST' }),
  readAllNotifications: () => request<{ ok: boolean }>('/api/notifications/read-all', { method: 'POST' }),
  archiveNotification: (id: number) => request<NotificationItem>(`/api/notifications/${id}/archive`, { method: 'POST' }),
  settings: () => request<UserSettings>('/api/settings'),
  saveSettings: (payload: Record<string, unknown>) => request<UserSettings>('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  updateGoals: (period: string, payload: Record<string, unknown>) => request(`/api/goals/${encodeURIComponent(period)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  login: (username: string, password: string) => request<{ token: string; role: string; username: string; display_name: string }>('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  me: () => request<AuthUser>('/api/auth/me'),
}

export async function downloadReport(href: string) {
  const url = new URL(withApiPrefix(href), window.location.origin)
  if (url.origin !== window.location.origin || !url.pathname.startsWith(configuredApiPrefix + '/reports/')) throw new Error('报告下载地址无效')
  const response = await fetch(url.href, {headers: await authHeaders()})
  if (!response.ok) throw new Error(response.status === 403 ? '当前账号无权下载这份报告' : '报告下载失败，请重试')
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl; anchor.download = url.pathname.split('/').pop() || 'report'; anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
