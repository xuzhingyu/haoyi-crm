import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Confirm, Modal } from '../components';
import { ActionDrawer, ConfirmActionDialog } from '../legacy/components/operations';
import { Presence } from './Presence';

function tick(ms: number) { act(() => { vi.advanceTimersByTime(ms); }); }
let reduced = false;
let forced = false;
beforeEach(() => {
  vi.useFakeTimers(); reduced = false; forced = false;
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('reduced-motion') ? reduced : forced, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open'); } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('production overlay presence', () => {
  it('commits a save immediately but retains content, focus confinement and the scroll lock until exit', () => {
    const save = vi.fn();
    function Screen() {
      const [record, setRecord] = useState<string | null>(null);
      return <><div className="app-shell"><button onClick={() => setRecord('原始记录')}>打开</button></div><Presence present={record !== null}>{record && <Modal title="编辑记录" onClose={() => setRecord(null)}><p>{record}</p><button onClick={() => { save(); setRecord(null); }}>保存</button></Modal>}</Presence></>;
    }
    render(<Screen />);
    const trigger = screen.getByRole('button', { name: '打开' }); trigger.focus(); fireEvent.click(trigger); tick(320);
    const dialog = screen.getByRole('dialog'); const saveButton = within(dialog).getByRole('button', { name: '保存' });
    saveButton.focus(); fireEvent.click(saveButton);
    expect(save).toHaveBeenCalledTimes(1); expect(dialog).toHaveAttribute('data-hy-phase', 'exiting');
    expect(within(dialog).getByText('原始记录')).toBeInTheDocument(); expect(document.body.style.overflow).toBe('hidden');
    expect(document.querySelector('.app-shell')).toHaveAttribute('inert');
    fireEvent.click(saveButton); expect(save).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Tab' }); expect(within(dialog).getByRole('button', { name: '关闭弹窗' })).toHaveFocus();
    tick(179); expect(dialog).toBeInTheDocument(); tick(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(document.body.style.overflow).toBe('');
    expect(document.querySelector('.app-shell')).not.toHaveAttribute('inert'); expect(trigger).toHaveFocus();
  });

  it('cancels obsolete exit timers when the same overlay reopens', () => {
    const onExited = vi.fn();
    const content = (open: boolean, text: string) => <Presence present={open} onExited={onExited}>{open && <Modal title="记录" onClose={() => {}}><input aria-label="草稿" defaultValue="保留内容" /><p>{text}</p></Modal>}</Presence>;
    const view = render(content(true, '原记录')); tick(320);
    fireEvent.change(screen.getByLabelText('草稿'), { target: { value: '尚未保存的文本' } });
    view.rerender(content(false, '')); tick(80); view.rerender(content(true, '再次打开')); tick(320);
    expect(screen.getByLabelText('草稿')).toHaveValue('尚未保存的文本'); expect(screen.getByText('再次打开')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute('data-hy-phase', 'open'); expect(onExited).not.toHaveBeenCalled();
  });

  it('closes the top confirmation before its simultaneously closing drawer', () => {
    function Screen({ open }: { open: boolean }) { return <><div className="app-shell">背景页面</div><ActionDrawer title="客户详情" open={open} onClose={() => {}}><p>保留客户内容</p></ActionDrawer><Presence present={open}>{open && <ConfirmActionDialog title="归档确认" message="记录将保留" onClose={() => {}} onConfirm={() => {}} />}</Presence></>; }
    const view = render(<Screen open />); tick(360);
    const drawer = screen.getByRole('dialog', { name: '客户详情' }); const confirm = screen.getByRole('dialog', { name: '归档确认' });
    view.rerender(<Screen open={false} />);
    expect(confirm).toHaveAttribute('data-hy-phase', 'exiting'); expect(drawer).toHaveAttribute('data-hy-phase', 'open');
    tick(180); expect(confirm).not.toBeInTheDocument(); expect(drawer).toHaveAttribute('data-hy-phase', 'exiting');
    expect(within(drawer).getByText('保留客户内容')).toBeInTheDocument(); expect(document.body.style.overflow).toBe('hidden');
    tick(200); expect(drawer).not.toBeInTheDocument(); expect(document.body.style.overflow).toBe('');
  });

  it('propagates a parent close through a nested presence before removing the parent', () => {
    function Content() { const [nested, setNested] = useState(false); return <><Modal title="成员管理" onClose={() => {}}><button onClick={() => setNested(true)}>移除成员</button></Modal><Presence present={nested}>{nested && <Confirm title="移除确认" onClose={() => setNested(false)} onConfirm={() => {}}>权限将撤销</Confirm>}</Presence></>; }
    const view = render(<Presence present><Content /></Presence>); tick(320); fireEvent.click(screen.getByRole('button', { name: '移除成员' })); tick(320);
    view.rerender(<Presence present={false}>{null}</Presence>);
    expect(screen.getByRole('dialog', { name: '移除确认' })).toHaveAttribute('data-hy-phase', 'exiting');
    tick(180); expect(screen.queryByRole('dialog', { name: '移除确认' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '成员管理' })).toHaveAttribute('data-hy-phase', 'exiting');
    tick(180); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('restores focus to the nested confirmation trigger before the outer dialog closes', () => {
    function Screen() { const [confirm, setConfirm] = useState(false); return <Presence present><Modal title="成员" onClose={() => {}}><button onClick={() => setConfirm(true)}>删除成员</button><Presence present={confirm}>{confirm && <Confirm title="确认删除" onClose={() => setConfirm(false)} onConfirm={() => {}}>确认对象</Confirm>}</Presence></Modal></Presence>; }
    render(<Screen />); tick(320); const trigger = screen.getByRole('button', { name: '删除成员' }); trigger.focus(); fireEvent.click(trigger); tick(320);
    fireEvent.keyDown(window, { key: 'Escape' }); tick(180);
    expect(screen.queryByRole('dialog', { name: '确认删除' })).not.toBeInTheDocument(); expect(trigger).toHaveFocus();
  });

  it('honors busy and dirty guards before beginning any exit', () => {
    const guard = vi.fn(() => false);
    function Screen({ busy }: { busy: boolean }) { const [open, setOpen] = useState(true); return <Presence present={open} enterMs={360} exitMs={200}>{open && <ActionDrawer title="未保存表单" open busy={busy} onClose={() => { if (guard()) setOpen(false); }}><input aria-label="名称" defaultValue="草稿" /></ActionDrawer>}</Presence>; }
    const view = render(<Screen busy />); tick(360); fireEvent.keyDown(window, { key: 'Escape' });
    expect(guard).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: '关闭' })).toBeDisabled();
    view.rerender(<Screen busy={false} />); fireEvent.keyDown(window, { key: 'Escape' });
    expect(guard).toHaveBeenCalledTimes(1); expect(screen.getByRole('dialog')).toHaveAttribute('data-hy-phase', 'open'); expect(screen.getByLabelText('名称')).toHaveValue('草稿');
  });

  it.each(['reduced', 'forced'])('finishes immediately for %s motion mode', mode => {
    reduced = mode === 'reduced'; forced = mode === 'forced'; const onExited = vi.fn();
    const view = render(<Presence present onExited={onExited}><Modal title="详情" onClose={() => {}}>内容</Modal></Presence>);
    expect(screen.getByRole('dialog')).toHaveAttribute('data-hy-phase', 'open');
    view.rerender(<Presence present={false} onExited={onExited}>{null}</Presence>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(onExited).toHaveBeenCalledTimes(1);
  });

  it('opens an editor only after its detail overlay has left', () => {
    function Screen() {
      const [detail, setDetail] = useState(true); const [editor, setEditor] = useState(false); const editNext = useRef(false);
      return <><Presence present={detail} onExited={() => { if (editNext.current) setEditor(true); }}>{detail && <Modal title="详情" onClose={() => setDetail(false)}><button onClick={() => { editNext.current = true; setDetail(false); }}>编辑</button></Modal>}</Presence><Presence present={editor}>{editor && <Modal title="编辑" onClose={() => setEditor(false)}><input aria-label="名称" /></Modal>}</Presence></>;
    }
    render(<Screen />); tick(320); fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1); expect(screen.queryByRole('dialog', { name: '编辑' })).not.toBeInTheDocument();
    tick(180); expect(screen.queryByRole('dialog', { name: '详情' })).not.toBeInTheDocument(); expect(screen.getByRole('dialog', { name: '编辑' })).toBeInTheDocument();
  });

  it('keeps a failed confirmation open with its error and retry action', async () => {
    const fail = vi.fn().mockRejectedValue(new Error('服务失败'));
    render(<Presence present><ConfirmActionDialog title="归档" message="记录保留" onClose={() => {}} onConfirm={fail} /></Presence>); tick(320);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '确认' })); });
    expect(screen.getByRole('alert')).toHaveTextContent('操作未完成');
    expect(screen.getByRole('dialog')).toHaveAttribute('data-hy-phase', 'open');
    expect(screen.getByRole('button', { name: '确认' })).toBeEnabled();
  });

  it('releases every lock immediately when navigation unmounts a closing subtree', () => {
    const view = render(<><div className="app-shell">页面</div><Presence present><Modal title="详情" onClose={() => {}}>记录</Modal></Presence></>); tick(320);
    view.rerender(<><div className="app-shell">页面</div><Presence present={false}>{null}</Presence></>);
    expect(document.body.style.overflow).toBe('hidden'); view.unmount(); tick(1000);
    expect(document.body.style.overflow).toBe(''); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
