import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { ClaimDetail, CurrentUser, PortalApi, Research } from "./api/types";

const user: CurrentUser = { user_id: "real-user", display_name: "徐种宇", org_id: "hq", org_name: "浩宜总部", roles: ["hq_admin"], is_hq: true, permissions: ["crm:read", "crm:write", "research:write", "tasks:write", "sources:write", "proposals:confirm"] };
const lead = { id: "lead-1", business_name: "南通顺达汽车服务中心", city: "南通市", district: "崇川区", categories: ["quick_maintenance"], freshness_date: "2026-09-01", completeness_grade: "A", status: "available" };
const claim: ClaimDetail = { id: "claim-1", listing_id: "lead-1", business_name: "无锡安心汽车养护中心", city: "无锡市", district: "新吴区", category: "beauty_maintenance", full_address: "新吴区长江路 18 号", filing_number: "苏交维备001", unified_social_credit_code: null, representative: { name: "王诚", role: "经营负责人" }, business_contacts: [{ kind: "phone", value: "0510-80000001" }], evidence: [], status: "active", claimed_at: "2026-09-01T08:00:00Z", first_touch_due: "2026-09-03T08:00:00Z", activity_due: "2026-09-08T08:00:00Z", protected_until: "2026-10-01T08:00:00Z" };
const research: Research = { id: "research-1", title: "车险趋势研究", question: "最近新能源车险有哪些变化？", status: "completed", phase: "研究完成", report: "## 研究发现\n请结合原文核实。", citations: [], error: null, created_at: "2026-11-05T08:00:00Z", updated_at: "2026-11-05T08:00:00Z", cost_cny: .02, created_by: "real-user" };
const budget = { daily_limit: 20, spent: 0, reserved: 0, remaining: 20, currency: "CNY" };
function buildApi(): PortalApi {
  return {
    getCompanyIntelligence: vi.fn().mockResolvedValue({ companies: [], items: [], total: 0, coverage: { message: '尚未核实子公司范围。', last_run_at: null, status: 'not_started', tianyan_status: 'not_configured', schedule: '每天 08:45（北京时间）' }, briefings: [], runs: [] }), collectCompanyIntelligence: vi.fn().mockResolvedValue({ id: 'run-1', mode: 'daily', status: 'queued', created_at: '2026-11-09T01:00:00Z' }),
    getAiJobs: vi.fn().mockResolvedValue({items:[]}), importClaim: vi.fn().mockResolvedValue({status:"confirmed",execution_result:{entity_id:7}}), crm: vi.fn().mockResolvedValue([]), getMe: vi.fn().mockResolvedValue(user), getFranchisees: vi.fn().mockResolvedValue({items:[]}), createFranchisee: vi.fn(), getMemberships: vi.fn().mockResolvedValue([]), addMembership: vi.fn(), removeMembership: vi.fn(), retryResearch: vi.fn().mockResolvedValue(research),
    getOverview: vi.fn().mockResolvedValue({ stats: { available_leads: 12, active_claims: 4, overdue_followups: 1, opportunities: 2, open_tasks: 0, articles: 0 }, pipeline: [{ stage: "connected", count: 2 }], recent_articles: [], recent_research: [], budget, integrations: { aihot: false, autoloop: false, model: false } }),
    getPool: vi.fn().mockResolvedValue({ items: [lead], next_cursor: null }), claimLead: vi.fn().mockResolvedValue({ id: "claim-1" }),
    getClaims: vi.fn().mockResolvedValue({ items: [claim], next_cursor: null }), getClaim: vi.fn().mockResolvedValue(claim), addInteraction: vi.fn().mockResolvedValue({}), updateOpportunity: vi.fn().mockResolvedValue({}), setContactPreference: vi.fn().mockResolvedValue({}),
    getArticles: vi.fn().mockResolvedValue({ items: [], next_cursor: null }), getArticle: vi.fn(), getSources: vi.fn().mockResolvedValue([]), getSourceConfig:vi.fn(), validateSourceConfig:vi.fn(), createSourceConfig:vi.fn(), updateSourceConfig:vi.fn(), getIntelligenceOverview: vi.fn().mockResolvedValue({total:0,saved:0,followed:0,topics:[],sources:[],latest_sync_at:null,sync_error:null}), getIntelligenceFollows:vi.fn().mockResolvedValue({items:[]}), followIntelligence:vi.fn().mockResolvedValue({}), unfollowIntelligence:vi.fn().mockResolvedValue({}), updateArticleNote:vi.fn().mockResolvedValue({note:'',updated_at:'2026-11-06'}), refreshSources: vi.fn().mockResolvedValue({}), saveArticle: vi.fn().mockResolvedValue({}), analyzeArticle: vi.fn().mockResolvedValue(research),
    getResearch: vi.fn().mockResolvedValue({ items: [], next_cursor: null }), createResearch: vi.fn().mockResolvedValue(research), getResearchDetail: vi.fn().mockResolvedValue(research), cancelResearch: vi.fn().mockResolvedValue({}), watchResearch: vi.fn().mockResolvedValue({}),
    getWorkTasks: vi.fn().mockResolvedValue({ items: [], next_cursor: null }), createWorkTask: vi.fn(), updateWorkTask: vi.fn(), getSettings: vi.fn().mockResolvedValue({ budget, integrations: { aihot: false, autoloop: false, model: false }, limits: { max_rounds: 6, task_timeout_minutes: 20, task_budget_cny: 2 }, schedule: { crawl: "每 6 小时", briefing: "工作日 8:30" }, sources: [] }), getMembers: vi.fn().mockResolvedValue({ items: [{ user_id: user.user_id, display_name: user.display_name }] }), updateSource: vi.fn(), getProposals: vi.fn().mockResolvedValue({ items: [], next_cursor: null }), confirmProposal: vi.fn(), rejectProposal: vi.fn(), getOpportunities: vi.fn().mockResolvedValue({ items: [], next_cursor: null }), getInteractions: vi.fn().mockResolvedValue([]),
  };
}

