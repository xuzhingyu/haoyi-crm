import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, BookOpen, Building2, ClipboardList, ContactRound, LayoutDashboard, Menu, PanelLeftClose, PanelLeftOpen, Search, SlidersHorizontal, Smartphone, Sparkles, X } from 'lucide-react';
import { Button, Dialog, Field } from './components';
import { Select, Switch } from './controls';
import { Catalog } from './catalog';
import { SpecPage, type PageId, type Role } from './pages';

type View = PageId | 'catalog';
const navigation: { id: View; label: string; icon: ReactNode; roles: Role[] }[] = [
  { id: 'overview', label: '经营概览', icon: <LayoutDashboard />, roles: ['operator', 'leader'] },
  { id: 'leads', label: '客户线索', icon: <ContactRound />, roles: ['operator', 'leader', 'franchise'] },
  { id: 'detail', label: '客户详情', icon: <Search />, roles: ['operator', 'leader', 'franchise'] },
  { id: 'studio', label: '经营工作室', icon: <Building2 />, roles: ['operator', 'leader'] },
  { id: 'research', label: '情报研究', icon: <Sparkles />, roles: ['operator', 'leader'] },
  { id: 'tasks', label: '统一待办', icon: <ClipboardList />, roles: ['operator', 'leader', 'franchise'] },
  { id: 'catalog', label: '组件规范', icon: <BookOpen />, roles: ['operator', 'leader', 'franchise'] },
];
const roleNames: Record<Role, string> = { operator: '总部运营', leader: '经营查看', franchise: '加盟商' };

