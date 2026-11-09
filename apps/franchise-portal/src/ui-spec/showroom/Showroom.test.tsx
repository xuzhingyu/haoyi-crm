import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Showroom } from './Showroom';

beforeEach(() => {
  window.history.replaceState(null, '', '/ui-spec.html');
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((media: string) => ({ media, matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open'); } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('soft showroom integration', () => {
  it('offers all eight sections and resets local interaction without resetting motion preference', async () => {
    render(<Showroom />);
    expect(within(screen.getByRole('navigation', { name: '组件分类' })).getAllByRole('button')).toHaveLength(8);
    await userEvent.click(screen.getByRole('button', { name: '按一下试试' }));
    expect(screen.getByText('已回应 1 次')).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('group', { name: '动效强度' })).getByRole('button', { name: '关闭' }));
    expect(document.documentElement).toHaveAttribute('data-neo-motion', 'off');
    await userEvent.click(screen.getByRole('button', { name: '重置当前示例' }));
    expect(screen.queryByText('已回应 1 次')).not.toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('data-neo-motion', 'off');
  });

  it('keeps section selection in the local URL and supports history restoration', async () => {
    render(<Showroom />);
    await userEvent.click(screen.getByRole('button', { name: '卡片与资料' }));
    expect(window.location.search).toBe('?section=cards');
    expect(screen.getByRole('heading', { level: 1, name: '卡片与资料' })).toBeInTheDocument();
    window.history.replaceState(null, '', '/ui-spec.html?section=buttons');
    fireEvent.popState(window);
    expect(screen.getByRole('heading', { level: 1, name: '按钮与触感' })).toBeInTheDocument();
  });

  it('switches color without discarding the interaction or resetting motion', async () => {
    render(<Showroom />);
    expect(document.documentElement).toHaveAttribute('data-neo-palette', 'energy');
    await userEvent.click(screen.getByRole('button', { name: '按一下试试' }));
    await userEvent.click(within(screen.getByRole('group', { name: '展厅配色' })).getByRole('button', { name: '柔雾' }));
    expect(document.documentElement).toHaveAttribute('data-neo-palette', 'mist');
    expect(screen.getByText('已回应 1 次')).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('data-neo-motion', 'rich');
    await userEvent.click(screen.getByRole('button', { name: '重置当前示例' }));
    expect(document.documentElement).toHaveAttribute('data-neo-palette', 'mist');
  });

  it('protects a changed customer draft and saves a valid edit only in the local example', async () => {
    window.history.replaceState(null, '', '/ui-spec.html?section=experience');
    render(<Showroom />);
    await userEvent.click(screen.getByRole('button', { name: '编辑客户' }));
    const input = screen.getByRole('textbox', { name: '客户名称' });
    await userEvent.clear(input);
    await userEvent.type(input, '新拟态体验门店');
    const dialog = screen.getByRole('dialog', { name: '编辑示例客户' });
    await userEvent.click(within(dialog).getByRole('button', { name: '关闭' }));
    expect(screen.getByRole('dialog', { name: '放弃未保存的修改？' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '继续编辑' }));
    await userEvent.click(within(dialog).getByRole('button', { name: '保存更改' }));
    expect(within(dialog).getByRole('button', { name: '保存更改' })).toBeDisabled();
    expect(await screen.findByRole('heading', { name: '新拟态体验门店' }, { timeout: 2500 })).toBeInTheDocument();
  });
});
