export type LeadCard = {
  id: string;
  business_name: string;
  city: string;
  district: string;
  categories: string[];
  freshness_date: string;
  completeness_grade: string;
  status: string;
};

export type PageResult<T> = { items: T[]; next_cursor: string | null };
export type PoolResponse = PageResult<LeadCard>;

export type CurrentUser = { user_id: string; display_name: string; org_id: string; org_name: string; roles: string[]; is_hq: boolean; permissions: string[] };
export type Budget = { daily_limit: number; spent: number; reserved: number; remaining: number; currency: string };
export type Integrations = Record<"aihot" | "autoloop" | "model", string | boolean | { status: string; configured?: boolean; detail?: string }>;
export type Article = { id: string; title: string; url: string; source_name: string; source_id: string; nature?: string; source_nature?: string; topic: string; published_at: string | null; fetched_at: string; summary: string; analysis: string | null; analysis_status: string; saved: boolean; note?: string; content?: string; content_kind?: 'rss_excerpt' | 'source_excerpt' | 'index_only'; upstream_updated_at?: string | null; snapshot_hash?: string | null };
export type IntelligenceFollow = { id: string; kind: 'topic' | 'source'; value: string; label: string; created_at: string };
export type IntelligenceOverview = { total: number; saved: number; followed: number; topics: { topic: string; count: number }[]; sources: Source[]; latest_sync_at: string | null; sync_error: string | null };
export type SourceDraft = { name: string; url: string; kind: 'rss' | 'web_list'; topic: string; interval_minutes: number; enabled: boolean; item_selector: string; link_selector: string; title_selector: string; date_selector: string; version?: string | null };
export type SourceVerification = { valid: boolean; count: number; items: { title: string; url: string; published_at: string | null; summary: string }[]; nature: string; checked_at: string };
export type Source = { nature?: string; id: string; name: string; url: string; topic: string; status: string; last_fetched_at: string | null; last_error: string | null; article_count: number };
export type Citation = { nature?: string; source_nature?: string; id: string; title: string; url: string; source_name: string; kind?: string };
export type Research = { id: string; title: string; question: string; status: string; phase: string; report: string | null; citations: Citation[]; error: string | null; created_at: string; updated_at: string; cost_cny: number; created_by: string; watch?: boolean; include_business_context?: boolean; business_context?: Record<string, unknown> };
export type WorkTask = { id: string; title: string; description: string; status: string; assignee_id: string | null; research_id: string | null; due_at: string | null; created_at: string; created_by: string };
export type TaskInput = { title: string; description?: string; research_id?: string; assignee_id?: string; due_at?: string | null };
export type AiJob = { id:string; purpose:string; source_system:string; status:string; cost_cny:number; created_at:string; finished_at:string|null };
export type Opportunity = { id: string; claim_id: string; business_name: string; org_id: string; stage: string; expected_value: string | null; updated_at: string };
export type Interaction = { id: string; channel: string; outcome: string; notes?: string | null; occurred_at: string; next_follow_up_at?: string | null };
export type Overview = { stats: { available_leads: number; active_claims: number; overdue_followups: number; opportunities: number; open_tasks: number; articles: number }; pipeline: { stage: string; count: number }[]; recent_articles: Article[]; recent_research: Research[]; budget: Budget; integrations: Integrations; legacy_crm?: { url: string; available: boolean; checked_at: string | null; stats: { leads: number; followups: number; opportunities: number; franchises: number; training_records: number } | null } };
export type WorkspaceSettings = { budget: Budget; integrations: Integrations; limits: { max_rounds: number; task_timeout_minutes: number; task_budget_cny: number }; schedule: { crawl: string; briefing: string }; sources: Source[] };
export type Proposal = { id: string; research_id: string; kind: string; target_id: string; target_system?: string; payload: { stage: string; stage_reason?: string; expected_value?: string }; status: string; created_at: string; confirmed_by?: string; confirmed_at?: string };
export type Franchisee = { id: string; name: string; status: string };
export type Membership = { id: string; franchisee_id: string; user_id: string; role: string };
export type CompanyCollectionRun = { id: string; status: string; mode: string; created_at: string; started_at?: string | null; finished_at?: string | null; new_records?: number; errors?: string[]; error?: string | null };
export type CompanyIntelligence = {
  companies: { id: string; name: string; verification_status: string; relationship_note: string }[];
  items: { id: string; company_id: string; company_name: string; title: string; category: 'news' | 'business' | 'sentiment'; summary: string; source_name: string; source_url: string; published_at: string | null; observed_at: string; verification_status: string }[];
  total: number;
  coverage: { message: string; last_run_at: string | null; status: string; tianyan_status: string; schedule: string };
  briefings: { day: string; news_count: number; business_count: number; sentiment_count: number; summary: string }[];
  runs: CompanyCollectionRun[];
};