export function SpecApp() {
  const query = new URLSearchParams(window.location.search);
  const initialRole = query.get('role') as Role;
  const [role, setRole] = useState<Role>(Object.hasOwn(roleNames, initialRole) ? initialRole : 'operator');
  const [view, setView] = useState<View>(() => {
    const candidate = window.location.hash.slice(1) || query.get('page');
    return navigation.some(item => item.id === candidate) ? candidate as View : 'overview';
  });
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [phone, setPhone] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reducedTransparency, setReducedTransparency] = useState(() => {
    try { return localStorage.getItem('hy-spec-reduced-transparency') === 'true'; } catch { return false; }
  });
  const [toast, setToast] = useState('');
  const main = useRef<HTMLElement>(null);
  const allowed = navigation.filter(item => item.roles.includes(role));
  const current = allowed.find(item => item.id === view) ?? allowed[0];

  useEffect(() => {
    document.documentElement.dataset.hyTransparency = reducedTransparency ? 'reduced' : 'auto';
    try { localStorage.setItem('hy-spec-reduced-transparency', String(reducedTransparency)); } catch { /* The display preference is optional in restricted browsers. */ }
    return () => { delete document.documentElement.dataset.hyTransparency; };
  }, [reducedTransparency]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function navigate(next: View) {
    setView(next);
    setMenuOpen(false);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${next}`);
    // Wait until a mobile modal has restored its trigger before moving to content.
    window.requestAnimationFrame(() => main.current?.focus());
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function changeRole(value: string) {
    const next = value as Role;
    setRole(next); setToast('');
    if (!navigation.find(item => item.id === view)?.roles.includes(next)) setView(next === 'franchise' ? 'leads' : 'overview');
  }
  const nav = <nav aria-label="样板页面">{allowed.map(item => <button key={item.id} type="button" title={item.label} aria-label={item.label} aria-current={current.id === item.id ? 'page' : undefined} onClick={() => navigate(item.id)} className={`hy-nav-link ${item.id === 'catalog' ? 'hy-nav-reference' : ''} ${current.id === item.id ? 'hy-nav-active' : ''}`}><span aria-hidden="true">{item.icon}</span><span className="hy-nav-label">{item.label}</span>{current.id === item.id && <span className="hy-nav-dot" aria-hidden="true" />}</button>)}</nav>;

  if (phone) return <div className="hy-spec hy-device-preview"><div className="hy-device-toolbar"><Button icon={<ArrowLeft aria-hidden="true" />} onClick={() => setPhone(false)}>返回桌面</Button><span>手机预览 · 390px</span></div><iframe title="浩宜 CRM 手机交互样板" src={`./ui-spec.html?frame=1&page=${current.id}&role=${role}`} /></div>;

  return <div className={`hy-spec hy-shell ${collapsed ? 'hy-shell-collapsed' : ''}`}>
    <a className="hy-skip" href="#spec-content">跳到主要内容</a>
    <aside className="hy-sidebar hy-glass">
      <a className="hy-brand" href="#overview" onClick={event => { event.preventDefault(); navigate(role === 'franchise' ? 'leads' : 'overview'); }} aria-label="浩宜工作台首页"><span className="hy-brand-mark">H<span /></span><span className="hy-brand-name">浩宜<span>工作台</span></span></a>
      {nav}
      <div className="hy-sidebar-bottom"><span className="hy-avatar" aria-hidden="true">{role === 'franchise' ? '加' : role === 'leader' ? '经' : '运'}</span><span className="hy-nav-label">{roleNames[role]}<small>本地预览</small></span><Button variant="quiet" size="sm" iconOnly className="hy-collapse" aria-label={collapsed ? '展开侧栏' : '收起侧栏'} title={collapsed ? '展开侧栏' : '收起侧栏'} onClick={() => setCollapsed(value => !value)} icon={collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />} /></div>
    </aside>
    <div className="hy-workspace">
      <header className="hy-topbar hy-glass">
        <Button variant="quiet" iconOnly className="hy-mobile-menu" aria-label="打开导航" onClick={() => setMenuOpen(true)} icon={<Menu aria-hidden="true" />} />
        <div className="hy-workspace-name">浩宜 CRM</div>
        <div className="hy-topbar-actions">
          <span className="hy-demo-badge">演示数据</span>
          <Button variant="quiet" size="sm" className="hy-preview-settings-trigger hy-preview-settings-desktop" icon={<SlidersHorizontal aria-hidden="true" />} onClick={() => setSettingsOpen(true)}>预览设置</Button>
          <Button variant="quiet" size="sm" iconOnly className="hy-preview-settings-mobile" aria-label="预览设置" title="预览设置" icon={<SlidersHorizontal aria-hidden="true" />} onClick={() => setSettingsOpen(true)} />
        </div>
      </header>
      <main ref={main} id="spec-content" className="hy-main" tabIndex={-1}>
        {current.id === 'catalog' ? <Catalog notify={setToast} /> : <SpecPage key={role} page={current.id} role={role} onNavigate={navigate} notify={setToast} />}
      </main>
      <footer className="hy-shell-footer"><span>本地样板</span><span>UI 规范 v1.1</span></footer>
    </div>
    <Dialog open={menuOpen} title="工作空间" kind="drawer" onClose={() => setMenuOpen(false)}>{nav}</Dialog>
    <Dialog open={settingsOpen} title="预览设置" onClose={() => setSettingsOpen(false)} footer={<Button variant="primary" onClick={() => setSettingsOpen(false)}>完成</Button>}>
      <div className="hy-preview-settings">
        <Field label="预览角色">{control => <Select {...control} value={role} onValueChange={changeRole} options={Object.entries(roleNames).map(([value, label]) => ({ value, label }))} />}</Field>
        <div className="hy-preview-setting-row">
          <Switch label="降低透明度" checked={reducedTransparency} onCheckedChange={setReducedTransparency} />
          <p className="hy-display-note">系统要求减少透明度时，始终使用实色表面。</p>
        </div>
        {!query.has('frame') && <Button className="hy-preview-phone" icon={<Smartphone aria-hidden="true" />} onClick={() => { setSettingsOpen(false); setPhone(true); }}>手机预览</Button>}
      </div>
    </Dialog>
    <div className="hy-toast-host" aria-live="polite" aria-atomic="true">{toast && <div className="hy-toast"><span>{toast}</span><button aria-label="关闭提示" onClick={() => setToast('')}><X aria-hidden="true" /></button></div>}</div>
  </div>;
}
