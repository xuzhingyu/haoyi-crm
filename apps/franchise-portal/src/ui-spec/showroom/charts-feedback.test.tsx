import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityRings, AnimatedNumber, ChartsDemo, FeedbackDemo } from './charts-feedback';
import { MotionContext } from './kit';

let animateDescriptor: PropertyDescriptor | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  animateDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); if (animateDescriptor) Object.defineProperty(Element.prototype, 'animate', animateDescriptor); else Reflect.deleteProperty(Element.prototype, 'animate'); });
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe('showroom chart values', () => {
  it('exposes only the supplied final number to assistive technology while rolling digits', () => {
    const format = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2 });
    const { container, rerender } = render(<AnimatedNumber value={1234.5} format={format} />);
    expect(container.querySelector('.neo-chart-sr')).toHaveTextContent('1,234.50');
    expect(container.querySelector('.neo-odometer-reel')).toBeNull();
    rerender(<AnimatedNumber value={1239.75} format={format} />);
    expect(container.querySelector('.neo-chart-sr')).toHaveTextContent('1,239.75');
    expect(container.querySelector('.neo-odometer-visual')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('.neo-odometer-reel').length).toBeGreaterThan(0);
    expect(Array.from(container.querySelectorAll('.neo-odometer-symbol')).map(node => node.textContent).join('')).toBe(',.');
    rerender(<AnimatedNumber value={-9.25} format={format} />);
    expect(container.querySelector('.neo-chart-sr')).toHaveTextContent('-9.25');
    expect(container.querySelector('.neo-odometer-symbol')).toHaveTextContent('-');
  });

  it('cancels digit rolling immediately when the user turns motion off', () => {
    const { container, rerender } = render(<MotionContext.Provider value="rich"><AnimatedNumber value={120} /></MotionContext.Provider>);
    rerender(<MotionContext.Provider value="rich"><AnimatedNumber value={129} /></MotionContext.Provider>);
    expect(container.querySelector('.neo-odometer-reel')).not.toBeNull();
    rerender(<MotionContext.Provider value="off"><AnimatedNumber value={129} /></MotionContext.Provider>);
    expect(container.querySelector('.neo-odometer-reel')).toBeNull();
    expect(container.querySelector('.neo-odometer-visual')).toHaveTextContent('129');
  });

  it('does not invent a denominator or lose over-target values', () => {
    const { rerender, container } = render(<ActivityRings items={[{ label: '培训', value: 0, max: 0 }]} />);
    expect(screen.getByText('暂无目标')).toBeInTheDocument();
    expect(screen.getByText(/未设置/)).toBeInTheDocument();
    expect(container.querySelector('circle.neo-ring-value')?.getAttribute('stroke-dashoffset')).not.toBe('NaN');
    rerender(<ActivityRings items={[{ label: '签约', value: 26, max: 24 }]} />);
    expect(screen.getByText('108%')).toBeInTheDocument();
    expect(container.querySelector('circle.neo-ring-value')).toHaveAttribute('stroke-dashoffset', '0');
  });

  it('keeps the data table synchronized when switching chart datasets', () => {
    render(<ChartsDemo notify={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '切换数据' }));
    fireEvent.click(screen.getByRole('button', { name: '查看数据表' }));
    expect(screen.getByRole('table')).toHaveTextContent('146,280.75');
    expect(screen.getByRole('table')).toHaveTextContent('22');
    expect(screen.getByRole('table')).toHaveTextContent('10.80 / 1.60 / 7.60');
    fireEvent.click(screen.getByRole('button', { name: '切换数据' }));
    expect(screen.getByRole('table')).toHaveTextContent('119,850.25');
  });

  it('separates donut sectors without subtracting from their source proportions', () => {
    const { container } = render(<ChartsDemo notify={vi.fn()} />);
    const sectors = () => Array.from(container.querySelectorAll('.neo-donut circle'));
    const totalArc = () => sectors().reduce((sum, circle) => sum + Number(circle.getAttribute('stroke-dasharray')?.split(' ')[0]), 0);
    expect(totalArc()).toBeCloseTo(100, 8);
    expect(container.querySelector('.neo-donut-total')).toHaveTextContent('86');
    expect(container.querySelectorAll('.neo-donut-separator')).toHaveLength(4);
    container.querySelectorAll('.neo-donut-separator').forEach(separator => {
      expect(separator).toHaveAttribute('stroke-width', '2');
      expect(separator).toHaveAttribute('aria-hidden', 'true');
    });
    fireEvent.click(screen.getByRole('button', { name: '切换数据' }));
    expect(totalArc()).toBeCloseTo(100, 8);
    expect(container.querySelector('.neo-donut-total')).toHaveTextContent('106');
  });

  it('replays ring, bar, line and progress paint without changing any source value', () => {
    const animations: { cancel: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn>; playState: string }[] = [];
    const targets: Element[] = [];
    const animate = vi.fn(function(this: Element) { targets.push(this); const animation = { cancel: vi.fn(), pause: vi.fn(), play: vi.fn(), playState: 'running' }; animations.push(animation); return animation; });
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
    const { container, rerender } = render(<MotionContext.Provider value="rich"><ChartsDemo notify={vi.fn()} /></MotionContext.Provider>);
    const first = container.querySelector('.neo-large-number .neo-chart-sr')?.textContent;
    const ringDescription = screen.getByRole('img', { name: /签约目标：18/ }).textContent;
    fireEvent.click(screen.getByRole('button', { name: '重播图表动效' }));
    for (const selector of ['.neo-ring-value', '.neo-bar-fill', '.neo-chart-line', '.neo-progress-track > span']) expect(targets.some(target => target.matches(selector))).toBe(true);
    expect(container.querySelector('.neo-large-number .neo-chart-sr')).toHaveTextContent(first!);
    expect(screen.getByRole('img', { name: /签约目标：18/ })).toHaveTextContent(ringDescription!);
    expect(screen.getByRole('progressbar', { name: '培训记录完成' })).toHaveAttribute('aria-valuenow', '27');
    const count = animations.length;
    rerender(<MotionContext.Provider value="off"><ChartsDemo notify={vi.fn()} /></MotionContext.Provider>);
    expect(animations.every(animation => animation.cancel.mock.calls.length > 0)).toBe(true);
    expect(screen.getByRole('button', { name: '重播图表动效' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '重播图表动效' }));
    expect(animations).toHaveLength(count);
  });

  it('uses shorter replay timing in gentle mode and cancels old paint when changing data', () => {
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel, pause: vi.fn(), play: vi.fn(), playState: 'running' }));
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
    const { container } = render(<MotionContext.Provider value="gentle"><ChartsDemo notify={vi.fn()} /></MotionContext.Provider>);
    fireEvent.click(screen.getByRole('button', { name: '重播图表动效' }));
    expect(animate).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ duration: 300, delay: 0 }));
    fireEvent.click(screen.getByRole('button', { name: '切换数据' }));
    expect(cancel).toHaveBeenCalled();
    expect(container.querySelector('.neo-large-number .neo-chart-sr')).toHaveTextContent('146,280.75');
  });
});

