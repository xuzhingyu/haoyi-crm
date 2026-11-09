import type { InteractionInput, PoolResponse, PortalApi, ClaimDetail, CurrentUser, Overview, Article, Source, Research, WorkTask, TaskInput, WorkspaceSettings, Opportunity, Interaction, PageResult, Proposal, Franchisee, Membership } from "./types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ClientOptions = {
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
  fetcher?: typeof fetch;
  developmentHeaders?: Record<string, string>;
};

export class ApiClient implements PortalApi {
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: ClientOptions) {
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.options.getAccessToken();
    const headers: Record<string, string> = {
      ...this.options.developmentHeaders,
      ...(init.headers as Record<string, string> | undefined),
      Accept: "application/json",
    };
    if (init.body) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    for (const [name, value] of Object.entries(this.options.developmentHeaders ?? {})) {
      headers[name] = value;
    }
    const response = await this.fetcher(`${this.options.baseUrl}${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) {
      if (response.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event("haoyi:session-expired"));
      const payload = (await response.json().catch(() => ({}))) as { detail?: string | { msg?: string }[] };
      const detail = typeof payload.detail === "string" ? payload.detail : payload.detail?.map((item) => item.msg).filter(Boolean).join("；");
      throw new ApiError(response.status, detail || (response.status === 401 ? "登录已过期，请重新登录" : response.status === 403 ? "当前账号没有此操作权限" : "请求失败，请稍后重试"));
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  private query(filters: Record<string, string> = {}): string {
    const query = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ""))).toString();
    return query ? `?${query}` : "";
  }

  crm<T = unknown>(path: string, options: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown } = {}): Promise<T> {
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("..")) return Promise.reject(new Error("业务接口路径无效"));
    return this.request(`/crm${path}`, { method: options.method ?? "GET", ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) });
  }

  getMe(): Promise<CurrentUser> { return this.request("/me"); }
  getCompanyIntelligence(filters: Record<string, string> = {}): ReturnType<PortalApi['getCompanyIntelligence']> { return this.request(`/company-intelligence${this.query(filters)}`); }
  collectCompanyIntelligence(mode: 'baseline' | 'daily'): ReturnType<PortalApi['collectCompanyIntelligence']> { return this.request('/company-intelligence/collect', { method: 'POST', body: JSON.stringify({ mode }) }); }
  getAiJobs(): ReturnType<PortalApi["getAiJobs"]> { return this.request("/ai/jobs"); }
  importClaim(claimId:string): ReturnType<PortalApi["importClaim"]> { return this.request(`/claims/${encodeURIComponent(claimId)}/import-crm`, {method:"POST",body:JSON.stringify({confirmed:true})}); }
  getFranchisees(): Promise<{ items: Franchisee[] }> { return this.request("/hq/franchisees"); }
  createFranchisee(input: { id: string; name: string }): Promise<Franchisee> { return this.request("/admin/franchisees", { method: "POST", body: JSON.stringify(input) }); }
  getMemberships(id: string): Promise<Membership[]> { return this.request(`/admin/franchisees/${encodeURIComponent(id)}/memberships`); }
  addMembership(id: string, input: { user_id: string; role: string }): Promise<Membership> { return this.request(`/admin/franchisees/${encodeURIComponent(id)}/memberships`, { method: "POST", body: JSON.stringify(input) }); }
  removeMembership(id: string, memberId: string): Promise<unknown> { return this.request(`/admin/franchisees/${encodeURIComponent(id)}/memberships/${encodeURIComponent(memberId)}`, { method: "DELETE" }); }
  getOverview(): Promise<Overview> { return this.request("/workspace/overview"); }
  getArticles(filters: Record<string, string> = {}): Promise<PageResult<Article>> { return this.request(`/intelligence/articles${this.query(filters)}`); }
  getArticle(id: string): Promise<Article> { return this.request(`/intelligence/articles/${encodeURIComponent(id)}`); }
  getIntelligenceOverview(): ReturnType<PortalApi['getIntelligenceOverview']> { return this.request('/intelligence/overview'); }
  getIntelligenceFollows(): ReturnType<PortalApi['getIntelligenceFollows']> { return this.request('/intelligence/follows'); }
  followIntelligence(input: { kind: 'topic' | 'source'; value: string }): Promise<unknown> { return this.request('/intelligence/follows', { method: 'POST', body: JSON.stringify(input) }); }
  unfollowIntelligence(id: string): Promise<unknown> { return this.request(`/intelligence/follows/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
  updateArticleNote(id: string, note: string): ReturnType<PortalApi['updateArticleNote']> { return this.request(`/intelligence/articles/${encodeURIComponent(id)}/note`, { method: 'PATCH', body: JSON.stringify({ note }) }); }
  getSources(): Promise<Source[]> { return this.request("/intelligence/sources"); }
  getSourceConfig(id: string): ReturnType<PortalApi['getSourceConfig']> { return this.request(`/intelligence/source-config/${encodeURIComponent(id)}`); }
  validateSourceConfig(input: Parameters<PortalApi['validateSourceConfig']>[0]): ReturnType<PortalApi['validateSourceConfig']> { return this.request('/intelligence/source-config/validate', { method: 'POST', body: JSON.stringify(input) }); }
  createSourceConfig(input: Parameters<PortalApi['createSourceConfig']>[0]): ReturnType<PortalApi['createSourceConfig']> { return this.request('/intelligence/source-config', { method: 'POST', body: JSON.stringify(input) }); }
  updateSourceConfig(id: string, input: Parameters<PortalApi['updateSourceConfig']>[1]): ReturnType<PortalApi['updateSourceConfig']> { return this.request(`/intelligence/source-config/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }); }
  refreshSources(): Promise<unknown> { return this.request("/intelligence/refresh", { method: "POST" }); }
  saveArticle(id: string, saved: boolean): Promise<unknown> { return this.request(`/intelligence/articles/${encodeURIComponent(id)}/save`, { method: "POST", body: JSON.stringify({ saved }) }); }
  analyzeArticle(id: string): Promise<unknown> { return this.request(`/intelligence/articles/${encodeURIComponent(id)}/analyze`, { method: "POST" }); }
  getResearch(filters: Record<string, string> = {}): Promise<PageResult<Research>> { return this.request(`/research${this.query(filters)}`); }
  createResearch(input: { question: string; title?: string; article_ids?: string[]; create_task?: boolean; watch?: boolean; include_business_context?: boolean }): Promise<Research> { return this.request("/research", { method: "POST", body: JSON.stringify(input) }); }
  watchResearch(id: string, watch: boolean): Promise<unknown> { return this.request(`/research/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ watch }) }); }
  retryResearch(id: string): Promise<Research> { return this.request(`/research/${encodeURIComponent(id)}/retry`, { method: "POST" }); }
  getResearchDetail(id: string): Promise<Research> { return this.request(`/research/${encodeURIComponent(id)}`); }
  cancelResearch(id: string): Promise<unknown> { return this.request(`/research/${encodeURIComponent(id)}/cancel`, { method: "POST" }); }
  getWorkTasks(filters: Record<string, string> = {}): Promise<PageResult<WorkTask>> { return this.request(`/work-tasks${this.query(filters)}`); }
  createWorkTask(input: TaskInput): Promise<WorkTask> { return this.request("/work-tasks", { method: "POST", body: JSON.stringify(input) }); }
  updateWorkTask(id: string, input: Partial<TaskInput> & { status?: string }): Promise<WorkTask> { return this.request(`/work-tasks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }); }
  getSettings(): Promise<WorkspaceSettings> { return this.request("/workspace/settings"); }
  getMembers(): Promise<{ items: { user_id: string; display_name: string }[] }> { return this.request("/workspace/members"); }
  updateSource(id: string, status: "active" | "paused"): Promise<unknown> { return this.request(`/intelligence/sources/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) }); }
  getProposals(researchId: string): Promise<PageResult<Proposal>> { return this.request(`/proposals${this.query({ research_id: researchId })}`); }
  confirmProposal(id: string): Promise<unknown> { return this.request(`/proposals/${encodeURIComponent(id)}/confirm`, { method: "POST", body: JSON.stringify({ confirmed: true }) }); }
  rejectProposal(id: string): Promise<unknown> { return this.request(`/proposals/${encodeURIComponent(id)}/reject`, { method: "POST" }); }
  getOpportunities(filters: Record<string, string> = {}): Promise<PageResult<Opportunity>> { return this.request(`/opportunities${this.query(filters)}`); }
  getInteractions(claimId: string): Promise<Interaction[]> { return this.request(`/claims/${encodeURIComponent(claimId)}/interactions`); }

  getPool(filters: Record<string, string> = {}): Promise<PoolResponse> {
    const query = new URLSearchParams(filters).toString();
    return this.request(`/pool${query ? `?${query}` : ""}`);
  }

  claimLead(listingId: string, idempotencyKey: string): Promise<{ id: string }> {
    return this.request(`/leads/${listingId}/claim`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
    });
  }

  getClaims(filters: Record<string, string> = {}, headquarters = false): Promise<PageResult<ClaimDetail>> {
    return this.request(`${headquarters ? "/hq/claims" : "/claims"}${this.query(filters)}`);
  }

  getClaim(claimId: string): Promise<ClaimDetail> {
    return this.request(`/claims/${claimId}`);
  }

  addInteraction(claimId: string, input: InteractionInput): Promise<unknown> {
    return this.request(`/claims/${claimId}/interactions`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateOpportunity(claimId: string, input: { stage: string; expected_value?: string }): Promise<unknown> {
    return this.request(`/claims/${claimId}/opportunity`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  setContactPreference(claimId: string, input: { kind: string; reason?: string }): Promise<unknown> {
    return this.request(`/claims/${claimId}/contact-preference`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
}
