import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Activity, ArrowUpRight, Building2, CheckCheck, ChevronRight, CircleDollarSign, ClipboardList, Compass, LayoutDashboard, LogOut, Menu, Search, Settings2, Sparkles } from "lucide-react";
import type { PortalApi } from "./api/types";
import { WorkspaceContext, useLoad } from "./workspace";
import { ErrorState, Loading } from "./components";
import { HomePage } from "./pages/HomePage";
import { IntelligencePage, ResearchPage, ResearchDetailPage } from "./pages/IntelligencePages";
import { ClaimsPage, OpportunitiesPage, PoolPage } from "./pages/CrmPages";
import { SettingsPage } from "./pages/WorkspacePages";
import { UnifiedTasksPage } from "./pages/UnifiedTasksPage";
import { OrganizationsPage } from "./pages/OrganizationsPage";
import { FollowupsPage } from "./pages/FollowupsPage";
import { CompanyIntelligencePage } from "./pages/CompanyIntelligencePage";
import { legacyHashTarget } from "./routing";
import { Presence } from "./ui/Presence";
import { NavigationSurface, ToastSurface } from "./ui/Chrome";
import { SidebarNavigation } from "./ui/SidebarNavigation";
import { getCurrentNavigation } from "./ui/navigation";
import { useMediaQuery, useWorkspaceMotion } from "./ui/Interactions";
import "./ui/tokens.css";
import "./styles.css";
import "./theme-light.css";
import "./ui/motion.css";
const LegacyPage = lazy(() => import("./legacy/LegacyPage"));

export function App({ api, onLogout, onReauthenticate }: { api: PortalApi; onLogout?: () => void; onReauthenticate?: () => void }) {
  return <BrowserRouter basename={import.meta.env.BASE_URL}><LegacyEntry><Workspace api={api} onLogout={onLogout} onReauthenticate={onReauthenticate} /></LegacyEntry></BrowserRouter>;
}

function LegacyEntry({ children }: { children: ReactNode }) {
  const location = useLocation();
  const target = legacyHashTarget(location.hash);
  return target ? <Navigate to={target} replace /> : children;
}

