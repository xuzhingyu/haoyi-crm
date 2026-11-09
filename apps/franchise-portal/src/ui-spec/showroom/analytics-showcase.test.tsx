import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsShowcase, type AnalyticsData } from './analytics-showcase';
import { MotionContext } from './kit';

const first: AnalyticsData = { label: '第一组', signed: 18, trained: 27, revenue: 128640.5, cities: [32, 24, 18, 12], trend: [12, 18, 14, 25, 23, 32, 38], spent: 7.6, reserved: 2.4 };
const second: AnalyticsData = { label: '第二组', signed: 22, trained: 31, revenue: 146280.75, cities: [42, 28, 16, 20], trend: [20, 16, 25, 28, 24, 36, 44], spent: 10.8, reserved: 1.6 };
let reportIntersection: ((entries: IntersectionObserverEntry[]) => void) | undefined;
let hiddenDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal('ResizeObserver', undefined);
  hiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});
afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); reportIntersection = undefined;
  if (hiddenDescriptor) Object.defineProperty(document, 'hidden', hiddenDescriptor); else Reflect.deleteProperty(document, 'hidden');
});

describe('interactive analytics showcase', () => {
  it('exposes exact daily values through keyboard-driven chart tooltips', () => {
    const { container } = render(<MotionContext.Provider value="off"><AnalyticsShowcase data={first} /></MotionContext.Provider>);
    const chart = screen.getByLabelText('线索趋势，方向键查看各日数据');
    fireEvent.focus(chart);
    expect(container.querySelector('.neo-analytics-tooltip')).toHaveTextContent('第 1 日新增线索12 条');
    fireEvent.keyDown(chart, { key: 'ArrowRight' });
    act(() => { vi.advanceTimersByTime(32); });
    expect(container.querySelector('.neo-analytics-tooltip')).toHaveTextContent('第 2 日新增线索18 条');
    fireEvent.keyDown(chart, { key: 'ArrowLeft' });
    act(() => { vi.advanceTimersByTime(32); });
    expect(container.querySelector('.neo-analytics-tooltip')).toHaveTextContent('第 1 日新增线索12 条');
  });

  it('filters the same original day values and keeps the native chart controls operable', () => {
    render(<MotionContext.Provider value="off"><AnalyticsShowcase data={first} /></MotionContext.Provider>);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('162')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: '趋势时间范围' }), { target: { value: '3' } });
    expect(screen.getByText('93')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '柱状' }));
    expect(screen.getByRole('radio', { name: '柱状' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '趋势数据表' }));
    const table = screen.getByRole('table', { name: '线索趋势明细' });
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(table).toHaveTextContent('第 5 日23');
    expect(table).toHaveTextContent('第 6 日32');
    expect(table).toHaveTextContent('第 7 日38');
    expect(table).not.toHaveTextContent('第 1 日');
    fireEvent.click(screen.getByRole('button', { name: '返回趋势图' }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '柱状' })).toBeChecked();
  });

  it('does not alter data or selected range during replay and rapid dataset changes', () => {
    const { rerender } = render(<MotionContext.Provider value="off"><AnalyticsShowcase data={first} /></MotionContext.Provider>);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: '趋势数据表' }));
    for (let index = 1; index <= 5; index++) rerender(<MotionContext.Provider value="off"><AnalyticsShowcase data={index % 2 ? second : first} replayKey={index} /></MotionContext.Provider>);
    expect(screen.getByRole('combobox')).toHaveValue('3');
    expect(screen.getByText('104')).toBeInTheDocument();
    expect(screen.getByText('146,280.75')).toBeInTheDocument();
    expect(screen.getByText('7.60')).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('第 7 日44');
    rerender(<MotionContext.Provider value="off"><AnalyticsShowcase data={second} replayKey={6} /></MotionContext.Provider>);
    expect(screen.getByText('104')).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('第 7 日44');
  });

  it('preserves over-target training values instead of clamping the displayed amount', () => {
    render(<MotionContext.Provider value="off"><AnalyticsShowcase data={{ ...first, trained: 45 }} /></MotionContext.Provider>);
    expect(screen.getByText('125')).toBeInTheDocument();
    expect(screen.getByText('超出目标 9 条记录')).toBeInTheDocument();
    expect(screen.getByLabelText('培训已完成 45 条，目标 36 条，125%')).toBeInTheDocument();
  });

  it('replaces in-flight chart trees with final geometry when hidden or motion is disabled', () => {
    const disconnect = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: (entries: IntersectionObserverEntry[]) => void) { reportIntersection = callback; }
      observe() {} disconnect = disconnect;
    });
    const { container, rerender, unmount } = render(<MotionContext.Provider value="rich"><AnalyticsShowcase data={first} /></MotionContext.Provider>);
    const original = container.querySelector('.neo-analytics-plot .recharts-wrapper');
    act(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    const hidden = container.querySelector('.neo-analytics-plot .recharts-wrapper');
    expect(hidden).not.toBe(original);
    const hiddenPath = container.querySelector('.recharts-area-curve')?.getAttribute('d');
    expect(hiddenPath).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1200); });
    expect(container.querySelector('.recharts-area-curve')).toHaveAttribute('d', hiddenPath!);
    act(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
    const visible = container.querySelector('.neo-analytics-plot .recharts-wrapper');
    expect(visible).not.toBe(hidden);
    rerender(<MotionContext.Provider value="off"><AnalyticsShowcase data={first} /></MotionContext.Provider>);
    expect(container.querySelector('.neo-analytics-plot .recharts-wrapper')).not.toBe(visible);
    expect(container.querySelector('.recharts-area-curve')).toHaveAttribute('d', hiddenPath!);
    const radial = container.querySelector('.neo-analytics-radial .recharts-wrapper');
    rerender(<MotionContext.Provider value="rich"><AnalyticsShowcase data={first} /></MotionContext.Provider>);
    act(() => reportIntersection?.([{ isIntersecting: false } as IntersectionObserverEntry]));
    expect(container.querySelector('.neo-analytics-radial .recharts-wrapper')).not.toBe(radial);
    expect(screen.getByLabelText('培训已完成 27 条，目标 36 条，75%')).toBeInTheDocument();
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(2);
  });
});
