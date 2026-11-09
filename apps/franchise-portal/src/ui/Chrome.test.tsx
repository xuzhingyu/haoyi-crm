import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavigationSurface } from './Chrome';
import { useWorkspaceMotion } from './Interactions';
import { Presence } from './Presence';

type MediaState = { matches: boolean; events: EventTarget };
const media = new Map<string, MediaState>();

function setMedia(query: string, matches: boolean) {
  const state = media.get(query);
  if (!state) throw new Error(`Unsubscribed media query: ${query}`);
  act(() => { state.matches = matches; state.events.dispatchEvent(new Event('change')); });
}

const visibleRect = { x: 0, y: 0, width: 100, height: 100, top: 0, right: 100, bottom: 100, left: 0, toJSON: () => ({}) };
const originalInert = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'inert');

beforeEach(() => {
  vi.useFakeTimers();
  media.clear();
  vi.stubGlobal('matchMedia', (query: string) => {
    if (!media.has(query)) media.set(query, { matches: query.includes('pointer: fine'), events: new EventTarget() });
    const state = media.get(query)!;
    return {
      media: query,
      get matches() { return state.matches; },
      addEventListener: state.events.addEventListener.bind(state.events),
      removeEventListener: state.events.removeEventListener.bind(state.events),
    };
  });
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
    return (this.hidden ? [] : [visibleRect]) as unknown as DOMRectList;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(visibleRect);
  Object.defineProperty(HTMLElement.prototype, 'inert', {
    configurable: true,
    get() { return this.hasAttribute('inert'); },
    set(value: boolean) { this.toggleAttribute('inert', value); },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.style.overflow = '';
  if (originalInert) Object.defineProperty(HTMLElement.prototype, 'inert', originalInert);
  else delete (HTMLElement.prototype as { inert?: boolean }).inert;
});

function NavigationHarness({ mobile = true }: { mobile?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <div id="legacy-portals" />
    <main className="main-workspace"><button hidden={!mobile} onClick={() => setOpen(true)}>打开导航</button></main>
    <Presence present={!mobile || open} enterMs={mobile ? 360 : 0} exitMs={mobile ? 200 : 0}>
      {(!mobile || open) && <NavigationSurface mobile={mobile} onClose={() => setOpen(false)}>
        <nav><a className="nav-link active" href="#home">工作台</a><a href="#tasks">待办</a></nav>
      </NavigationSurface>}
    </Presence>
  </>;
}

function MotionHarness({ count = 1 }: { count?: number }) {
  const ref = useRef<HTMLElement>(null);
  useWorkspaceMotion(ref, '/', true);
  return <main ref={ref}>
    <section className="page-heading"><h1>工作台</h1><button>查看记录</button><span>{count} 条记录</span></section>
    <a className="hy-glow-card" href="#record">重点客户</a>
  </main>;
}

function TaskMotionHarness({ loading = false, ids = ['existing'] }: { loading?: boolean; ids?: string[] }) {
  const ref = useRef<HTMLElement>(null);
  useWorkspaceMotion(ref, '/tasks', true);
  return <main ref={ref}>{loading ? <p role="status">正在读取待办</p> : <section className="work-task-list" aria-label="待办列表">
    {ids.map(id => <article key={id} data-hy-item-id={`task:${id}`}>{id}</article>)}
  </section>}</main>;
}

function ButtonMotionHarness({ disabled = false, busy = false, onSubmit = () => {} }: { disabled?: boolean; busy?: boolean; onSubmit?: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useWorkspaceMotion(ref, '/form', true);
  return <main ref={ref}><form onSubmit={event => { event.preventDefault(); onSubmit(); }}><button className="button primary" type="submit" disabled={disabled} aria-busy={busy || undefined}>保存资料</button><button className="button quiet" type="button">帮助</button></form></main>;
}

function SelectedNavigation({ selected }: { selected: 'home' | 'tasks' }) {
  return <NavigationSurface mobile={false} onClose={() => {}}><nav><a href="#home" className={`nav-link ${selected === 'home' ? 'active' : ''}`} aria-current={selected === 'home' ? 'page' : undefined}>工作台</a><a href="#tasks" className={`nav-link ${selected === 'tasks' ? 'active' : ''}`} aria-current={selected === 'tasks' ? 'page' : undefined}>待办</a></nav></NavigationSurface>;
}

function FeedbackMotionHarness({ message }: { message: string }) {
  const ref = useRef<HTMLElement>(null);
  useWorkspaceMotion(ref, '/form', true);
  return <main ref={ref}><p role="alert">{message}</p></main>;
}

async function nextFrame() {
  await act(async () => { await vi.advanceTimersByTimeAsync(35); });
}

describe('mobile navigation', () => {
  it('keeps the background locked and focus contained until exit finishes, then restores the trigger', () => {
    document.body.style.overflow = 'clip';
    render(<NavigationHarness />);
    const trigger = screen.getByRole('button', { name: '打开导航' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: '导航菜单' });
    const background = document.querySelector<HTMLElement>('.main-workspace')!;
    expect(background.inert).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    expect(dialog).toHaveFocus();
    const last = screen.getByRole('link', { name: '待办' });
    last.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(screen.getByRole('button', { name: '关闭导航菜单' })).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(dialog).toBeInTheDocument();
    expect(background.inert).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    act(() => { vi.advanceTimersByTime(201); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(background.inert).toBe(false);
    expect(document.body.style.overflow).toBe('clip');
    expect(trigger).toHaveFocus();
  });

  it('releases the modal lock at the desktop breakpoint and focuses visible navigation instead of a hidden trigger', () => {
    const view = render(<NavigationHarness />);
    const trigger = screen.getByRole('button', { name: '打开导航' });
    trigger.focus();
    fireEvent.click(trigger);
    view.rerender(<NavigationHarness mobile={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelector<HTMLElement>('.main-workspace')!.inert).toBe(false);
    expect(document.body.style.overflow).toBe('');
    expect(screen.getByRole('link', { name: '工作台' })).toHaveFocus();
  });
});

describe('workspace motion', () => {
  it('reveals immediately on keyboard focus and does not replay the same surface after a data update', async () => {
    const view = render(<MotionHarness />);
    await nextFrame();
    const surface = screen.getByRole('heading', { name: '工作台' }).parentElement!;
    expect(surface).toHaveClass('hy-page-enter');
    fireEvent.focusIn(screen.getByRole('button', { name: '查看记录' }));
    expect(surface).not.toHaveClass('hy-page-enter');
    view.rerender(<MotionHarness count={2} />);
    await nextFrame();
    expect(screen.getByText('2 条记录')).toBeInTheDocument();
    expect(surface).not.toHaveClass('hy-page-enter');
  });

  it('stops active entrances and pointer decoration when reduced motion changes during interaction', async () => {
    render(<MotionHarness />);
    await nextFrame();
    const card = screen.getByRole('link', { name: '重点客户' });
    const surface = screen.getByRole('heading', { name: '工作台' }).parentElement!;
    fireEvent(card, new MouseEvent('pointermove', { bubbles: true, clientX: 75, clientY: 25 }));
    await nextFrame();
    expect(card.style.getPropertyValue('--hy-pointer-x')).not.toBe('');
    setMedia('(prefers-reduced-motion: reduce)', true);
    expect(surface).not.toHaveClass('hy-page-enter');
    expect(card.style.getPropertyValue('--hy-pointer-x')).toBe('');
    expect(card.style.getPropertyValue('--hy-pointer-y')).toBe('');
    expect(screen.getByText('1 条记录')).toBeInTheDocument();
  });

  it('does not replay a completed list entrance when a loading state recreates the panel', async () => {
    const view = render(<TaskMotionHarness />);
    await nextFrame();
    const originalPanel = screen.getByRole('region', { name: '待办列表' });
    expect(originalPanel).toHaveClass('hy-page-enter');
    fireEvent.animationEnd(originalPanel);
    view.rerender(<TaskMotionHarness loading />);
    await nextFrame();
    expect(screen.getByRole('status')).toHaveTextContent('正在读取待办');
    view.rerender(<TaskMotionHarness />);
    await nextFrame();
    const restoredPanel = screen.getByRole('region', { name: '待办列表' });
    expect(restoredPanel).not.toBe(originalPanel);
    expect(restoredPanel).not.toHaveClass('hy-page-enter');
    expect(screen.getByText('existing')).not.toHaveClass('hy-item-enter');
  });

  it('reveals new records once and does not replay them after filtering, sorting, or recreating their elements', async () => {
    const view = render(<TaskMotionHarness />);
    await nextFrame();
    view.rerender(<TaskMotionHarness ids={['existing', 'new-record']} />);
    await nextFrame();
    const added = screen.getByText('new-record');
    expect(added).toHaveClass('hy-item-enter');
    expect(screen.getByText('existing')).not.toHaveClass('hy-item-enter');
    fireEvent.animationEnd(added);
    view.rerender(<TaskMotionHarness ids={['existing']} />);
    await nextFrame();
    view.rerender(<TaskMotionHarness ids={['new-record', 'existing']} />);
    await nextFrame();
    expect(screen.getByText('new-record')).not.toBe(added);
    expect(screen.getByText('new-record')).not.toHaveClass('hy-item-enter');
    expect(screen.getByText('existing')).not.toHaveClass('hy-item-enter');
  });

  it('animates only the button face without synthesizing clicks or changing form contents', async () => {
    const submit = vi.fn();
    render(<ButtonMotionHarness onSubmit={submit} />);
    const button = screen.getByRole('button', { name: '保存资料' });
    const originalMarkup = button.innerHTML;
    fireEvent(button, new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    expect(button).toHaveAttribute('data-hy-press', 'down');
    expect(button.style.transform).toBe('');
    expect(button.innerHTML).toBe(originalMarkup);
    fireEvent(button, new MouseEvent('pointerup', { bubbles: true, button: 0 }));
    expect(button).toHaveAttribute('data-hy-press', 'release');
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(submit).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(460));
    expect(button).not.toHaveAttribute('data-hy-press');
    fireEvent(screen.getByRole('button', { name: '帮助' }), new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    expect(screen.getByRole('button', { name: '帮助' })).not.toHaveAttribute('data-hy-press');
  });

  it('cancels pressed/released paint when busy, disabled, hidden, forced colors or unmounted', async () => {
    const view = render(<ButtonMotionHarness />);
    const button = screen.getByRole('button', { name: '保存资料' });
    fireEvent.keyDown(button, { key: ' ' });
    expect(button).toHaveAttribute('data-hy-press', 'down');
    view.rerender(<ButtonMotionHarness busy />);
    await nextFrame();
    expect(button).not.toHaveAttribute('data-hy-press');
    fireEvent.keyDown(button, { key: ' ' });
    expect(button).not.toHaveAttribute('data-hy-press');
    view.rerender(<ButtonMotionHarness disabled />);
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(button).not.toHaveAttribute('data-hy-press');
    view.rerender(<ButtonMotionHarness />);
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyUp(button, { key: 'Enter' });
    expect(button).toHaveAttribute('data-hy-press', 'release');
    setMedia('(forced-colors: active)', true);
    expect(button).not.toHaveAttribute('data-hy-press');
    setMedia('(forced-colors: active)', false);
    fireEvent.keyDown(button, { key: ' ' });
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    expect(button).not.toHaveAttribute('data-hy-press');
    expect(document.documentElement).toHaveAttribute('data-hy-motion-suspended');
    hidden.mockReturnValue(false); fireEvent(document, new Event('visibilitychange'));
    fireEvent.keyDown(button, { key: ' ' });
    expect(button).toHaveAttribute('data-hy-press', 'down');
    view.unmount();
    expect(button).not.toHaveAttribute('data-hy-press');
    expect(document.documentElement).not.toHaveAttribute('data-hy-motion-suspended');
  });

  it('does not let an earlier release timer clear a subsequent pointer press', () => {
    render(<ButtonMotionHarness />);
    const button = screen.getByRole('button', { name: '保存资料' });
    fireEvent(button, new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    fireEvent(button, new MouseEvent('pointerup', { bubbles: true, button: 0 }));
    act(() => vi.advanceTimersByTime(300));
    fireEvent(button, new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    act(() => vi.advanceTimersByTime(300));
    expect(button).toHaveAttribute('data-hy-press', 'down');
    fireEvent(button, new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body }));
    expect(button).not.toHaveAttribute('data-hy-press');
  });

  it('moves only the selected navigation background and cancels it when preferences change', async () => {
    const view = render(<SelectedNavigation selected="home" />);
    const home = screen.getByRole('link', { name: '工作台' });
    const tasks = screen.getByRole('link', { name: '待办' });
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (this: HTMLElement) { return { ...visibleRect, top: this.textContent === '待办' ? 52 : 0 }; });
    view.rerender(<SelectedNavigation selected="tasks" />);
    await nextFrame();
    expect(tasks).toHaveAttribute('aria-current', 'page');
    expect(tasks).toHaveAttribute('data-hy-nav-moving', 'true');
    expect(tasks.style.getPropertyValue('--hy-nav-from-y')).toBe('-52px');
    expect(tasks.style.transform).toBe('');
    setMedia('(prefers-reduced-motion: reduce)', true);
    expect(tasks).not.toHaveAttribute('data-hy-nav-moving');
    expect(tasks).toHaveAttribute('aria-current', 'page');
    view.rerender(<SelectedNavigation selected="home" />);
    await nextFrame();
    expect(home).not.toHaveAttribute('data-hy-nav-moving');
    expect(home).toHaveAttribute('aria-current', 'page');
  });

  it('continues a rapid navigation reversal from the moving face rather than its destination', async () => {
    const view = render(<SelectedNavigation selected="home" />);
    const home = screen.getByRole('link', { name: '工作台' });
    const tasks = screen.getByRole('link', { name: '待办' });
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (this: HTMLElement) { return { ...visibleRect, top: this.textContent === '待办' ? 52 : 0 }; });
    view.rerender(<SelectedNavigation selected="tasks" />);
    await nextFrame();
    expect(tasks.style.getPropertyValue('--hy-nav-from-y')).toBe('-52px');
    const computed = window.getComputedStyle;
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => pseudo === '::before' ? { transform: 'matrix(1, 0, 0, 1, 0, -31)' } as CSSStyleDeclaration : computed(element, pseudo));
    view.rerender(<SelectedNavigation selected="home" />);
    await nextFrame();
    // 52px destination minus the remaining 31px travel leaves the face at 21px.
    expect(home.style.getPropertyValue('--hy-nav-from-y')).toBe('21px');
    expect(home).toHaveAttribute('data-hy-nav-moving', 'true');
    expect(tasks).not.toHaveAttribute('data-hy-nav-moving');
    expect(home).toHaveAttribute('aria-current', 'page');
    expect(home.style.transform).toBe('');
    act(() => vi.advanceTimersByTime(240));
    expect(home).not.toHaveAttribute('data-hy-nav-moving');
    expect(home.style.getPropertyValue('--hy-nav-from-y')).toBe('');
  });

  it('reveals changed validation messages once and stops their motion when hidden', async () => {
    const view = render(<FeedbackMotionHarness message="请输入客户名称" />);
    await nextFrame();
    const message = screen.getByRole('alert');
    expect(message).toHaveClass('hy-feedback-enter');
    fireEvent.animationEnd(message);
    view.rerender(<FeedbackMotionHarness message="请输入客户名称" />);
    await nextFrame();
    expect(message).not.toHaveClass('hy-feedback-enter');
    view.rerender(<FeedbackMotionHarness message="请核对联系电话" />);
    await nextFrame();
    expect(message).toHaveClass('hy-feedback-enter');
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    expect(message).not.toHaveClass('hy-feedback-enter');
    expect(message).toHaveTextContent('请核对联系电话');
  });
});