function Workspace({ api, onLogout, onReauthenticate }: { api: PortalApi; onLogout?: () => void; onReauthenticate?: () => void }) {
  const identity = useLoad(useCallback(() => api.getMe(), [api]));
  const [mobileMenu, setMobileMenu] = useState(false);
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const location = useLocation();
  const notify = useCallback((message: string, error = false) => setNotice({ message, error }), []);
  const workspaceRef = useRef<HTMLElement>(null);
  const isMobile = useMediaQuery('(max-width: 767px)');
  useWorkspaceMotion(workspaceRef, location.pathname, Boolean(identity.data) && !identity.error && !sessionExpired);
  useEffect(() => {
    if (!isMobile) setMobileMenu(false);
    else if (document.activeElement?.closest('.sidebar')) workspaceRef.current?.querySelector<HTMLButtonElement>('.mobile-menu-button')?.focus();
  }, [isMobile]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(null), 8000); return () => window.clearTimeout(timer); }, [notice]);
  useEffect(() => { const expired = () => setSessionExpired(true); window.addEventListener("haoyi:session-expired", expired); return () => window.removeEventListener("haoyi:session-expired", expired); }, []);
  if (identity.loading && !identity.data) return <div className="boot-screen"><div className="brand-emblem">H<span>Y</span></div><Loading text="正在进入浩宜工作台…" /></div>;
  if (identity.error || !identity.data) return <div className="boot-screen"><div className="brand-emblem">H<span>Y</span></div><h1>浩宜工作台</h1><ErrorState error={identity.error || "无法读取当前账号"} retry={() => { setSessionExpired(false); identity.reload(); }} />{onReauthenticate && <button className="button primary" onClick={onReauthenticate}>重新登录 <ArrowUpRight size={17} /></button>}</div>;
  if (sessionExpired) return <div className="boot-screen"><div className="brand-emblem">H<span>Y</span></div><h1>登录状态需要重新确认</h1><p>服务器未接受当前登录凭证，请重新登录；如果仍未成功，请联系管理员检查账号配置。</p>{onReauthenticate && <button className="button primary" onClick={onReauthenticate}>重新登录 <ArrowUpRight size={17} /></button>}</div>;
  const user = identity.data;
  const executive = user.roles.includes("hq_executive");
  const nav: { to: string; label: string; icon: typeof LayoutDashboard; group: string }[] = [
    { to: "/", label: "工作台", icon: LayoutDashboard, group: "工作空间" },
    ...(user.is_hq ? [
      { to: "/intelligence", label: "行业情报", icon: Compass, group: "工作空间" },
      { to: "/companies", label: "企业动态", icon: Building2, group: "工作空间" },
      { to: "/research", label: "AI 研究", icon: Sparkles, group: "工作空间" },
      { to: "/tasks", label: "待办", icon: CheckCheck, group: "工作空间" },
    ] : []),
    ...(user.is_hq && !executive ? [
      { to: "/crm/leads", label: "客户线索", icon: Search, group: "客户拓展" },
      { to: "/crm/followups", label: "跟进", icon: Activity, group: "客户拓展" },
      { to: "/crm/opportunities", label: "商机", icon: CircleDollarSign, group: "客户拓展" },
      { to: "/crm/batches", label: "批次与分发", icon: ClipboardList, group: "客户拓展" },
    ] : []),
    ...(!executive ? [
      { to: "/development/pool", label: "公开线索池", icon: Search, group: "客户拓展" },
      { to: "/development/claims", label: "已领取线索", icon: ClipboardList, group: "客户拓展" },
    ] : []),
    ...(user.is_hq && !executive ? [
      { to: "/crm/franchises", label: "加盟档案", icon: Building2, group: "业务协作" },
      { to: "/crm/partners", label: "合作机构", icon: Building2, group: "业务协作" },
      { to: "/crm/delivery", label: "合同与履约", icon: ClipboardList, group: "业务协作" },
      { to: "/crm/trainings", label: "培训记录", icon: ClipboardList, group: "业务协作" },
      { to: "/crm/contributions", label: "沟通记录", icon: Activity, group: "业务协作" },
    ] : []),
    ...(user.is_hq ? [
      { to: executive ? "/crm/executive" : "/crm/overview", label: "经营概览", icon: LayoutDashboard, group: "经营管理" },
      { to: "/crm/reports", label: "经营报告", icon: ClipboardList, group: "经营管理" },
      { to: "/crm/knowledge", label: "知识文档", icon: ClipboardList, group: "经营管理" },
      ...(!executive ? [{ to: "/crm/news", label: "历史资讯", icon: Compass, group: "经营管理" }] : []),
      { to: "/crm/notifications", label: "通知", icon: Activity, group: "经营管理" },
      { to: "/settings", label: "设置", icon: Settings2, group: "经营管理" },
    ] : []),
  ];
  const currentNav = getCurrentNavigation(nav, location.pathname) ?? nav[0];
  return <WorkspaceContext.Provider value={{ api, user, notify }}><div id="legacy-portals" className="legacy-crm legacy-portal-root" /><div className="app-shell">
    <Presence present={!isMobile || mobileMenu} enterMs={isMobile ? 360 : 0} exitMs={isMobile ? 200 : 0}>
    {(!isMobile || mobileMenu) && <NavigationSurface mobile={isMobile} onClose={() => setMobileMenu(false)}>
      <NavLink to="/" className="brand" onClick={() => setMobileMenu(false)}><div className="brand-emblem">H<span>Y</span></div><div><strong>浩宜工作台</strong></div></NavLink>
      <SidebarNavigation items={nav} onNavigate={() => setMobileMenu(false)} />
      <div className="sidebar-bottom"><div className="workspace-scope"><Building2 size={17} /><span>{user.org_name || "所属组织未设置"}</span></div><div className="profile"><span className="avatar">{user.display_name?.slice(0, 1) || "用"}</span><div><strong>{user.display_name || user.user_id}</strong><small>{user.is_hq ? (user.roles.includes("hq_executive") ? "经营查看 · CEO" : "总部工作空间") : "加盟商工作空间"}</small></div>{onLogout && <button className="icon-button" title="退出登录" aria-label="退出登录" onClick={onLogout}><LogOut size={17} /></button>}</div></div>
    </NavigationSurface>}
    </Presence>
    <main ref={workspaceRef} className="main-workspace"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu-button" aria-label="打开导航" aria-expanded={mobileMenu} onClick={() => setMobileMenu(true)}><Menu size={22} /></button><span>浩宜</span><ChevronRight size={14} /><strong>{currentNav.label}</strong></div><div className="topbar-meta"><span>{new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric", weekday: "long" }).format(new Date())}</span></div></header>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/development/pool" element={<><DevelopmentTabs /><PoolPage /></>} />
        <Route path="/development/claims" element={<><DevelopmentTabs /><ClaimsPage /></>} />
        <Route path="/development/followups" element={<><DevelopmentTabs /><ClaimsPage followups /></>} />
        <Route path="/development/opportunities" element={<><DevelopmentTabs /><OpportunitiesPage /></>} />
        <Route path="/crm/pool" element={<Navigate to="/development/pool" replace />} />
        <Route path="/crm/claims" element={<Navigate to="/development/claims" replace />} />
        <Route path="/crm/organizations" element={<Navigate to="/settings/accounts" replace />} />
        <Route path="/crm/followups" element={user.is_hq && !executive ? <FollowupsPage /> : <Navigate to="/crm/executive" replace />} />
        <Route path="/crm/:section" element={user.is_hq ? <Suspense fallback={<Loading />}><LegacyPage /></Suspense> : <Navigate to="/" replace />} />
        <Route path="/intelligence" element={user.is_hq ? <IntelligencePage /> : <Navigate to="/" replace />} />
        <Route path="/companies" element={user.is_hq ? <CompanyIntelligencePage /> : <Navigate to="/" replace />} />
        <Route path="/research" element={user.is_hq ? <ResearchPage /> : <Navigate to="/" replace />} />
        <Route path="/research/:id" element={user.is_hq ? <ResearchDetailPage /> : <Navigate to="/" replace />} />
        <Route path="/tasks" element={user.is_hq ? <UnifiedTasksPage /> : <Navigate to="/" replace />} />
        <Route path="/settings/accounts" element={user.is_hq && !executive ? <OrganizationsPage /> : <Navigate to="/" replace />} />
        <Route path="/settings" element={user.is_hq ? <SettingsPage /> : <Navigate to="/" replace />} />
        <Route path="*" element={<div className="page"><h1>这个页面不存在</h1><NavLink className="button primary" to="/">回到工作台</NavLink></div>} />
      </Routes>
    </main>
    <Presence present={Boolean(notice)} enterMs={220} exitMs={160}>{notice && <ToastSurface notice={notice} onClose={() => setNotice(null)} />}</Presence>
  </div></WorkspaceContext.Provider>;
}




function DevelopmentTabs() { return <nav className="development-tabs" aria-label="公开线索工作区">{[["/development/pool","公开线索"],["/development/claims","已领取"],["/development/followups","领取后跟进"],["/development/opportunities","拓展商机"]].map(([to,label]) => <NavLink key={to} to={to}>{label}</NavLink>)}</nav>; }