export type ClaimDetail = {
  id: string;
  listing_id: string;
  status: string;
  claimed_at: string;
  first_touch_due: string;
  activity_due: string;
  protected_until: string;
  business_name: string;
  city: string;
  district: string;
  category: string;
  full_address: string | null;
  filing_number: string | null;
  unified_social_credit_code: string | null;
  representative: { name: string; role: string } | null;
  business_contacts: { kind: string; value: string }[];
  evidence: { field: string; value: string; source_url: string; captured_at: string }[];
};

export type InteractionInput = {
  channel: "phone" | "wechat" | "visit";
  outcome:
    | "no_answer"
    | "busy"
    | "connected"
    | "wechat_replied"
    | "appointment"
    | "quoted"
    | "soft_reject"
    | "hard_optout";
  notes?: string;
  next_follow_up_at?: string;
};

export interface PortalApi {
  getCompanyIntelligence(filters?: Record<string, string>): Promise<CompanyIntelligence>;
  collectCompanyIntelligence(mode: 'baseline' | 'daily'): Promise<CompanyCollectionRun>;
  crm<T = unknown>(path: string, options?: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown }): Promise<T>;
  getAiJobs(): Promise<{items:AiJob[]}>;
  importClaim(claimId:string): Promise<{status:string;execution_result?:{entity_id?:number}}>;
  getMe(): Promise<CurrentUser>;
  getFranchisees(): Promise<{ items: Franchisee[] }>;
  createFranchisee(input: { id: string; name: string }): Promise<Franchisee>;
  getMemberships(id: string): Promise<Membership[]>;
  addMembership(id: string, input: { user_id: string; role: string }): Promise<Membership>;
  removeMembership(id: string, memberId: string): Promise<unknown>;
  getOverview(): Promise<Overview>;
  getArticles(filters?: Record<string, string>): Promise<PageResult<Article>>;
  getArticle(id: string): Promise<Article>;
  getIntelligenceOverview(): Promise<IntelligenceOverview>;
  getIntelligenceFollows(): Promise<{ items: IntelligenceFollow[] }>;
  followIntelligence(input: { kind: 'topic' | 'source'; value: string }): Promise<unknown>;
  unfollowIntelligence(id: string): Promise<unknown>;
  updateArticleNote(id: string, note: string): Promise<{ note: string; updated_at: string }>;
  getSources(): Promise<Source[]>;
  getSourceConfig(id: string): Promise<SourceDraft & { id: string }>;
  validateSourceConfig(input: SourceDraft): Promise<SourceVerification>;
  createSourceConfig(input: SourceDraft): Promise<{ id: string; status: string; verification: SourceVerification }>;
  updateSourceConfig(id: string, input: SourceDraft): Promise<{ id: string; status: string; verification: SourceVerification }>;
  refreshSources(): Promise<unknown>;
  saveArticle(id: string, saved: boolean): Promise<unknown>;
  analyzeArticle(id: string): Promise<unknown>;
  getResearch(filters?: Record<string, string>): Promise<PageResult<Research>>;
  createResearch(input: { question: string; title?: string; article_ids?: string[]; create_task?: boolean; watch?: boolean; include_business_context?: boolean }): Promise<Research>;
  watchResearch(id: string, watch: boolean): Promise<unknown>;
  retryResearch(id: string): Promise<Research>;
  getResearchDetail(id: string): Promise<Research>;
  cancelResearch(id: string): Promise<unknown>;
  getWorkTasks(filters?: Record<string, string>): Promise<PageResult<WorkTask>>;
  createWorkTask(input: TaskInput): Promise<WorkTask>;
  updateWorkTask(id: string, input: Partial<TaskInput> & { status?: string }): Promise<WorkTask>;
  getSettings(): Promise<WorkspaceSettings>;
  getMembers(): Promise<{ items: { user_id: string; display_name: string }[] }>;
  updateSource(id: string, status: "active" | "paused"): Promise<unknown>;
  getProposals(researchId: string): Promise<PageResult<Proposal>>;
  confirmProposal(id: string): Promise<unknown>;
  rejectProposal(id: string): Promise<unknown>;
  getOpportunities(filters?: Record<string, string>): Promise<PageResult<Opportunity>>;
  getInteractions(claimId: string): Promise<Interaction[]>;
  getPool(filters?: Record<string, string>): Promise<PoolResponse>;
  claimLead(listingId: string, idempotencyKey: string): Promise<{ id: string }>;
  getClaims(filters?: Record<string, string>, headquarters?: boolean): Promise<PageResult<ClaimDetail>>;
  getClaim(claimId: string): Promise<ClaimDetail>;
  addInteraction(claimId: string, input: InteractionInput): Promise<unknown>;
  updateOpportunity(claimId: string, input: { stage: string; expected_value?: string }): Promise<unknown>;
  setContactPreference(claimId: string, input: { kind: string; reason?: string }): Promise<unknown>;
}