describe('showroom loading state lifecycle', () => {
  it('delays active skeletons for 300ms and removes them on success', () => {
    const notify = vi.fn();
    const { container } = render(<FeedbackDemo notify={notify} />);
    expect(container.querySelector('[data-sweep="active"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '开始加载' }));
    advance(299);
    expect(container.querySelector('.neo-skeleton')).toBeNull();
    advance(1);
    expect(container.querySelectorAll('[data-sweep="active"]')).toHaveLength(4);
    advance(2500);
    expect(container.querySelector('.neo-skeleton')).toBeNull();
    expect(screen.getByText('加载完成')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '本地模拟加载进度' })).toHaveAttribute('aria-valuenow', '100');
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('finishes the sweep on failure and allows a successful retry', () => {
    const { container } = render(<FeedbackDemo notify={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('模拟结果'), { target: { value: 'error' } });
    fireEvent.click(screen.getByRole('button', { name: '开始加载' }));
    advance(2800);
    expect(screen.getByText('暂时没有加载成功')).toBeInTheDocument();
    expect(container.querySelector('[data-sweep="active"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    advance(2800);
    expect(screen.getByText('加载完成')).toBeInTheDocument();
  });

  it('cancels pending completion when reset or unmounted', () => {
    const notify = vi.fn();
    const { unmount } = render(<FeedbackDemo notify={notify} />);
    fireEvent.click(screen.getByRole('button', { name: '开始加载' }));
    advance(600);
    fireEvent.click(screen.getByRole('button', { name: '重置' }));
    advance(4000);
    expect(screen.getByText('等待演示')).toBeInTheDocument();
    expect(notify).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '开始加载' }));
    unmount(); advance(4000);
    expect(notify).not.toHaveBeenCalled();
  });
});
