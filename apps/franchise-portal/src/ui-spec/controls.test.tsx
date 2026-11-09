import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Checkbox, RadioGroup, SegmentedControl, Select, Switch } from './controls';
import { Field } from './components';

function media(matches: boolean) { return { matches, media: '', onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }; }
beforeEach(() => { vi.stubGlobal('matchMedia', vi.fn(() => media(false))); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const options = [{ value: '', label: '请选择' }, { value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta', disabled: true }, { value: 'c', label: 'Charlie' }, { value: 'd', label: 'Delta' }];
function ControlledSelect({ required = false }: { required?: boolean }) { const [value, setValue] = useState('a'); return <><Field label="客户类型" required={required} error="请核对类型">{field => <Select {...field} value={value} onValueChange={setValue} options={options} name="type" />}</Field><output aria-label="选择结果">{value}</output><button>后续操作</button></>; }

describe('shared selection controls', () => {
  it('uses a native indeterminate checkbox and toggles with Space', async () => {
    const user = userEvent.setup();
    function Example() { const [value, setValue] = useState<boolean | 'mixed'>('mixed'); return <Checkbox checked={value} onCheckedChange={setValue} label="选择所有客户" />; }
    render(<Example />);
    const checkbox = screen.getByRole('checkbox', { name: '选择所有客户' });
    expect(checkbox).toBePartiallyChecked();
    checkbox.focus();
    await user.keyboard(' ');
    expect(checkbox).toBeChecked();
    expect(checkbox).not.toBePartiallyChecked();
    await user.keyboard(' ');
    expect(checkbox).not.toBeChecked();
  });

  it('does not toggle disabled checkboxes or switches', async () => {
    const user = userEvent.setup(); const change = vi.fn();
    render(<><Checkbox checked onCheckedChange={change} label="只读选择" disabled /><Switch checked onCheckedChange={change} label="只读开关" disabled /></>);
    await user.click(screen.getByRole('checkbox', { name: '只读选择' }));
    await user.click(screen.getByRole('switch', { name: '只读开关' }));
    expect(change).not.toHaveBeenCalled();
  });

  it('keeps native radio exclusivity and switch keyboard semantics', async () => {
    const user = userEvent.setup();
    function Example() { const [value, setValue] = useState('a'); const [on, setOn] = useState(false); return <><RadioGroup label="账户类型" name="account" value={value} onValueChange={setValue} options={options.slice(1)} /><Switch label="通知" checked={on} onCheckedChange={setOn} /></>; }
    render(<Example />);
    await user.click(screen.getByRole('radio', { name: 'Charlie' }));
    expect(screen.getByRole('radio', { name: 'Alpha' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Charlie' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Beta' })).toBeDisabled();
    screen.getByRole('switch', { name: '通知' }).focus();
    await user.keyboard(' ');
    expect(screen.getByRole('switch', { name: '通知' })).toBeChecked();
  });

  it('supports segmented selection without adding another tab stop for each option', async () => {
    const user = userEvent.setup();
    function Example() { const [value, setValue] = useState('a'); return <SegmentedControl aria-label="视图" value={value} onValueChange={setValue} options={options.slice(1)} />; }
    const { container } = render(<Example />);
    await user.click(screen.getByRole('radio', { name: 'Delta' }));
    expect(screen.getByRole('radio', { name: 'Delta' })).toBeChecked();
    expect(container.querySelectorAll('.hy-segmented__indicator')).toHaveLength(1);
    expect(container.querySelector('.hy-segmented')).toHaveStyle({ '--hy-segment-index': '3' });
  });
});

describe('desktop and mobile Select', () => {
  it('links the field name and error and supports arrows, disabled skipping, Home and End', async () => {
    const user = userEvent.setup(); render(<ControlledSelect required />);
    const combobox = screen.getByRole('combobox', { name: '客户类型' });
    expect(combobox).toHaveAccessibleDescription('请核对类型');
    expect(combobox).toHaveAttribute('aria-required', 'true');
    expect(combobox).toHaveAttribute('aria-invalid', 'true');
    combobox.focus(); await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(screen.getByRole('option', { name: 'Charlie' })).toHaveAttribute('data-active', 'true');
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('选择结果')).toHaveTextContent('c');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(combobox).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('option', { name: '请选择' })).toHaveAttribute('data-active', 'true');
    await user.keyboard('{End}{Enter}');
    expect(screen.getByLabelText('选择结果')).toHaveTextContent('d');
  });

  it('supports typeahead and Escape without changing committed selection', async () => {
    const user = userEvent.setup(); const parentKey = vi.fn();
    render(<div onKeyDown={parentKey}><ControlledSelect /></div>);
    const combobox = screen.getByRole('combobox', { name: '客户类型' });
    combobox.focus(); await user.keyboard('d');
    expect(screen.getByRole('option', { name: 'Delta' })).toHaveAttribute('data-active', 'true');
    parentKey.mockClear(); await user.keyboard('{Escape}');
    expect(parentKey).not.toHaveBeenCalled();
    expect(screen.getByLabelText('选择结果')).toHaveTextContent('a');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes on Tab and outside pointer presses while retaining normal focus navigation', async () => {
    const user = userEvent.setup(); render(<ControlledSelect />);
    const combobox = screen.getByRole('combobox', { name: '客户类型' });
    await user.click(combobox); await user.tab();
    expect(screen.getByRole('button', { name: '后续操作' })).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.click(combobox); await user.click(screen.getByRole('button', { name: '后续操作' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('portals inside an open dialog and flips above an anchor near its lower edge', async () => {
    const user = userEvent.setup();
    render(<dialog open aria-label="编辑记录"><ControlledSelect /></dialog>);
    const dialog = screen.getByRole('dialog', { name: '编辑记录' });
    const combobox = screen.getByRole('combobox', { name: '客户类型' });
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({ x: 100, y: 100, left: 100, top: 100, right: 600, bottom: 750, width: 500, height: 650, toJSON: () => ({}) });
    vi.spyOn(combobox, 'getBoundingClientRect').mockReturnValue({ x: 120, y: 690, left: 120, top: 690, right: 520, bottom: 726, width: 400, height: 36, toJSON: () => ({}) });
    await user.click(combobox);
    const listbox = within(dialog).getByRole('listbox');
    expect(listbox.closest('dialog')).toBe(dialog);
    const layer = listbox.parentElement!;
    expect(layer.style.position).toBe('absolute');
    expect(Number.parseFloat(layer.style.top)).toBeLessThan(590);
    await user.click(within(listbox).getByRole('option', { name: 'Charlie' }));
    expect(screen.getByLabelText('选择结果')).toHaveTextContent('c');
  });

  it('uses native select for narrow layouts and preserves native form values', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => media(true)));
    const user = userEvent.setup();
    render(<form aria-label="客户表单"><ControlledSelect required /></form>);
    const combobox = screen.getByRole('combobox', { name: '客户类型' });
    expect(combobox.tagName).toBe('SELECT');
    await user.selectOptions(combobox, 'c');
    expect(new FormData(screen.getByRole('form', { name: '客户表单' }) as HTMLFormElement).get('type')).toBe('c');
    expect(combobox).toHaveAccessibleDescription('请核对类型');
  });

  it('keeps a desktop required select in native form validation and focuses its trigger', () => {
    render(<form><Field label="必选类型" required>{field => <Select {...field} value="" onValueChange={() => {}} options={options} name="type" />}</Field></form>);
    const proxy = document.querySelector<HTMLSelectElement>('.hy-select-form-proxy')!;
    fireEvent.invalid(proxy);
    expect(screen.getByRole('combobox', { name: '必选类型' })).toHaveFocus();
    expect(proxy.validity.valueMissing).toBe(true);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });
});