beforeEach(() => { window.history.replaceState({}, "", "/"); Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } }); Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); } }); });

describe('company intelligence workspace', () => {
  it('filters records on the server and queues baseline collection for administrators', async () => {
    window.history.replaceState({}, '', '/companies'); const api = buildApi();
    api.getCompanyIntelligence = vi.fn().mockResolvedValue({ companies: [{id:'rongda',name:'上海容大数字技术有限公司',verification_status:'pending',relationship_note:'子公司范围待核验'}], items: [{id:'r1',company_id:'rongda',company_name:'上海容大数字技术有限公司',title:'可追溯的经营记录',category:'business',summary:'来源说明',source_name:'公开来源',source_url:'https://example.org/evidence',published_at:null,observed_at:'2026-11-09T00:45:00Z',verification_status:'pending'}],total:1,coverage:{message:'尚未完成全量覆盖',last_run_at:null,status:'partial',tianyan_status:'not_configured',schedule:'每天 08:45（北京时间）'},briefings:[],runs:[]});
    render(<App api={api} />);
    expect(await screen.findByRole('link', {name:'可追溯的经营记录'}, {timeout:5000})).toHaveAttribute('href','https://example.org/evidence');
    await userEvent.selectOptions(screen.getByLabelText('企业'), 'rongda');
    await userEvent.selectOptions(screen.getByLabelText('信息类型'), 'sentiment');
    await waitFor(() => expect(api.getCompanyIntelligence).toHaveBeenLastCalledWith(expect.objectContaining({company_id:'rongda',category:'sentiment',page:'1'})));
    await userEvent.click(screen.getByRole('button', {name:'历史回填'}));
    expect(api.collectCompanyIntelligence).toHaveBeenCalledWith('baseline');
    expect(await screen.findByRole('button', {name:'采集中…'})).toBeDisabled();
  });
  it('does not relabel old company records after a failed page request and retries the requested page', async () => {
    window.history.replaceState({}, '', '/companies'); const api = buildApi();
    const record = { id: 'r1', company_id: 'haoyi', company_name: '浩宜', title: '第一页企业记录', category: 'business', summary: '', source_name: '公开来源', source_url: 'https://example.org/record', published_at: null, observed_at: '2026-11-09', verification_status: 'pending' };
    const response = { companies: [], items: [record], total: 40, coverage: { message: '公开记录', last_run_at: null, status: 'partial', tianyan_status: 'not_configured', schedule: '每日' }, briefings: [], runs: [] };
    api.getCompanyIntelligence = vi.fn().mockResolvedValueOnce(response).mockRejectedValueOnce(new Error('第二页暂不可用')).mockResolvedValue({ ...response, items: [{ ...record, id: 'r2', title: '第二页企业记录' }] });
    render(<App api={api} />); await screen.findByRole('link', { name: record.title });
    await userEvent.click(within(screen.getByRole('navigation', { name: '信息记录分页' })).getByRole('button', { name: '下一页' }));
    expect(await screen.findByText('第二页暂不可用')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: record.title })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByRole('link', { name: '第二页企业记录' })).toBeInTheDocument();
    expect(api.getCompanyIntelligence).toHaveBeenLastCalledWith(expect.objectContaining({ page: '2', limit: '20' }));
  });
  it('keeps executive accounts read-only and separates empty data from absent risk', async () => {
    window.history.replaceState({}, '', '/companies'); const api = buildApi();
    api.getMe = vi.fn().mockResolvedValue({...user,roles:['hq_executive']});
    render(<App api={api} />);
    expect(await screen.findByText('暂无企业动态')).toBeInTheDocument();
    expect(screen.queryByRole('button', {name:'历史回填'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name:'立即更新'})).not.toBeInTheDocument();
    expect(screen.getByText(/未返回记录不代表没有经营或舆情风险/)).toBeInTheDocument();
  });
});

