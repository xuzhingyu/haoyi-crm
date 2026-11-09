import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FormsDemo, NavigationDemo } from './forms-navigation';
import { MotionContext } from './kit';

beforeEach(() => { vi.stubGlobal('matchMedia', vi.fn((media: string) => ({ media, matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('showroom form interactions', () => {
  it('accepts only one save when two submit events arrive in the same batch', async () => {
    const notify = vi.fn();
    render(<FormsDemo notify={notify} />);
    fireEvent.change(screen.getByRole('textbox', { name: /客户名称/ }), { target: { value: '南京同批提交' } });
    fireEvent.change(screen.getByRole('textbox', { name: /联系邮箱/ }), { target: { value: 'batch@example.com' } });
    const form = screen.getByRole('form', { name: '客户资料演示表单' });
    const setTimer = vi.spyOn(window, 'setTimeout');
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(setTimer.mock.calls.filter(([, delay]) => delay === 850)).toHaveLength(1);
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1), { timeout: 2000 });
  });

  it('focuses the first invalid field and preserves data across a simulated failure', async () => {
    const notify = vi.fn();
    render(<div className="hy-spec"><FormsDemo notify={notify} /></div>);
    await userEvent.click(screen.getByRole('button', { name: '保存资料' }));
    const name = screen.getByRole('textbox', { name: /客户名称/ });
    expect(name).toHaveFocus();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    await userEvent.type(name, '南京演示客户');
    await userEvent.type(screen.getByRole('textbox', { name: /联系邮箱/ }), 'sample@example.com');
    await userEvent.click(screen.getByRole('switch', { name: '模拟保存失败' }));
    await userEvent.click(screen.getByRole('button', { name: '保存资料' }));
    expect(screen.getByRole('button', { name: '保存资料' })).toBeDisabled();
    expect(screen.getByRole('form', { name: '客户资料演示表单' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('spinbutton', { name: '预计金额（元）' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: '常规' })).toBeDisabled();
    await screen.findByText(/模拟请求失败/, {}, { timeout: 2000 });
    expect(name).toHaveValue('南京演示客户');
    expect(notify).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('switch', { name: '模拟保存失败' }));
    await userEvent.click(screen.getByRole('button', { name: '保存资料' }));
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(screen.getByText('客户资料已保存')).toBeInTheDocument();
  });

  it('keeps labels and keyboard focus attached to controls inside input groups', async () => {
    render(<div className="hy-spec"><FormsDemo notify={vi.fn()} /></div>);
    const amount = screen.getByRole('spinbutton', { name: '预计金额（元）' });
    await userEvent.click(screen.getByText('预计金额（元）'));
    expect(amount).toHaveFocus();
    await userEvent.clear(amount);
    await userEvent.type(amount, '1250.50');
    expect(amount).toHaveValue(1250.5);
    const password = screen.getByLabelText('演示密码');
    await userEvent.click(screen.getByText('演示密码'));
    expect(password).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: '显示演示密码' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: '隐藏演示密码' })).toHaveFocus();
  });

  it('reveals a password, updates the slider, and resets to initial demo values', async () => {
    render(<div className="hy-spec"><FormsDemo notify={vi.fn()} /></div>);
    const password = screen.getByLabelText('演示密码');
    expect(password).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: '显示演示密码' }));
    expect(password).toHaveAttribute('type', 'text');
    fireEvent.change(screen.getByRole('slider', { name: '服务半径' }), { target: { value: '80' } });
    expect(screen.getByRole('slider', { name: '服务半径' })).toHaveValue('80');
    await userEvent.click(screen.getByRole('button', { name: '重置' }));
    expect(password).toHaveAttribute('type', 'password');
    expect(screen.getByRole('slider', { name: '服务半径' })).toHaveValue('60');
    expect(screen.getByLabelText('客户编号')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('所属组织')).toBeDisabled();
  });
});

describe('showroom navigation and list interactions', () => {
  it('filters and sorts the whole dataset before paging, then selects only the visible page', async () => {
    const notify = vi.fn();
    render(<div className="hy-spec"><NavigationDemo notify={notify} /></div>);
    await userEvent.click(screen.getByRole('button', { name: '预计金额' }));
    const table = screen.getByRole('table');
    const bodyRows = within(table).getAllByRole('row').slice(1);
    expect(bodyRows[0]).toHaveTextContent('无锡青禾维修站');
    await userEvent.click(screen.getByRole('button', { name: '下一页客户' }));
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('扬州运河新能源');
    await userEvent.type(screen.getByRole('searchbox', { name: '搜索客户' }), '南京');
    expect(screen.getByText('2 位客户')).toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    await userEvent.click(screen.getByRole('checkbox', { name: '选择当前页全部客户' }));
    const bulk = screen.getByRole('region', { name: '批量操作' });
    expect(bulk).toHaveTextContent('已选 2 位');
    await userEvent.click(within(bulk).getByRole('button', { name: '标记完成' }));
    expect(notify).toHaveBeenLastCalledWith('已将 2 位演示客户标记为完成');
    expect(screen.queryByRole('region', { name: '批量操作' })).not.toBeInTheDocument();
    expect(within(table).getAllByText('已完成')).toHaveLength(2);
  });

  it('moves tabs with arrow keys and returns from details with the breadcrumb', async () => {
    render(<div className="hy-spec"><NavigationDemo notify={vi.fn()} /></div>);
    const all = screen.getByRole('tab', { name: /全部客户/ });
    all.focus();
    fireEvent.keyDown(all, { key: 'ArrowRight' });
    const followups = screen.getByRole('tab', { name: /待跟进/ });
    expect(followups).toHaveFocus();
    expect(followups).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('button', { name: /^江宁新能源服务中心$/ }));
    expect(screen.getByRole('heading', { name: '江宁新能源服务中心' })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('navigation', { name: '客户路径' })).getByRole('button', { name: '客户列表' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('animates the changed row geometry once, then cancels immediately when motion is switched off', () => {
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel }) as unknown as Animation);
    const oldAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const index = this.tagName === 'TR' && this.parentElement?.tagName === 'TBODY' ? Array.from(this.parentElement.children).indexOf(this) : 0;
      return { top: index * 64, left: 0, bottom: index * 64 + 64, right: 600, width: 600, height: 64, x: 0, y: index * 64, toJSON: () => ({}) };
    });
    try {
      const { rerender, unmount } = render(<MotionContext.Provider value="rich"><NavigationDemo notify={vi.fn()} /></MotionContext.Provider>);
      expect(animate).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: '预计金额' }));
      expect(animate).toHaveBeenCalled();
      const firstFrames = animate.mock.calls[0] as unknown as [Keyframe[], KeyframeAnimationOptions];
      expect(firstFrames[0][1].transform).toBe('translate(0px, 0px)');
      expect(firstFrames[1].duration).toBe(420);
      const calls = animate.mock.calls.length;
      rerender(<MotionContext.Provider value="off"><NavigationDemo notify={vi.fn()} /></MotionContext.Provider>);
      expect(cancel).toHaveBeenCalledTimes(calls);
      fireEvent.click(screen.getByRole('button', { name: '预计金额' }));
      expect(animate).toHaveBeenCalledTimes(calls);
      expect(within(screen.getByRole('table')).getAllByRole('row')[1]).toHaveTextContent('南京桥北汽车工坊');
      unmount();
    } finally {
      if (oldAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', oldAnimate);
      else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    }
  });
});
