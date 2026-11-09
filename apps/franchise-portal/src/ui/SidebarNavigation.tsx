import { useId, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Building2, ChartNoAxesCombined, ChevronRight, Compass, LayoutDashboard, Search } from 'lucide-react';
import { getCurrentNavigation, type SidebarEntry } from './navigation';
export type { SidebarEntry } from './navigation';

const groupIcons: Record<string, typeof LayoutDashboard> = {
  工作空间: Compass, 客户拓展: Search, 业务协作: Building2, 经营管理: ChartNoAxesCombined,
};

export function SidebarNavigation({ items, onNavigate }: { items: SidebarEntry[]; onNavigate: () => void }) {
  const { pathname } = useLocation();
  const id = useId();
  const home = items.find(item => item.to === '/');
  const current = getCurrentNavigation(items, pathname);
  const currentGroup = current?.to === '/' ? null : current?.group ?? null;
  const [selection, setSelection] = useState({ pathname, open: currentGroup });
  // Navigation reveals the destination; ordinary page refreshes keep the user's disclosure choice.
  const open = selection.pathname === pathname ? selection.open : currentGroup;
  if (selection.pathname !== pathname) setSelection({ pathname, open: currentGroup });
  const groups = new Map<string, SidebarEntry[]>();
  items.filter(item => item.to !== '/').forEach(item => groups.set(item.group, [...(groups.get(item.group) ?? []), item]));
  const link = (item: SidebarEntry, nested = false) => {
    const Icon = item.icon;
    const active = current?.to === item.to;
    return <Link to={item.to} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={`nav-link${active ? ' active' : ''}${nested ? ' nav-child-link' : ''}`}>
      {!nested && <Icon size={20} strokeWidth={1.7} aria-hidden="true" />}<span>{item.label}</span>
    </Link>;
  };
  return <nav className="sidebar-navigation" aria-label="主要导航">
    {home && <div className="nav-home">{link(home)}</div>}
    {[...groups].map(([group, children], index) => {
      const expanded = open === group;
      const Icon = groupIcons[group] ?? Compass;
      const panelId = `${id}-group-${index}`;
      return <div className={`nav-section${currentGroup === group ? ' is-current' : ''}`} key={group}>
        <button type="button" className="nav-section-toggle" aria-expanded={expanded} aria-controls={panelId} onClick={() => setSelection({ pathname, open: expanded ? null : group })}>
          <Icon size={20} strokeWidth={1.7} aria-hidden="true" /><span>{group}</span><ChevronRight className="nav-section-chevron" size={16} aria-hidden="true" />
        </button>
        <ul className="nav-submenu" id={panelId} aria-label={`${group}子菜单`} hidden={!expanded}>
          {children.map(item => <li key={item.to}>{link(item, true)}</li>)}
        </ul>
      </div>;
    })}
  </nav>;
}
