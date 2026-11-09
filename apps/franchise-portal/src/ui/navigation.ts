import type { LayoutDashboard } from 'lucide-react';

export type SidebarEntry = { to: string; label: string; icon: typeof LayoutDashboard; group: string };

/** Nested development views belong to the existing claimed-lead workspace. */
export function getCurrentNavigation(items: SidebarEntry[], pathname: string) {
  const path = ['/development/followups', '/development/opportunities'].some(route => pathname === route || pathname.startsWith(`${route}/`))
    ? '/development/claims' : pathname;
  return items.find(item => item.to !== '/' && (path === item.to || path.startsWith(`${item.to}/`)))
    ?? items.find(item => item.to === '/');
}
