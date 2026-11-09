import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FanStack, HoldConfirmButton, MorphSheet, ShowroomDialog, ShowroomPopover } from './advanced';
import { MotionContext } from './kit';

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open'); } });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function pointer(name: string, values: Record<string, unknown> = {}) {
  const event = new Event(name, { bubbles: true });
  for (const [key, value] of Object.entries({ button: 0, pointerId: 1, isPrimary: true, pointerType: 'mouse', clientX: 20, clientY: 20, ...values })) Object.defineProperty(event, key, { value });
  return event;
}

describe('tactile interaction components', () => {
  it('only confirms a completed hold once and cancels short keyboard holds', () => {
    vi.useFakeTimers();
    const confirm = vi.fn();
    render(<HoldConfirmButton onConfirm={confirm} />);
    const button = screen.getByRole('button', { name: '长按确认' });
    fireEvent.keyDown(button, { key: ' ' });
    act(() => vi.advanceTimersByTime(700));
    fireEvent.keyUp(button, { key: ' ' });
    act(() => vi.advanceTimersByTime(600));
    expect(confirm).not.toHaveBeenCalled();
    expect(button).toHaveAttribute('data-state', 'idle');
    fireEvent.keyDown(button, { key: ' ' });
    fireEvent.keyDown(button, { key: ' ', repeat: true });
    act(() => vi.advanceTimersByTime(1300));
    expect(confirm).toHaveBeenCalledTimes(1);
    fireEvent.keyUp(button, { key: ' ' });
    act(() => vi.advanceTimersByTime(2000));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(button).toHaveTextContent('已确认');
  });

  it('cancels on blur, pointer cancellation and when the control becomes busy', () => {
    vi.useFakeTimers();
    const confirm = vi.fn();
    const { rerender } = render(<HoldConfirmButton onConfirm={confirm} />);
    const button = screen.getByRole('button', { name: '长按确认' });
    fireEvent.keyDown(button, { key: ' ' });
    act(() => vi.advanceTimersByTime(500));
    fireEvent.blur(window);
    act(() => vi.advanceTimersByTime(1000));
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.keyDown(button, { key: ' ' });
    fireEvent.pointerCancel(button);
    act(() => vi.advanceTimersByTime(1500));
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.keyDown(button, { key: ' ' });
    rerender(<HoldConfirmButton busy onConfirm={confirm} />);
    act(() => vi.advanceTimersByTime(1500));
    expect(confirm).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
  });

  it('offers an ordinary confirmation without requiring a timed gesture', async () => {
    const confirm = vi.fn();
    render(<HoldConfirmButton onConfirm={confirm} />);
    await userEvent.click(screen.getByRole('button', { name: '使用普通确认' }));
    const dialog = screen.getByRole('dialog', { name: '确认操作' });
    expect(confirm).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: '确认执行' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '确认操作' })).not.toBeInTheDocument());
  });

  it('cancels captured pointer movement beyond the target and hidden-page holds', () => {
    vi.useFakeTimers();
    const confirm = vi.fn();
    render(<HoldConfirmButton onConfirm={confirm} />);
    const button = screen.getByRole('button', { name: '长按确认' });
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 80));
    fireEvent(button, pointer('pointerdown'));
    expect(button).toHaveAttribute('data-state', 'holding');
    act(() => vi.advanceTimersByTime(600));
    fireEvent(button, pointer('pointermove', { clientX: 220 }));
    act(() => vi.advanceTimersByTime(1300));
    expect(confirm).not.toHaveBeenCalled();
    fireEvent(button, pointer('pointerdown'));
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    act(() => vi.advanceTimersByTime(1300));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('fans out on keyboard focus and selects the actual content item', async () => {
    const selected = vi.fn();
    const items = [{ id: 'a', title: '门店走访', subtitle: '现场资料' }, { id: 'b', title: '技术培训' }];
    render(<FanStack items={items} onSelect={selected} />);
    const first = screen.getByRole('button', { name: '查看门店走访' });
    act(() => first.focus());
    expect(first.closest('.neo-fan')).toHaveAttribute('data-expanded', 'true');
    await userEvent.keyboard('{Enter}');
    expect(selected).toHaveBeenCalledWith(items[0]);
    expect(first).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: '收起卡片' }));
    expect(first.closest('.neo-fan')).toHaveAttribute('data-expanded', 'false');
  });

  it('requires one touch to expand a collapsed stack before selecting a card', () => {
    const selected = vi.fn();
    const items = [{ id: 'a', title: '门店照片' }, { id: 'b', title: '设备照片' }];
    render(<FanStack items={items} onSelect={selected} />);
    const item = screen.getByRole('button', { name: '查看门店照片' });
    fireEvent(item, pointer('pointerdown', { pointerType: 'touch' }));
    fireEvent.click(item);
    expect(item.closest('.neo-fan')).toHaveAttribute('data-expanded', 'true');
    expect(selected).not.toHaveBeenCalled();
    fireEvent(item, pointer('pointerdown', { pointerType: 'touch' }));
    fireEvent.click(item);
    expect(selected).toHaveBeenCalledWith(items[0]);
  });

  it('replays the fan once and clears a raised selection without firing its action', () => {
    vi.useFakeTimers();
    const selected = vi.fn();
    render(<FanStack items={[{ id: 'a', title: '门店资料' }, { id: 'b', title: '培训资料' }]} onSelect={selected} />);
    const card = screen.getByRole('button', { name: '查看门店资料' });
    act(() => card.focus());
    fireEvent.click(card);
    expect(card).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '重播摊开' }));
    expect(card).toHaveAttribute('aria-pressed', 'false');
    expect(card.closest('.neo-fan')).toHaveAttribute('data-expanded', 'false');
    act(() => vi.advanceTimersByTime(220));
    expect(card.closest('.neo-fan')).toHaveAttribute('data-expanded', 'true');
    act(() => vi.advanceTimersByTime(1000));
    expect(card.closest('.neo-fan')).toHaveAttribute('data-expanded', 'true');
    expect(selected).toHaveBeenCalledTimes(1);
  });

  it('makes replay immediate when motion is off and keeps every card keyboard accessible', () => {
    render(<MotionContext.Provider value="off"><FanStack items={Array.from({ length: 7 }, (_, i) => ({ id: String(i), title: `资料 ${i + 1}` }))} /></MotionContext.Provider>);
    fireEvent.click(screen.getByRole('button', { name: '重播摊开' }));
    expect(screen.getAllByRole('button', { name: /^查看资料/ })).toHaveLength(7);
    expect(screen.getByRole('button', { name: '查看资料 7' }).closest('.neo-fan')).toHaveAttribute('data-expanded', 'true');
  });

  it('provides all sheet snap points through buttons and restores focus when closed', async () => {
    function Example() {
      const [open, setOpen] = useState(false);
      return <MotionContext.Provider value="off"><button onClick={() => setOpen(true)}>打开面板</button><MorphSheet open={open} onClose={() => setOpen(false)} title="筛选客户"><label>城市<input /></label></MorphSheet></MotionContext.Provider>;
    }
    render(<Example />);
    const trigger = screen.getByRole('button', { name: '打开面板' });
    const focus = HTMLElement.prototype.focus;
    vi.spyOn(trigger, 'focus').mockImplementation(() => {
      // Native modal dialogs reject focus outside their top layer until close().
      if (!document.querySelector('dialog[open]')) focus.call(trigger);
    });
    await userEvent.click(trigger);
    const sheet = screen.getByRole('dialog', { name: '筛选客户' });
    expect(sheet).toHaveAttribute('data-snap', '0.4');
    await userEvent.click(within(sheet).getByRole('button', { name: '展开' }));
    expect(sheet).toHaveAttribute('data-snap', '0.72');
    await userEvent.click(within(sheet).getByRole('button', { name: '展开' }));
    expect(sheet).toHaveAttribute('data-snap', '0.94');
    expect(within(sheet).getByRole('button', { name: '展开' })).toBeDisabled();
    await userEvent.click(within(sheet).getByRole('button', { name: '收起' }));
    expect(sheet).toHaveAttribute('data-snap', '0.72');
    await userEvent.click(within(sheet).getByRole('button', { name: '关闭手势面板' }));
    expect(screen.queryByRole('dialog', { name: '筛选客户' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('supports arrow keys on the drag handle without dragging the body', async () => {
    render(<MotionContext.Provider value="off"><MorphSheet open onClose={() => {}} /></MotionContext.Provider>);
    const handle = screen.getByRole('button', { name: '拖动面板调整高度' });
    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    expect(screen.getByRole('dialog')).toHaveAttribute('data-snap', '0.72');
    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    expect(screen.getByRole('dialog')).toHaveAttribute('data-snap', '0.4');
  });

  it('jumps to a named sheet snap and announces the settled position', () => {
    render(<MotionContext.Provider value="off"><MorphSheet open onClose={() => {}} /></MotionContext.Provider>);
    fireEvent.click(screen.getByRole('button', { name: '全览 94%' }));
    expect(screen.getByRole('dialog')).toHaveAttribute('data-snap', '0.94');
    expect(screen.getByRole('button', { name: '全览 94%' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('全览，94%');
    fireEvent.click(screen.getByRole('button', { name: '轻览 40%' }));
    expect(screen.getByRole('dialog')).toHaveAttribute('data-snap', '0.4');
    expect(screen.getByRole('status')).toHaveTextContent('轻览，40%');
  });
});

describe('showroom overlay lifecycle', () => {
  it('retains modal constraints and content until exit completes, then restores the trigger', () => {
    vi.useFakeTimers();
    const close = vi.fn();
    function Example() {
      const [open, setOpen] = useState(false);
      return <div className="app-shell"><button onClick={() => setOpen(true)}>打开编辑</button><ShowroomDialog open={open} title="资料编辑" onClose={() => { close(); setOpen(false); }} footer={requestClose => <button onClick={requestClose}>取消编辑</button>}><input aria-label="资料名称" defaultValue="现场记录" /></ShowroomDialog></div>;
    }
    render(<Example />);
    const trigger = screen.getByRole('button', { name: '打开编辑' });
    act(() => trigger.focus());
    fireEvent.click(trigger);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.querySelector('.app-shell')).toHaveAttribute('inert');
    fireEvent.click(screen.getByRole('button', { name: '取消编辑' }));
    expect(screen.getByRole('dialog', { name: '资料编辑' })).toHaveAttribute('data-hy-phase', 'exiting');
    expect(screen.getByRole('textbox')).toHaveValue('现场记录');
    fireEvent.click(screen.getByRole('button', { name: '取消编辑' }));
    expect(close).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(179));
    expect(document.querySelector('.app-shell')).toHaveAttribute('inert');
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelector('.app-shell')).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(trigger).toHaveFocus();
  });

  it('preserves busy and dirty close protection, including the ordinary footer close callback', () => {
    const close = vi.fn();
    const view = (busy: boolean, dirty: boolean) => <MotionContext.Provider value="off"><ShowroomDialog open title="资料编辑" busy={busy} dirty={dirty} onClose={close} footer={requestClose => <button onClick={requestClose}>取消编辑</button>}><input aria-label="资料名称" defaultValue="保留修改" /></ShowroomDialog></MotionContext.Provider>;
    const { rerender } = render(view(true, true));
    fireEvent.click(screen.getByRole('button', { name: '取消编辑' }));
    expect(screen.getByRole('status')).toHaveTextContent('正在保存，请稍候再关闭。');
    expect(close).not.toHaveBeenCalled();
    rerender(view(false, true));
    fireEvent.click(screen.getByRole('button', { name: '取消编辑' }));
    const confirm = screen.getByRole('dialog', { name: '放弃未保存的修改？' });
    expect(confirm).toHaveTextContent('关闭后，本次修改将不会保存。');
    fireEvent.click(within(confirm).getByRole('button', { name: '继续编辑' }));
    expect(screen.queryByRole('dialog', { name: '放弃未保存的修改？' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('保留修改');
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '取消编辑' }));
    fireEvent.click(screen.getByRole('button', { name: '放弃修改' }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('finishes an active exit immediately when motion is turned off', () => {
    vi.useFakeTimers();
    const content = (open: boolean, level: 'rich' | 'off') => <MotionContext.Provider value={level}><ShowroomDialog open={open} title="退出测试" onClose={() => {}}><p>保留到退出结束</p></ShowroomDialog></MotionContext.Provider>;
    const { rerender } = render(content(true, 'rich'));
    rerender(content(false, 'rich'));
    expect(screen.getByRole('dialog')).toHaveAttribute('data-hy-phase', 'exiting');
    rerender(content(false, 'off'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('opens a keyboard-accessible popover and restores focus after Escape', () => {
    render(<MotionContext.Provider value="off"><ShowroomPopover label="快速设置" title="资料排序" footer={close => <button onClick={close}>应用排序</button>}><p>最近更新</p></ShowroomPopover></MotionContext.Provider>);
    const trigger = screen.getByRole('button', { name: '快速设置' });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: '应用排序' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('dialog', { name: '资料排序' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