describe('intelligence workspace additions', () => {
  const article = { id: 'article-live', title: '公开政策资料', url: 'https://example.org/policy', source_name: '政策来源', source_id: 'source-live', source_nature: 'official', topic: '新能源售后', published_at: '2026-11-01', fetched_at: '2026-11-06', summary: '可追溯的资料摘要', content: '来源提供的较长摘录', content_kind: 'source_excerpt', note: '已有批注', analysis: null, analysis_status: 'not_started', saved: false };
  const source = { id: 'source-live', name: '政策来源', url: 'https://example.org/feed', topic: '新能源售后', status: 'active', nature: 'official', article_count: 8, last_fetched_at: '2026-11-06', last_error: null };
  it('filters by the selected source and persists a topic follow through the CRM API', async () => {
    window.history.replaceState({}, '', '/intelligence'); const api = buildApi();
    api.getIntelligenceOverview = vi.fn().mockResolvedValue({ total: 8, saved: 1, followed: 0, topics: [{ topic: '新能源售后', count: 8 }], sources: [source], latest_sync_at: '2026-11-06', sync_error: null });
    api.getArticles = vi.fn().mockResolvedValue({ items: [article], next_cursor: null }); render(<App api={api} />);
    await userEvent.click(await screen.findByRole('button', { name: '新能源售后 8' }));
    await userEvent.click(screen.getByRole('button', { name: '关注此专题' }));
    expect(api.followIntelligence).toHaveBeenCalledWith({ kind: 'topic', value: '新能源售后' });
    await userEvent.selectOptions(screen.getByLabelText('信源'), source.id);
    await waitFor(() => expect(api.getArticles).toHaveBeenLastCalledWith(expect.objectContaining({ topic: '新能源售后', source_id: source.id })));
  });
  it('saves private notes and protects an unsaved note on close', async () => {
    window.history.replaceState({}, '', '/intelligence?article=article-live'); const api = buildApi();
    let note = '已有批注'; api.getArticle = vi.fn().mockImplementation(async () => ({ ...article, note }));
    api.updateArticleNote = vi.fn().mockImplementation(async (_id, value) => { note = value; return { note, updated_at: '2026-11-06' }; });
    render(<App api={api} />); const input = await screen.findByRole('textbox', { name: '我的批注' });
    await userEvent.clear(input); await userEvent.type(input, '核实准入条件'); await userEvent.click(screen.getByRole('button', { name: '保存批注' }));
    await waitFor(() => expect(api.updateArticleNote).toHaveBeenCalledWith('article-live', '核实准入条件'));
    await userEvent.type(input, ' 待补充'); await userEvent.click(within(screen.getByRole('dialog', { name: '情报详情' })).getByRole('button', { name: '关闭弹窗' }));
    expect(await screen.findByRole('dialog', { name: '放弃未保存的批注？' })).toBeInTheDocument();
    expect(screen.getByText('来源摘录')).toBeInTheDocument();
  });
  it('includes business context only after selection and filters watched research on the server', async () => {
    window.history.replaceState({}, '', '/research'); const api = buildApi(); render(<App api={api} />);
    await userEvent.click(await screen.findByRole('button', { name: '持续关注' }));
    await waitFor(() => expect(api.getResearch).toHaveBeenLastCalledWith(expect.objectContaining({ watch: 'true' })));
    await userEvent.click(screen.getByRole('button', { name: '经营行动清单' }));
    expect(screen.getByRole('checkbox', { name: '结合经营汇总' })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: '开始研究' }));
    expect(api.createResearch).toHaveBeenCalledWith(expect.objectContaining({ include_business_context: true }));
  });
  it('previews a source without saving and submits only accepted fields with the config version', async () => {
    window.history.replaceState({}, '', '/settings'); const api = buildApi();
    api.getSettings = vi.fn().mockResolvedValue({ budget, integrations: { aihot: true, autoloop: true, model: true }, limits: { max_rounds: 6, task_timeout_minutes: 20, task_budget_cny: 2 }, schedule: { crawl: '每 6 小时', briefing: '每天' }, sources: [source] });
    api.getSourceConfig = vi.fn().mockResolvedValue({ id: source.id, name: source.name, url: source.url, topic: source.topic, kind: 'rss', interval_minutes: 360, enabled: true, item_selector: '', link_selector: '', title_selector: '', date_selector: '', version: 'version-1' });
    api.validateSourceConfig = vi.fn().mockResolvedValue({ valid: true, count: 1, items: [{ title: '验证资料', url: article.url, published_at: null, summary: '' }], nature: 'unknown', checked_at: '2026-11-06' });
    api.updateSourceConfig = vi.fn().mockResolvedValue({ id: source.id }); render(<App api={api} />);
    await userEvent.click(await screen.findByRole('button', { name: '编辑信源：政策来源' }));
    await screen.findByRole('textbox', { name: '信源名称' }); await userEvent.click(screen.getByRole('button', { name: '测试采集' }));
    expect(await screen.findByText('采集验证通过 · 1 条')).toBeInTheDocument(); expect(api.updateSourceConfig).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '验证并保存' }));
    await waitFor(() => expect(api.updateSourceConfig).toHaveBeenCalledWith(source.id, expect.objectContaining({ version: 'version-1', kind: 'rss' })));
    expect(vi.mocked(api.updateSourceConfig).mock.calls[0][1]).not.toHaveProperty('id');
  });
  it('keeps source configuration unavailable to non-admin readers', async () => {
    window.history.replaceState({}, '', '/settings'); const api = buildApi(); api.getMe = vi.fn().mockResolvedValue({ ...user, roles: ['hq_executive'], permissions: ['crm:read', 'research:write'] }); render(<App api={api} />);
    await screen.findByText('行业信源'); expect(screen.queryByRole('button', { name: '新增信源' })).not.toBeInTheDocument();
  });
  it('distinguishes pending, paused, failed and active sources and puts available coverage first', async () => {
    window.history.replaceState({}, '', '/intelligence'); const api = buildApi();
    api.getIntelligenceOverview = vi.fn().mockResolvedValue({ total: 8, saved: 0, followed: 0, topics: [], latest_sync_at: null, sync_error: null, sources: [
      { ...source, id: 'pending', name: '待接入协会', status: 'pending', article_count: 0 },
      { ...source, id: 'paused', name: '暂停来源', status: 'paused', article_count: 0 },
      { ...source, id: 'error', name: '异常来源', status: 'error', article_count: 0 },
      { ...source, id: 'active', name: '已连接保险来源', status: 'active', article_count: 8 },
    ] });
    render(<App api={api} />);
    expect(await screen.findByRole('button', { name: '待接入协会 官方 · 待接入 0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '暂停来源 官方 · 已暂停 0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '异常来源 官方 · 采集异常 0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '已连接保险来源 官方 · 已启用 8' })).toBeInTheDocument();
    expect(document.querySelector('.source-coverage-list button')).toHaveTextContent('已连接保险来源');
  });
});

describe("workspace", () => {
  it("counts two old actions and one new task once across the unified task sources", async () => {
    const api=buildApi(); const old=[{id:1,title:"历史跟进一",kind:"followup",done:false},{id:2,title:"历史跟进二",kind:"studio",done:false}];
    api.crm=vi.fn().mockImplementation(async(path:string)=>path.startsWith("/actions?")?old:old.map(x=>({...x,status:"待处理"})));
    api.getWorkTasks=vi.fn().mockImplementation(async(filters?:Record<string,string>)=>({items:filters?.status==="in_progress"?[]:[{id:"1",title:"研究待办",description:"",status:"open",assignee_id:null,research_id:null,due_at:null,created_at:"2026-11-05",created_by:"real-user"}],next_cursor:null}));
    // Flush the resolved identity and task-source promises before querying the aggregate.
    await act(async () => { render(<App api={api}/>); });
    const taskSummary = screen.getByRole("link", { name: "3 项未完成待办" });
    expect(taskSummary).toHaveAttribute("href", "/tasks?status=unfinished");
    await userEvent.click(taskSummary);
    expect(await screen.findByRole("button",{name:"完成：历史跟进一"})).toBeInTheDocument();expect(screen.getAllByRole("button",{name:"完成：历史跟进二"})).toHaveLength(1);expect(screen.getByRole("button",{name:"完成：研究待办"})).toBeInTheDocument();
  });
  it("does not offer the CEO a confirmation that writes to legacy business records", async () => {
    window.history.replaceState({}, "", "/research/research-1");const api=buildApi();
    api.getMe=vi.fn().mockResolvedValue({...user,roles:["hq_executive"],permissions:["crm:read","research:write","tasks:write","proposals:confirm"]});
    api.getProposals=vi.fn().mockResolvedValue({items:[{id:"p1",research_id:"research-1",kind:"legacy_opportunity_stage",target_system:"legacy_crm",target_id:"7",payload:{stage:"方案沟通",stage_reason:"需人工核对"},status:"pending",created_at:"2026-11-05"}],next_cursor:null});
    render(<App api={api}/>);expect(await screen.findByText("商机阶段 → 方案沟通")).toBeInTheDocument();expect(screen.queryByRole("button",{name:"查看并确认"})).not.toBeInTheDocument();
  });
  it("shows a media source accurately without calling its article official", async () => {
    window.history.replaceState({}, "", "/intelligence?article=media-1"); const api=buildApi();
    api.getArticle=vi.fn().mockResolvedValue({id:"media-1",title:"媒体报道",url:"https://example.org/story",source_name:"行业媒体",source_id:"source-1",source_nature:"media",topic:"新能源售后",published_at:null,fetched_at:"2026-11-05",summary:"资料摘要",analysis:null,analysis_status:"not_started",saved:false});
    render(<App api={api}/>);expect(await screen.findByText("行业媒体 · 媒体")).toBeInTheDocument();expect(screen.getByRole("link",{name:/阅读原文/})).toHaveAttribute("href","https://example.org/story");expect(screen.queryByText("阅读官方原文")).not.toBeInTheDocument();
  });
  it("opens all followup records from the business metric link", async () => {
    window.history.replaceState({}, "", "/crm/followups?status=all"); const api=buildApi();
    api.crm=vi.fn().mockResolvedValue([{id:1,lead_id:1,shop_name:"待跟进门店",status:"pending",due_date:null,completed_at:null},{id:2,lead_id:2,shop_name:"已完成门店",status:"done",due_date:null,completed_at:"2026-11-04"}]);
    render(<App api={api}/>);expect(await screen.findByText("待跟进门店")).toBeInTheDocument();expect(screen.getByText("已完成门店")).toBeInTheDocument();expect(screen.getByText("2 条")).toBeInTheDocument();
  });
  it("restores an old workbench deep link inside the unified application", async () => {
    window.history.replaceState({}, "", "/#/personal?status=open");
    const api = buildApi(); render(<App api={api} />);
    expect(await screen.findByRole("heading", { name: "待办" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/tasks");
    expect(window.location.search).toContain("view=business");
    expect(window.location.hash).toBe("");
    expect(api.getMe).toHaveBeenCalledTimes(1);
  });
  it("requires an explicit click to reauthenticate after a rejected session", async () => {
    const api = buildApi(); const reauthenticate = vi.fn(); render(<App api={api} onReauthenticate={reauthenticate} />);
    await screen.findByRole("navigation", { name: "主要导航" });
    act(() => window.dispatchEvent(new Event("haoyi:session-expired")));
    expect(await screen.findByText("登录状态需要重新确认")).toBeInTheDocument();
    expect(reauthenticate).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "重新登录" }));
    expect(reauthenticate).toHaveBeenCalledTimes(1);
  });
  it("keeps an initial unauthorized response on screen and permits a manual retry", async () => {
    const api = buildApi(); const reauthenticate = vi.fn(); api.getMe = vi.fn().mockRejectedValueOnce(new Error("登录凭证未被接受")).mockResolvedValue(user);
    render(<App api={api} onReauthenticate={reauthenticate} />);
    expect(await screen.findByText("登录凭证未被接受")).toBeInTheDocument();
    act(() => window.dispatchEvent(new Event("haoyi:session-expired")));
    expect(reauthenticate).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByRole("navigation", { name: "主要导航" })).toBeInTheDocument();
    expect(reauthenticate).not.toHaveBeenCalled();
    expect(api.getMe).toHaveBeenCalledTimes(2);
  });
  it("keeps merged task identities separate and confirms legacy completion", async () => {
    window.history.replaceState({}, "", "/tasks"); const api = buildApi();
    api.getWorkTasks = vi.fn().mockResolvedValue({ items: [{id:"7",title:"内部协作",description:"",status:"open",assignee_id:null,research_id:null,due_at:null,created_at:"2026-11-05",created_by:"real-user"}], next_cursor:null });
    api.crm = vi.fn().mockImplementation((path:string) => path === "/studio/actions" ? Promise.reject(new Error("台账暂不可用")) : Promise.resolve(path.startsWith("/actions?") ? [{id:7,title:"业务跟进",done:false,detail:"准备资料"}] : []));
    render(<App api={api}/>); await screen.findByRole("button", {name:"完成：业务跟进"});
    expect(screen.getByRole("button", {name:"完成：内部协作"})).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", {name:"完成：业务跟进"}));
    expect(api.crm).not.toHaveBeenCalledWith("/actions/7/complete",expect.anything());
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button",{name:"确认"}));
    await waitFor(()=>expect(api.crm).toHaveBeenCalledWith("/actions/7/complete",{method:"POST"}));
    expect(api.updateWorkTask).not.toHaveBeenCalled();
  });
  it("requires confirmation before importing a public claim into the business CRM", async () => {
    window.history.replaceState({}, "", "/development/claims"); const api=buildApi(); api.importClaim=vi.fn().mockResolvedValue({status:"confirmed"}); render(<App api={api}/>);
    await userEvent.click(await screen.findByRole("button",{name:"转入客户线索"})); expect(api.importClaim).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button",{name:"确认"}));
    await waitFor(()=>expect(api.importClaim).toHaveBeenCalledWith("claim-1"));
  });
  it("uses the actual identity and does not expose CRM write controls to the CEO", async () => {
    window.history.replaceState({}, "", "/crm/pool"); const api = buildApi(); api.getMe = vi.fn().mockResolvedValue({ ...user, display_name: "CEO 账号", roles: ["hq_executive"], permissions: ["crm:read", "research:write", "tasks:write"] }); render(<App api={api} />);
    expect(await screen.findByText(lead.business_name)).toBeInTheDocument(); expect(screen.getByText("CEO 账号")).toBeInTheDocument(); expect(screen.queryByText("王明")).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: /领取线索/ })).not.toBeInTheDocument(); expect(screen.queryByRole("link", { name: /我能带来什么/ })).not.toBeInTheDocument();
  });
  it("claims only after confirmation with an idempotency key", async () => {
    window.history.replaceState({}, "", "/crm/pool"); const api = buildApi(); api.getMe = vi.fn().mockResolvedValue({ ...user, is_hq: false, roles: ["franchise_member"], permissions: ["crm:read", "crm:write"] }); render(<App api={api} />); await screen.findByText(lead.business_name); await userEvent.click(screen.getByRole("button", { name: /领取线索/ })); expect(api.claimLead).not.toHaveBeenCalled(); await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "确认" })); expect(api.claimLead).toHaveBeenCalledWith("lead-1", expect.any(String)); expect(await screen.findByText("领取成功，完整信息已解锁")).toBeInTheDocument();
  });
  it("replaces pool pages and returns to the first page using known cursors", async () => {
    window.history.replaceState({}, "", "/crm/pool"); const api = buildApi();
    api.getPool = vi.fn().mockImplementation(async query => query?.cursor
      ? { items: [{ ...lead, id: "lead-2", business_name: "第二家门店" }], next_cursor: null }
      : { items: [lead], next_cursor: "cursor-2" });
    render(<App api={api} />); await screen.findByText(lead.business_name);
    const pagination = screen.getByRole("navigation", { name: "业务列表分页" });
    await userEvent.click(within(pagination).getByRole("button", { name: "下一页" }));
    expect(await screen.findByText("第二家门店")).toBeInTheDocument();
    expect(screen.queryByText(lead.business_name)).not.toBeInTheDocument();
    expect(api.getPool).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "cursor-2", limit: "20" }));
    expect(within(pagination).getByRole("button", { name: "下一页" })).toBeDisabled();
    await userEvent.click(within(pagination).getByRole("button", { name: "上一页" }));
    expect(await screen.findByText(lead.business_name)).toBeInTheDocument();
    expect(api.getPool).toHaveBeenLastCalledWith(expect.not.objectContaining({ cursor: expect.any(String) }));
  });
  it("resets research pagination when a status filter changes", async () => {
    window.history.replaceState({}, "", "/research"); const api = buildApi();
    api.getResearch = vi.fn().mockImplementation(async query => query?.status
      ? { items: [{ ...research, id: "filtered", title: "筛选后的研究" }], next_cursor: null }
      : query?.cursor
        ? { items: [{ ...research, id: "second", title: "第二页研究" }], next_cursor: null }
        : { items: [research], next_cursor: "research-next" });
    render(<App api={api} />); await screen.findByText(research.title);
    const pagination = screen.getByRole("navigation", { name: "研究记录分页" });
    await userEvent.click(within(pagination).getByRole("button", { name: "下一页" }));
    await screen.findByText("第二页研究");
    await userEvent.selectOptions(screen.getByLabelText("状态"), "completed");
    expect(await screen.findByText("筛选后的研究")).toBeInTheDocument();
    expect(screen.queryByText("第二页研究")).not.toBeInTheDocument();
    expect(api.getResearch).toHaveBeenLastCalledWith({ limit: "20", status: "completed", watch: "" });
    expect(within(pagination).getByRole("button", { name: "上一页" })).toBeDisabled();
  });
  it("sorts all task cursor batches before paging and resets the page when filtering sources", async () => {
    window.history.replaceState({}, "", "/tasks"); const api = buildApi();
    const tasks = Array.from({ length: 12 }, (_, index) => ({ id: `task-${index}`, title: `内部事项${index}`, description: "", status: "open", assignee_id: null, research_id: null, due_at: index < 10 ? "2026-12-01" : "2026-11-01", created_at: "2026-11-05", created_by: "real-user" }));
    api.getWorkTasks = vi.fn().mockImplementation(async query => query?.cursor
      ? { items: tasks.slice(10), next_cursor: null }
      : { items: tasks.slice(0, 10), next_cursor: "older-batch" });
    api.crm = vi.fn().mockImplementation(async (path: string) => path === "/studio/actions" ? [{ id: 23, title: "业务来源事项", kind: "studio", status: "待处理", due_date: "2026-12-02" }] : []);
    render(<App api={api} />);
    expect(await screen.findByRole("button", { name: "完成：内部事项10" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "完成：内部事项11" })).toBeInTheDocument();
    expect(api.getWorkTasks).toHaveBeenCalledWith({ status: "", limit: "100", cursor: "older-batch" });
    const pagination = screen.getByRole("navigation", { name: "待办列表分页" });
    await userEvent.click(within(pagination).getByRole("button", { name: "下一页" }));
    expect(screen.getByRole("button", { name: "完成：内部事项8" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "完成：内部事项10" })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("待办来源"), "studio");
    expect(screen.getByRole("button", { name: "完成：业务来源事项" })).toBeInTheDocument();
    expect(within(pagination).getByRole("button", { name: "上一页" })).toBeDisabled();
    expect(within(pagination).getByRole("button", { name: "下一页" })).toBeDisabled();
  });
  it("keeps franchise accounts inside the CRM and confirms opt-out recording", async () => {
    window.history.replaceState({}, "", "/crm/claims"); const api = buildApi(); api.getMe = vi.fn().mockResolvedValue({ ...user, roles: ["franchise_member"], is_hq: false, permissions: ["crm:read", "crm:write"] }); render(<App api={api} />); await screen.findByText(claim.business_name); expect(screen.queryByRole("link", { name: "AI 研究" })).not.toBeInTheDocument(); await userEvent.click(screen.getByRole("button", { name: "记录跟进" })); const dialog = screen.getByRole("dialog", { name: "新增跟进" }); await userEvent.selectOptions(within(dialog).getByLabelText("联系结果"), "hard_optout"); expect(within(dialog).getByRole("button", { name: "保存跟进" })).toBeDisabled(); await userEvent.click(within(dialog).getByRole("checkbox")); await userEvent.click(within(dialog).getByRole("button", { name: "保存跟进" })); await waitFor(() => expect(api.addInteraction).toHaveBeenCalledWith("claim-1", expect.objectContaining({ outcome: "hard_optout" })));
  });
  it("creates a research task and opens its actual result", async () => {
    window.history.replaceState({}, "", "/research"); const api = buildApi(); render(<App api={api} />); const question = await screen.findByRole("textbox", { name: "研究问题" }); await userEvent.type(question, research.question); await userEvent.click(screen.getByRole("button", { name: "开始研究" })); expect(await screen.findByText("研究发现")).toBeInTheDocument(); expect(api.createResearch).toHaveBeenCalledWith(expect.objectContaining({ question: research.question, create_task: true, watch: false })); expect(window.location.pathname).toBe("/research/research-1");
  });
  it("shows a retryable error instead of invented overview numbers", async () => {
    const api = buildApi(); api.getOverview = vi.fn().mockRejectedValue(new Error("服务不可用")); render(<App api={api} />); expect(await screen.findByText("服务不可用")).toBeInTheDocument(); expect(screen.queryByText("12")).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });
  it("confirms cancellation before stopping a running research task", async () => {
    window.history.replaceState({}, "", "/research/research-1"); const api = buildApi(); api.getResearchDetail = vi.fn().mockResolvedValueOnce({ ...research, status: "running", report: null, phase: "读取资料" }).mockResolvedValue({ ...research, status: "cancelled", report: null }); render(<App api={api} />); await userEvent.click(await screen.findByRole("button", { name: "停止研究" })); expect(api.cancelResearch).not.toHaveBeenCalled(); await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "确认" })); await waitFor(() => expect(api.cancelResearch).toHaveBeenCalledWith("research-1")); expect(await screen.findByText("已请求停止研究")).toBeInTheDocument();
  });
  it("keeps CEO business navigation within the existing read scope", async () => {
    const api = buildApi(); api.getMe = vi.fn().mockResolvedValue({ ...user, roles: ["hq_executive"], permissions: ["crm:read", "research:write", "tasks:write"] }); render(<App api={api} />);
    await userEvent.click(await screen.findByRole("button", { name: "经营管理" }));
    expect(screen.getByRole("link", { name: "经营概览" })).toHaveAttribute("href", "/crm/executive");
    expect(screen.queryByRole("button", { name: "客户拓展" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "业务协作" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "加盟档案" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "合作机构" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "经营报告" })).toHaveAttribute("href", "/crm/reports");
  });
  it("omits unavailable navigation groups and destinations for franchise accounts", async () => {
    const api = buildApi(); api.getMe = vi.fn().mockResolvedValue({ ...user, is_hq: false, roles: ["franchise_member"], permissions: ["crm:read", "crm:write"] }); render(<App api={api} />);
    const nav = await screen.findByRole("navigation", { name: "主要导航" });
    expect(within(nav).getAllByRole("button")).toHaveLength(1);
    expect(within(nav).getByRole("button", { name: "客户拓展" })).toHaveAttribute("aria-expanded", "false");
    expect(Array.from(nav.querySelectorAll("a")).map(link => link.getAttribute("href"))).toEqual(["/", "/development/pool", "/development/claims"]);
    await userEvent.click(within(nav).getByRole("button", { name: "客户拓展" }));
    expect(within(nav).getByRole("link", { name: "公开线索池" })).toBeVisible();
    expect(within(nav).getByRole("link", { name: "已领取线索" })).toBeVisible();
    expect(within(nav).getAllByRole("link")).toHaveLength(3);
  });
  it("uses one business metric source and native internal CRM routes", async () => {
    const api = buildApi(); api.getOverview = vi.fn().mockResolvedValue({ stats: { available_leads: 0, active_claims: 0, overdue_followups: 0, opportunities: 0, open_tasks: 0, articles: 0 }, pipeline: [], recent_articles: [], recent_research: [], budget, integrations: { aihot: false, autoloop: false, model: false }, legacy_crm: { url: "/workbench/", available: true, checked_at: "2026-11-05T08:00:00Z", stats: { leads: 19, followups: 8, opportunities: 6, franchises: 3, training_records: 2 } } }); render(<App api={api} />); expect(await screen.findByText("19")).toBeInTheDocument(); expect(screen.queryByText("线索工作区")).not.toBeInTheDocument(); expect(screen.queryByRole("link", { name: "原 CRM" })).not.toBeInTheDocument(); expect(screen.getByRole("region", { name: "业务概况" })).toBeInTheDocument(); expect(screen.getByRole("link", { name: "客户线索 19" })).toHaveAttribute("href", "/crm/leads?q=&status=&mode=表格"); expect(document.querySelector("iframe")).toBeNull();
  });
});
