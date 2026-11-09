import { cloneElement, isValidElement, useId, useRef, useState, useEffect, useLayoutEffect, type ButtonHTMLAttributes, type CSSProperties, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, ArrowUpDown, ChevronDown, ChevronUp, Inbox, LoaderCircle, LockKeyhole, MoreHorizontal, WifiOff, X } from 'lucide-react';
import { Checkbox } from './controls';
import './tokens.css';
import './components.css';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode; iconOnly?: boolean }
export function Button({ variant = 'secondary', size = 'md', loading = false, icon, iconOnly, disabled, children, className = '', type = 'button', ...props }: ButtonProps) { const iconButton = iconOnly ?? (icon != null && children == null); return <button {...props} type={type} className={`hy-button hy-button--${variant} hy-button--${size} ${iconButton ? 'hy-button--icon' : ''} ${className}`} disabled={disabled || loading} aria-busy={loading || undefined}><span className="hy-button-content" style={loading ? { opacity: 0 } : undefined}>{icon}{children}</span>{loading && <LoaderCircle size={16} className="hy-spin hy-button-spinner" aria-hidden="true" />}</button>; }
export type ActionMenuItem = { label: string; onSelect: () => void; tone?: 'danger' };
export function ActionMenu({ label, items }: { label: string; items: ActionMenuItem[] }) {
  const id = useId();
  const trigger = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const initialFocus = useRef<'first' | 'last'>('first');
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const triggerButton = () => trigger.current?.querySelector<HTMLButtonElement>('button');
  const close = () => { setOpen(false); setPosition(null); triggerButton()?.focus({ preventScroll: true }); };
  const show = (focus: 'first' | 'last' = 'first') => {
    initialFocus.current = focus;
    if (open) {
      const options = menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
      (focus === 'last' ? options?.[options.length - 1] : options?.[0])?.focus({ preventScroll: true });
      return;
    }
    setPosition(null); setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open || !menu.current) return;
    const button = trigger.current?.querySelector<HTMLButtonElement>('button');
    if (!button) return;
    const anchor = button.getBoundingClientRect();
    const bounds = menu.current.getBoundingClientRect();
    const gutter = 16;
    const below = anchor.bottom + 8;
    const above = anchor.top - bounds.height - 8;
    const left = Math.max(gutter, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - gutter));
    const top = Math.max(gutter, Math.min(below + bounds.height <= window.innerHeight - gutter ? below : above, window.innerHeight - bounds.height - gutter));
    setPosition({ left, top });
  }, [open]);
  useLayoutEffect(() => {
    if (!open || !position || !menu.current) return;
    const options = menu.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    (initialFocus.current === 'last' ? options[options.length - 1] : options[0])?.focus({ preventScroll: true });
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const dismiss = () => { setOpen(false); setPosition(null); trigger.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) dismiss();
    };
    const scroll = (event: Event) => { if (!(event.target instanceof Node) || !menu.current?.contains(event.target)) dismiss(); };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', dismiss);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', dismiss); };
  }, [open]);

  function menuKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
      close();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    const current = options.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    options[next]?.focus();
  }

  return <><span ref={trigger} className="hy-action-menu-trigger"><Button variant="quiet" size="sm" iconOnly aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} disabled={!items.length} icon={<MoreHorizontal aria-hidden="true" />} onClick={() => open ? close() : show()} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(event.key === 'ArrowUp' ? 'last' : 'first'); } }} /></span>{open && createPortal(<div ref={menu} id={id} role="menu" aria-label={label} className="hy-spec hy-action-menu" style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }} onKeyDown={menuKey}>{items.map((item, index) => <button key={`${item.label}-${index}`} type="button" role="menuitem" tabIndex={-1} className={item.tone === 'danger' ? 'hy-action-menu-danger' : undefined} onClick={() => { close(); item.onSelect(); }}>{item.label}</button>)}</div>, trigger.current?.closest('dialog') ?? document.body)}</>;
}
export type FieldControlProps = { id: string; required?: boolean; 'aria-invalid': boolean; 'aria-describedby'?: string };
export function Field({ label, required, error, hint, htmlFor, children }: { label: string; required?: boolean; error?: string; hint?: string; htmlFor?: string; children: ReactNode | ((props: FieldControlProps) => ReactNode) }) {
  const generatedId = useId();
  type InputAttributes = { id?: string; required?: boolean; 'aria-invalid'?: boolean; 'aria-describedby'?: string };
  const child = isValidElement<InputAttributes>(children) ? children as ReactElement<InputAttributes> : null;
  const id = htmlFor || child?.props.id || generatedId;
  const descriptionId = `${id}-description`;
  const bindings: FieldControlProps = { id, required: required || child?.props.required, 'aria-invalid': Boolean(error), 'aria-describedby': [child?.props['aria-describedby'], error || hint ? descriptionId : undefined].filter(Boolean).join(' ') || undefined };
  const control = typeof children === 'function' ? children(bindings) : child && typeof child.type === 'string' && ['input', 'select', 'textarea'].includes(child.type)
    ? cloneElement(child, bindings)
    : children;
  return <div className={`hy-field ${error ? 'hy-field--error' : ''}`}><label htmlFor={id}>{label}{required && <span className="hy-required" aria-hidden="true"> *</span>}</label>{control}{error ? <p id={descriptionId} role="alert">{error}</p> : hint ? <small id={descriptionId}>{hint}</small> : null}</div>;
}
export function StatusBadge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) { return <span className={`hy-badge hy-badge--${tone}`}><i aria-hidden="true" />{children}</span>; }
export function Panel({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) { return <section className={`hy-panel ${className}`}>{(title || action) && <header className="hy-panel__header"><h2>{title}</h2>{action}</header>}<div className="hy-panel__body">{children}</div></section>; }
export function MetricCard({ label, value, unit, footnote, icon, className = '' }: { label: string; value: ReactNode; unit?: string; footnote?: string; icon?: ReactNode; className?: string }) { return <article className={`hy-metric ${className}`}><div className="hy-metric__label">{label}{icon}</div><div className="hy-metric__value">{value}{unit && <span>{unit}</span>}</div>{footnote && <p>{footnote}</p>}</article>; }
export function EmptyState({ kind = 'empty', title, action }: { kind?: 'empty' | 'filtered' | 'error' | 'forbidden' | 'offline' | 'loading'; title?: string; action?: ReactNode }) { const labels = { empty: '暂无记录', filtered: '没有符合条件的记录', error: '加载失败', forbidden: '暂无查看权限', offline: '网络连接已断开', loading: '正在加载…' }; const Icon = kind === 'forbidden' ? LockKeyhole : kind === 'offline' ? WifiOff : kind === 'error' ? AlertCircle : Inbox; return <div className={`hy-empty hy-empty--${kind}`} role={kind === 'error' ? 'alert' : 'status'} aria-busy={kind === 'loading' || undefined}>{kind === 'loading' ? <div className="hy-skeleton" aria-hidden="true"><i /><i /><i /></div> : <Icon size={28} aria-hidden="true" />}<p>{title || labels[kind]}</p>{action}</div>; }
export interface DialogProps { open: boolean; title: string; children: ReactNode; onClose: () => void; footer?: ReactNode | ((requestClose: () => void) => ReactNode); kind?: 'dialog' | 'drawer'; wide?: boolean; busy?: boolean; dirty?: boolean }
function trapDialogTab(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab') return;
  const dialog = event.currentTarget;
  const candidates = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')).filter(element => element.tabIndex >= 0 && !element.closest('[hidden],[aria-hidden="true"]') && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden');
  const controls = candidates.filter(element => {
    if (!(element instanceof HTMLInputElement) || element.type !== 'radio' || !element.name) return true;
    const group = candidates.filter((candidate): candidate is HTMLInputElement => candidate instanceof HTMLInputElement && candidate.type === 'radio' && candidate.name === element.name && candidate.form === element.form);
    return element === (group.find(radio => radio.checked) || group[0]);
  });
  const first = controls[0]; const last = controls.at(-1);
  if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
  if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
}
export function Dialog({ open, title, children, onClose, footer, kind = 'dialog', wide = false, busy = false, dirty = false }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const confirmation = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const notified = useRef(false);
  const titleId = useId();
  const confirmTitleId = useId();
  const [confirming, setConfirming] = useState(false);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (open && !element.open) {
      trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      notified.current = false;
      element.showModal();
    } else if (!open && element.open) {
      notified.current = true;
      confirmation.current?.close();
      element.close();
      trigger.current?.focus();
      setConfirming(false);
      setBlocked(false);
    }
  }, [open]);
  useEffect(() => {
    const element = confirmation.current;
    if (confirming && open && !element?.open) element?.showModal();
    else if ((!confirming || !open) && element?.open) element.close();
  }, [confirming, open]);
  useEffect(() => () => { trigger.current?.focus(); }, []);
  const finishClose = () => {
    if (notified.current || !ref.current?.open) return;
    notified.current = true;
    confirmation.current?.close();
    ref.current.close();
    setConfirming(false);
    setBlocked(false);
    trigger.current?.focus();
    onClose();
  };
  const requestClose = () => { if (busy) setBlocked(true); else if (dirty) setConfirming(true); else finishClose(); };
  return createPortal(<>
    <dialog ref={ref} className={`hy-spec hy-dialog hy-dialog--${kind} ${wide ? 'hy-dialog--wide' : ''}`} aria-labelledby={titleId} aria-busy={busy || undefined} onKeyDown={trapDialogTab}
      onCancel={event => { event.preventDefault(); requestClose(); }}
      onClick={event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) requestClose(); } }}>
      <header><h2 id={titleId}>{title}</h2><Button variant="quiet" iconOnly aria-label="关闭" onClick={requestClose} icon={<X size={18} aria-hidden="true" />} /></header>
      <div className="hy-dialog__body">{children}{blocked && busy && <p className="hy-dialog__notice" role="status">正在保存，请稍候再关闭。</p>}</div>{footer && <footer>{typeof footer === 'function' ? footer(requestClose) : footer}</footer>}
    </dialog>
    <dialog ref={confirmation} className="hy-spec hy-dialog hy-dialog--confirm" aria-labelledby={confirmTitleId} onKeyDown={trapDialogTab} onCancel={event => { event.preventDefault(); setConfirming(false); }}>
      <header><h2 id={confirmTitleId}>放弃未保存的修改？</h2></header><div className="hy-dialog__body"><p>关闭后，本次修改将不会保存。</p></div>
      <footer><Button autoFocus onClick={() => setConfirming(false)}>继续编辑</Button><Button variant="danger" onClick={() => { if (busy) { setConfirming(false); setBlocked(true); } else finishClose(); }}>放弃修改</Button></footer>
    </dialog>
  </>, document.body);
}
export type ChartRow = { label: string; value: number | null };
export function ChartFrame({ title, unit, period, note, rows, children }: { title: string; unit?: string; period?: string; note?: string; rows: ChartRow[]; children: ReactNode }) { const [table, setTable] = useState(false); return <Panel className="hy-chart-panel" title={title} action={<Button variant="quiet" size="sm" onClick={() => setTable(value => !value)}>{table ? '图表' : '数据表'}</Button>}><div className="hy-chart-meta"><span>{unit && `单位：${unit}`}</span><span>{period}</span></div>{table ? <table className="hy-chart-table"><caption>{title}数据</caption><thead><tr><th>项目</th><th>{unit || '数值'}</th></tr></thead><tbody>{rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.value ?? '—'}</td></tr>)}</tbody></table> : children}{note && <p className="hy-chart-note">{note}</p>}</Panel>; }
export function BarChart({ rows, tone = 'blue' }: { rows: ChartRow[]; tone?: 'blue' | 'cyan' }) {
  const maximum = Math.max(...rows.map(row => row.value ?? 0), 1);
  return <div className={`hy-bars hy-bars--${tone}`}>
    {rows.map(row => <div className="hy-bar" key={row.label}><span>{row.label}</span><svg viewBox="0 0 300 16" role="img" aria-label={`${row.label}：${row.value ?? '暂无数据'}`} preserveAspectRatio="none"><rect className="hy-bar__track" width="300" height="16" rx="4" /><rect className="hy-bar__fill" width={Math.max(0, row.value ?? 0) / maximum * 300} height="16" rx="4" /></svg><strong>{row.value ?? '—'}</strong></div>)}
    <div className="hy-bars__scale" aria-hidden="true"><div><span>0</span><span>{maximum}</span></div></div>
  </div>;
}
export type DataColumn<T> = { key: string; label: string; render: (row: T) => ReactNode; align?: 'left' | 'right'; sortable?: boolean; width?: CSSProperties['width'] };
export interface DataTableProps<T extends { id: string }> { columns: DataColumn<T>[]; rows: T[]; caption: string; density?: 'standard' | 'compact'; selected?: string[]; onSelectionChange?: (ids: string[]) => void; onSort?: (key: string) => void; sortKey?: string; sortDirection?: 'asc' | 'desc'; renderMobile?: (row: T) => ReactNode }
export function DataTable<T extends { id: string }>({ columns, rows, caption, density = 'standard', selected = [], onSelectionChange, onSort, sortKey, sortDirection = 'asc', renderMobile }: DataTableProps<T>) {
  const currentSelected = rows.filter(row => selected.includes(row.id)).length;
  const allState = currentSelected > 0 && currentSelected < rows.length ? 'mixed' : rows.length > 0 && currentSelected === rows.length;
  const change = (id: string) => onSelectionChange?.(selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id]);
  const toggleAll = (checked: boolean) => onSelectionChange?.(checked ? Array.from(new Set([...selected, ...rows.map(row => row.id)])) : selected.filter(id => !rows.some(row => row.id === id)));
  return <div className={`hy-data-table hy-data-table--${density}${columns.some(column => column.width != null) ? ' hy-data-table--sized' : ''}`}>
    <div className={renderMobile ? 'hy-table-desktop' : 'hy-table-scroll'} role="region" aria-label={caption} tabIndex={0}>
      <table><caption className="hy-sr-only">{caption}</caption><colgroup>{onSelectionChange && <col className="hy-table-select-column" />}{columns.map(column => <col key={column.key} style={column.width == null ? undefined : { width: column.width }} />)}</colgroup><thead><tr>
        {onSelectionChange && <th scope="col" className="hy-table-select-cell"><Checkbox aria-label="全选当前列表" checked={allState} disabled={!rows.length} onCheckedChange={toggleAll} /></th>}
        {columns.map(column => <th scope="col" key={column.key} className={column.align === 'right' ? 'hy-align-right' : ''} aria-sort={sortKey === column.key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : column.sortable ? 'none' : undefined}>
          {column.sortable && onSort ? <button type="button" onClick={() => onSort(column.key)}>{column.label}{sortKey === column.key ? (sortDirection === 'asc' ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />) : <ArrowUpDown size={14} aria-hidden="true" />}</button> : column.label}
        </th>)}
      </tr></thead><tbody>{rows.map(row => <tr key={row.id} className={selected.includes(row.id) ? 'hy-row-selected' : ''}>
        {onSelectionChange && <td className="hy-table-select-cell"><Checkbox aria-label={`选择记录 ${row.id}`} checked={selected.includes(row.id)} onCheckedChange={() => change(row.id)} /></td>}
        {columns.map(column => <td key={column.key} className={column.align === 'right' ? 'hy-align-right' : ''}>{column.render(row)}</td>)}
      </tr>)}</tbody></table>
    </div>
    {renderMobile && <div className="hy-table-mobile" aria-label={caption}>
      {onSelectionChange && rows.length > 0 && <div className="hy-mobile-select-all"><Checkbox checked={allState} onCheckedChange={toggleAll} label="全选当前列表" /></div>}
      {rows.map(row => <article key={row.id} className={selected.includes(row.id) ? 'hy-row-selected' : ''}>{onSelectionChange && <Checkbox className="hy-mobile-row-select" checked={selected.includes(row.id)} onCheckedChange={() => change(row.id)} aria-label={`选择记录 ${row.id}`} />}{renderMobile(row)}</article>)}
    </div>}
    {!rows.length && <EmptyState />}
  </div>;
}
