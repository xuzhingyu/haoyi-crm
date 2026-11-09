import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionMenu, BarChart, Button, ChartFrame, DataTable, Dialog, Field } from './components';
import { RadioGroup, Select } from './controls';

const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
    this.querySelector<HTMLElement>('[autofocus], button, input')?.focus();
  } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } });
});
afterAll(() => {
  if (originalShow) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShow);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

describe('UI specimen interaction contracts', () => {
  it('blocks disabled and loading actions while preserving accessible action labels', async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    render(<div className="hy-spec"><Button disabled onClick={action}>导出</Button><Button loading onClick={action}>保存</Button><Button onClick={action}>预览</Button></div>);
    await user.click(screen.getByRole('button', { name: '导出' }));
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '保存' })).toHaveAttribute('aria-busy', 'true');
    await user.click(screen.getByRole('button', { name: '预览' }));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('links labels, validation and required semantics to native fields', () => {
    render(<Field label="客户名称" required error="请输入客户名称"><input /></Field>);
    const input = screen.getByRole('textbox', { name: '客户名称' });
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('请输入客户名称');
  });

  it('protects dirty drafts for footer cancellation and restores focus after confirmed discard', async () => {
    const user = userEvent.setup();
    const closed = vi.fn();
    function Editor() {
      const [open, setOpen] = useState(false);
      return <><Button onClick={() => setOpen(true)}>打开编辑</Button><Dialog open={open} title="编辑客户" dirty onClose={() => { closed(); setOpen(false); }} footer={requestClose => <Button onClick={requestClose}>取消</Button>}><Field label="名称"><input defaultValue="草稿客户" /></Field></Dialog></>;
    }
    render(<Editor />);
    const trigger = screen.getByRole('button', { name: '打开编辑' });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(closed).not.toHaveBeenCalled();
    const confirmation = screen.getByRole('dialog', { name: '放弃未保存的修改？' });
    await user.click(within(confirmation).getByRole('button', { name: '继续编辑' }));
    expect(screen.getByRole('dialog', { name: '编辑客户' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: '名称' })).toHaveValue('草稿客户');
    await user.click(screen.getByRole('button', { name: '关闭' }));
    await user.click(screen.getByRole('button', { name: '放弃修改' }));
    expect(closed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: '编辑客户' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('explains busy close attempts and blocks both close button and Escape', async () => {
    const user = userEvent.setup();
    const closed = vi.fn();
    render(<Dialog open title="保存客户" busy onClose={closed}><p>客户内容</p></Dialog>);
    await user.click(screen.getByRole('button', { name: '关闭' }));
    expect(screen.getByRole('status')).toHaveTextContent('正在保存，请稍候再关闭');
    fireEvent(screen.getByRole('dialog', { name: '保存客户' }), new Event('cancel', { cancelable: true }));
    expect(closed).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '保存客户' })).toBeVisible();
  });

  it('guards dirty Escape cancellation before notifying the parent', () => {
    const closed = vi.fn();
    render(<Dialog open title="编辑跟进" dirty onClose={closed}><p>跟进草稿</p></Dialog>);
    fireEvent(screen.getByRole('dialog', { name: '编辑跟进' }), new Event('cancel', { cancelable: true }));
    expect(screen.getByRole('dialog', { name: '放弃未保存的修改？' })).toBeVisible();
    expect(closed).not.toHaveBeenCalled();
  });

  it('wraps Tab and Shift+Tab inside a modal instead of losing focus to browser chrome', () => {
    render(<Dialog open title="键盘操作" onClose={() => {}} footer={<Button>保存</Button>}><input aria-label="名称" /></Dialog>);
    const first = screen.getByRole('button', { name: '关闭' });
    const last = screen.getByRole('button', { name: '保存' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('keeps the desktop select form proxy outside a dialog keyboard focus loop', async () => {
    const user = userEvent.setup();
    render(<Dialog open title="修改联系状态" onClose={() => {}} footer={requestClose => <Button onClick={requestClose}>取消</Button>}><Field label="联系状态">{field => <Select {...field} value="new" onValueChange={() => {}} options={[{ value: 'new', label: '待联系' }, { value: 'contacted', label: '已联系' }]} />}</Field></Dialog>);
    const select = screen.getByRole('combobox', { name: '联系状态' });
    select.focus();
    await user.tab();
    expect(screen.getByRole('button', { name: '取消' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: '关闭' })).toHaveFocus();
  });

  it('wraps dialog focus from the checked radio when the final group has unchecked options', async () => {
    const user = userEvent.setup();
    render(<Dialog open title="跟进范围" onClose={() => {}}><RadioGroup label="负责人范围" name="dialog-scope" value="mine" onValueChange={() => {}} options={[{ value: 'mine', label: '自己' }, { value: 'team', label: '团队' }]} /></Dialog>);
    const checked = screen.getByRole('radio', { name: '自己' });
    checked.focus();
    await user.tab();
    expect(screen.getByRole('button', { name: '关闭' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(checked).toHaveFocus();
  });

  it('selects only current rows, exposes partial selection and preserves off-page selections', async () => {
    const user = userEvent.setup();
    function List() {
      const [selected, setSelected] = useState(['outside']);
      return <><output aria-label="已选记录">{selected.join(',')}</output><DataTable caption="客户列表" rows={[{ id: 'a', name: '客户甲' }, { id: 'b', name: '客户乙' }]} columns={[{ key: 'name', label: '客户', render: row => row.name }]} selected={selected} onSelectionChange={setSelected} /></>;
    }
    render(<List />);
    await user.click(screen.getByRole('checkbox', { name: '选择记录 a' }));
    expect(screen.getByRole('checkbox', { name: '全选当前列表' })).toBePartiallyChecked();
    await user.click(screen.getByRole('checkbox', { name: '全选当前列表' }));
    expect(screen.getByLabelText('已选记录')).toHaveTextContent('outside,a,b');
    await user.click(screen.getByRole('checkbox', { name: '全选当前列表' }));
    expect(screen.getByLabelText('已选记录')).toHaveTextContent('outside');
    expect(screen.getByRole('checkbox', { name: '选择记录 a' })).not.toBeChecked();
  });

  it('offers the same chart values in a data table and distinguishes missing values from zero', async () => {
    const user = userEvent.setup();
    render(<ChartFrame title="区域线索" unit="条" rows={[{ label: '南京', value: 0 }, { label: '苏州', value: null }]}><div>图形</div></ChartFrame>);
    await user.click(screen.getByRole('button', { name: '数据表' }));
    const table = screen.getByRole('table', { name: '区域线索数据' });
    expect(within(table).getByRole('cell', { name: '0' })).toBeVisible();
    expect(within(table).getByRole('cell', { name: '—' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '图表' }));
    expect(screen.getByText('图形')).toBeVisible();
  });

  it('keeps bar lengths proportional from zero and never draws a bar for missing data', () => {
    render(<BarChart rows={[{ label: '南京', value: 4 }, { label: '苏州', value: 2 }, { label: '无锡', value: 0 }, { label: '常州', value: null }]} />);
    const fillWidth = (label: string) => Number(screen.getByRole('img', { name: label }).querySelector('.hy-bar__fill')?.getAttribute('width'));
    expect(fillWidth('南京：4')).toBe(300);
    expect(fillWidth('苏州：2')).toBe(150);
    expect(fillWidth('无锡：0')).toBe(0);
    expect(fillWidth('常州：暂无数据')).toBe(0);
    expect(screen.getByText('—')).toBeVisible();
  });

  it('portals row actions out of the table and supports keyboard navigation with focus return', async () => {
    const user = userEvent.setup();
    const archive = vi.fn();
    render(<DataTable caption="客户操作" rows={[{ id: 'a' }]} columns={[{ key: 'actions', label: '操作', render: () => <ActionMenu label="客户甲的更多操作" items={[{ label: '分配负责人', onSelect: () => {} }, { label: '归档客户', tone: 'danger', onSelect: archive }]} /> }]} />);
    const trigger = screen.getByRole('button', { name: '客户甲的更多操作' });
    trigger.focus();
    await user.keyboard('{ArrowUp}');
    const menu = screen.getByRole('menu', { name: '客户甲的更多操作' });
    expect(menu.closest('table')).toBeNull();
    expect(screen.getByRole('menuitem', { name: '归档客户' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: '分配负责人' })).toHaveFocus();
    await user.keyboard('{End}{Enter}');
    expect(archive).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('dismisses row actions on outside interaction or viewport changes without selecting an action', async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    render(<><ActionMenu label="更多操作" items={[{ label: '查看', onSelect: action }]} /><Button>其他操作</Button></>);
    const trigger = screen.getByRole('button', { name: '更多操作' });
    await user.click(trigger);
    await user.tab();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '其他操作' })).toHaveFocus();
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: '其他操作' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await user.click(trigger);
    fireEvent.scroll(document);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    fireEvent.resize(window);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });
});
