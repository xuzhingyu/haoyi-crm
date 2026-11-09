import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpecApp } from './SpecApp';

afterEach(() => { window.history.replaceState(null, '', '/'); localStorage.removeItem('hy-spec-reduced-transparency'); vi.restoreAllMocks(); });
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open'); } });
});

describe('independent specimen shell', () => {
  it('keeps a franchise role out of legacy business pages and exposes its own lead pool', async () => {
    window.history.replaceState(null, '', '/ui-spec.html?role=franchise&page=studio');
    render(<SpecApp />);
    expect(screen.getByRole('heading', { name: '公开线索池' })).toBeInTheDocument();
    const navigation = screen.getByRole('navigation', { name: '样板页面' });
    expect(within(navigation).queryByRole('button', { name: '经营工作室' })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole('button', { name: '情报研究' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '新建客户' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '预览角色' })).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: '预览设置' })[0]);
    await userEvent.click(screen.getByRole('combobox', { name: '预览角色' }));
    await userEvent.click(screen.getByRole('option', { name: '总部运营' }));
    expect(within(screen.getByRole('navigation', { name: '样板页面' })).getByRole('button', { name: '经营工作室' })).toBeInTheDocument();
  });

  it('preserves the selected page and role in a local mobile preview', async () => {
    window.history.replaceState(null, '', '/ui-spec.html?page=leads&role=leader');
    render(<SpecApp />);
    await userEvent.click(screen.getAllByRole('button', { name: '预览设置' })[0]);
    await userEvent.click(screen.getByRole('button', { name: '手机预览' }));
    expect(screen.getByTitle('浩宜 CRM 手机交互样板')).toHaveAttribute('src', './ui-spec.html?frame=1&page=leads&role=leader');
    await userEvent.click(screen.getByRole('button', { name: '返回桌面' }));
    expect(screen.getByRole('heading', { name: '客户与线索' })).toBeInTheDocument();
  });

  it('supports keyboard chapter navigation and removes actual filter chips', async () => {
    window.history.replaceState(null, '', '/ui-spec.html#catalog');
    render(<SpecApp />);
    const tab = screen.getByRole('tab', { name: '视觉基础' });
    tab.focus();
    fireEvent.keyDown(tab, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: '按钮与表单' })).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: '按钮与表单' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '移除筛选 江苏省' }));
    expect(screen.queryByRole('button', { name: '移除筛选 江苏省' })).not.toBeInTheDocument();
  });

  it('persists reduced transparency and applies it to portaled dialogs', async () => {
    const { unmount } = render(<SpecApp />);
    await userEvent.click(screen.getAllByRole('button', { name: '预览设置' })[0]);
    const control = screen.getByRole('switch', { name: '降低透明度' });
    await userEvent.click(control);
    expect(document.documentElement).toHaveAttribute('data-hy-transparency', 'reduced');
    expect(localStorage.getItem('hy-spec-reduced-transparency')).toBe('true');
    expect(control.closest('dialog')).not.toBeNull();
    unmount();
    render(<SpecApp />);
    expect(document.documentElement).toHaveAttribute('data-hy-transparency', 'reduced');
  });
});
