import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LayoutDashboard } from 'lucide-react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SidebarNavigation, type SidebarEntry } from './SidebarNavigation';

const items: SidebarEntry[] = [
  { to: '/', label: '工作台', group: '工作空间', icon: LayoutDashboard },
  { to: '/research', label: 'AI 研究', group: '工作空间', icon: LayoutDashboard },
  { to: '/tasks', label: '待办', group: '工作空间', icon: LayoutDashboard },
  { to: '/development/pool', label: '公开线索池', group: '客户拓展', icon: LayoutDashboard },
  { to: '/development/claims', label: '已领取线索', group: '客户拓展', icon: LayoutDashboard },
  { to: '/crm/partners', label: '合作机构', group: '业务协作', icon: LayoutDashboard },
  { to: '/settings', label: '设置', group: '经营管理', icon: LayoutDashboard },
];

function RouteControls() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate('/settings/accounts')}>前往账号</button><button onClick={() => navigate(-1)}>返回上一页</button></>;
}

describe('collapsible business navigation', () => {
  it('keeps only the home link and four collapsed groups visible on the home page', () => {
    render(<MemoryRouter><SidebarNavigation items={items} onNavigate={() => {}} /></MemoryRouter>);
    const nav = screen.getByRole('navigation', { name: '主要导航' });
    expect(within(nav).getAllByRole('link')).toHaveLength(1);
    expect(within(nav).getByRole('link', { name: '工作台' })).toHaveAttribute('aria-current', 'page');
    const groups = within(nav).getAllByRole('button');
    expect(groups).toHaveLength(4);
    groups.forEach(group => {
      expect(group).toHaveAttribute('aria-expanded', 'false');
      const panel = document.getElementById(group.getAttribute('aria-controls')!);
      expect(panel).not.toBeNull();
      expect(panel).not.toBeVisible();
    });
  });

  it('supports keyboard expansion, a single open group, and skips collapsed links in the tab order', async () => {
    const keyboard = userEvent.setup();
    render(<MemoryRouter><SidebarNavigation items={items} onNavigate={() => {}} /></MemoryRouter>);
    const workspace = screen.getByRole('button', { name: '工作空间' });
    workspace.focus();
    await keyboard.keyboard('{Enter}');
    expect(workspace).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'AI 研究' })).toBeVisible();
    await keyboard.tab();
    expect(screen.getByRole('link', { name: 'AI 研究' })).toHaveFocus();
    workspace.focus();
    await keyboard.keyboard(' ');
    expect(workspace).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'AI 研究' })).not.toBeInTheDocument();
    await keyboard.tab();
    const customers = screen.getByRole('button', { name: '客户拓展' });
    expect(customers).toHaveFocus();
    await keyboard.keyboard('{Enter}');
    expect(customers).toHaveAttribute('aria-expanded', 'true');
    await keyboard.click(screen.getByRole('button', { name: '经营管理' }));
    expect(customers).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: '经营管理' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('link', { name: '公开线索池' })).not.toBeInTheDocument();
  });

  it('reveals detail ancestors on initial entry and history navigation while allowing manual collapse', async () => {
    const keyboard = userEvent.setup();
    render(<MemoryRouter initialEntries={['/research/report-7']}><SidebarNavigation items={items} onNavigate={() => {}} /><RouteControls /></MemoryRouter>);
    const workspace = screen.getByRole('button', { name: '工作空间' });
    expect(workspace).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'AI 研究' })).toHaveAttribute('aria-current', 'page');
    await keyboard.click(workspace);
    expect(workspace).toHaveAttribute('aria-expanded', 'false');
    await keyboard.click(screen.getByRole('button', { name: '前往账号' }));
    expect(screen.getByRole('button', { name: '经营管理' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: '设置' })).toHaveAttribute('aria-current', 'page');
    await keyboard.click(screen.getByRole('button', { name: '返回上一页' }));
    expect(workspace).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: '经营管理' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('link', { name: 'AI 研究' })).toHaveAttribute('aria-current', 'page');
  });

  it.each(['/development/followups', '/development/opportunities'])('keeps the customer group open for related route %s', path => {
    render(<MemoryRouter initialEntries={[path]}><SidebarNavigation items={items} onNavigate={() => {}} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: '客户拓展' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: '已领取线索' })).toBeVisible();
    expect(screen.getByRole('link', { name: '已领取线索' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: '工作空间' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('calls navigation completion only on a destination link and keeps the selected destination visible', async () => {
    const keyboard = userEvent.setup();
    const onNavigate = vi.fn();
    render(<MemoryRouter><SidebarNavigation items={items} onNavigate={onNavigate} /></MemoryRouter>);
    await keyboard.click(screen.getByRole('button', { name: '工作空间' }));
    expect(onNavigate).not.toHaveBeenCalled();
    await keyboard.click(screen.getByRole('link', { name: '待办' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: '待办' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: '工作空间' })).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelectorAll('nav [aria-current="page"]')).toHaveLength(1);
  });
});
