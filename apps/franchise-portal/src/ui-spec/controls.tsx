import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Minus } from 'lucide-react';
import './controls.css';

export type ControlOption = { value: string; label: string; disabled?: boolean };
export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'checked' | 'defaultChecked' | 'onChange' | 'size'> {
  checked: boolean | 'mixed';
  onCheckedChange?: (checked: boolean) => void;
  label?: ReactNode;
}
export function Checkbox({ checked, onCheckedChange, label, className = '', disabled, ...props }: CheckboxProps) {
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => { if (input.current) input.current.indeterminate = checked === 'mixed'; }, [checked]);
  return <label className={`hy-choice ${disabled ? 'hy-choice--disabled' : ''} ${className}`}>
    <input {...props} ref={input} type="checkbox" className="hy-choice__input" disabled={disabled} checked={checked === true} onChange={event => onCheckedChange?.(event.target.checked)} />
    <span className="hy-choice__box" aria-hidden="true">{checked === 'mixed' ? <Minus /> : <Check />}</span>
    {label != null && <span className="hy-choice__label">{label}</span>}
  </label>;
}

export interface RadioGroupProps { value: string; onValueChange: (value: string) => void; options: ControlOption[]; name?: string; label: ReactNode; disabled?: boolean; id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling' }
export function RadioGroup({ value, onValueChange, options, name, label, disabled, id, ...aria }: RadioGroupProps) {
  const generatedName = useId();
  return <fieldset id={id} className="hy-radio-group" disabled={disabled} {...aria}><legend>{label}</legend><div>{options.map(option => <label key={option.value} className={`hy-choice hy-choice--radio ${disabled || option.disabled ? 'hy-choice--disabled' : ''}`}>
    <input type="radio" className="hy-choice__input" name={name || generatedName} value={option.value} checked={value === option.value} disabled={disabled || option.disabled} onChange={() => onValueChange(option.value)} />
    <span className="hy-choice__box" aria-hidden="true"><i /></span><span className="hy-choice__label">{option.label}</span>
  </label>)}</div></fieldset>;
}

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'checked' | 'defaultChecked' | 'onChange' | 'size'> { checked: boolean; onCheckedChange: (checked: boolean) => void; label: ReactNode }
export function Switch({ checked, onCheckedChange, label, disabled, className = '', ...props }: SwitchProps) {
  return <label className={`hy-switch ${disabled ? 'hy-switch--disabled' : ''} ${className}`}><input {...props} className="hy-switch__input" type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={event => onCheckedChange(event.target.checked)} /><span className="hy-switch__track" aria-hidden="true"><i /></span><span>{label}</span></label>;
}

export interface SelectProps {
  value: string; onValueChange: (value: string) => void; options: ControlOption[];
  id?: string; name?: string; required?: boolean; disabled?: boolean;
  'aria-label'?: string; 'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling'; 'aria-describedby'?: string;
}
type PopupPosition = { target: HTMLElement; style: CSSProperties };
function useNativeSelect() {
  const [native, setNative] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => { if (typeof window.matchMedia !== 'function') return; const media = window.matchMedia('(max-width: 767px)'); const update = () => setNative(media.matches); media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, []);
  return native;
}
export function Select({ value, onValueChange, options, id, name, required, disabled, ...aria }: SelectProps) {
  const native = useNativeSelect();
  const generatedId = useId();
  const controlId = id || generatedId;
  const listId = `${controlId}-listbox`;
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const nativeControl = useRef<HTMLSelectElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [popup, setPopup] = useState<PopupPosition | null>(null);
  const typeahead = useRef({ text: '', at: 0 });
  const enabled = options.flatMap((option, index) => option.disabled ? [] : [index]);
  const selectedIndex = options.findIndex(option => option.value === value);
  const selectedLabel = selectedIndex >= 0 ? options[selectedIndex].label : '请选择';
  const optionId = (index: number) => `${listId}-${index}`;
  function close(restoreFocus = false) { setOpen(false); if (restoreFocus) trigger.current?.focus(); }
  function show(edge?: 'first' | 'last') {
    if (disabled || !enabled.length) return;
    setActive(edge === 'first' ? enabled[0] : edge === 'last' ? enabled.at(-1)! : enabled.includes(selectedIndex) ? selectedIndex : enabled[0]);
    setOpen(true);
  }
  function commit(index: number) { const option = options[index]; if (!option || option.disabled) return; onValueChange(option.value); close(true); }
  function move(offset: number) { const position = enabled.indexOf(active); const next = position < 0 ? (offset < 0 ? enabled.length - 1 : 0) : Math.min(enabled.length - 1, Math.max(0, position + offset)); setActive(enabled[next] ?? -1); }
  function search(character: string) {
    const now = Date.now();
    const previous = now - typeahead.current.at < 700 ? typeahead.current.text : '';
    let text = (previous + character).toLocaleLowerCase();
    if ([...text].every(letter => letter === character.toLocaleLowerCase())) text = character.toLocaleLowerCase();
    typeahead.current = { text, at: now };
    const start = text.length === 1 ? active + 1 : active;
    const ordered = [...enabled.filter(index => index >= start), ...enabled.filter(index => index < start)];
    const match = ordered.find(index => options[index].label.toLocaleLowerCase().startsWith(text));
    if (match != null) { setActive(match); setOpen(true); }
  }
  function keydown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled || event.nativeEvent.isComposing) return;
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === 'Tab') { close(); return; }
    if (event.altKey && event.key === 'ArrowUp' && open) { event.preventDefault(); commit(active); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (open) move(event.key === 'ArrowDown' ? 1 : -1); else show(event.key === 'ArrowUp' ? 'last' : undefined); return; }
    if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); if (!open) show(event.key === 'Home' ? 'first' : 'last'); else setActive(event.key === 'Home' ? enabled[0] : enabled.at(-1)!); return; }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (open) commit(active); else show(); return; }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); search(event.key); }
  }
  useLayoutEffect(() => {
    if (!open || native || disabled) return;
    const button = trigger.current;
    if (!button) return;
    const target = button.closest<HTMLDialogElement>('dialog[open]') || document.body;
    const update = () => {
      const box = button.getBoundingClientRect();
      const inDialog = target instanceof HTMLDialogElement;
      const bounds = inDialog ? target.getBoundingClientRect() : { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight };
      const topBound = Math.max(0, bounds.top) + 8;
      const bottomBound = Math.min(window.innerHeight, bounds.bottom) - 8;
      const leftBound = Math.max(0, bounds.left) + 8;
      const rightBound = Math.min(window.innerWidth, bounds.right) - 8;
      const below = bottomBound - box.bottom - 6;
      const above = box.top - topBound - 6;
      const wanted = Math.min(284, options.length * 40 + 12);
      const upward = below < wanted && above > below;
      const maxHeight = Math.max(40, Math.min(wanted, upward ? above : below));
      const width = Math.max(0, Math.min(Math.max(box.width, 160), rightBound - leftBound));
      const left = Math.max(leftBound, Math.min(box.left, rightBound - width));
      const top = upward ? box.top - 6 - maxHeight : box.bottom + 6;
      setPopup({ target, style: { position: inDialog ? 'absolute' : 'fixed', left: inDialog ? left - bounds.left + target.scrollLeft - target.clientLeft : left, top: inDialog ? top - bounds.top + target.scrollTop - target.clientTop : top, width, maxHeight } });
    };
    update();
    window.addEventListener('resize', update);
    document.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update);
    return () => { window.removeEventListener('resize', update); document.removeEventListener('scroll', update, true); window.visualViewport?.removeEventListener('resize', update); };
  }, [open, native, disabled, options.length]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { const target = event.target as Node; if (!trigger.current?.contains(target) && !list.current?.contains(target)) setOpen(false); };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);
  useEffect(() => { if (open && list.current) document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: 'nearest' }); }, [active, open, listId]);
  useEffect(() => { if (native || disabled) setOpen(false); }, [native, disabled]);
  const nativeOptions = options.map(option => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>);
  if (native) return <span className="hy-select-native"><select {...aria} ref={nativeControl} id={controlId} name={name} value={value} required={required} disabled={disabled} onChange={event => onValueChange(event.target.value)}>{selectedIndex < 0 && <option value="" disabled>请选择</option>}{nativeOptions}</select><ChevronDown aria-hidden="true" /></span>;
  return <span className="hy-select">
    <button {...aria} ref={trigger} id={controlId} type="button" role="combobox" className="hy-select-trigger" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-activedescendant={open && active >= 0 ? optionId(active) : undefined} aria-required={required || undefined} disabled={disabled} onClick={() => open ? close() : show()} onKeyDown={keydown} onBlur={event => { if (!list.current?.contains(event.relatedTarget as Node)) close(); }}><span>{selectedLabel}</span><ChevronDown aria-hidden="true" /></button>
    <select className="hy-select-form-proxy" aria-hidden="true" tabIndex={-1} name={name} value={value} required={required} disabled={disabled} onChange={event => onValueChange(event.target.value)} onInvalid={event => { event.preventDefault(); trigger.current?.focus(); show(); }}>{selectedIndex < 0 && <option value="" />}{nativeOptions}</select>
    {open && popup && createPortal(<div className="hy-spec hy-select-portal" style={popup.style}><div ref={list} id={listId} role="listbox" aria-label={aria['aria-label'] || '选择选项'} className="hy-select-listbox hy-glass-float" onPointerDown={event => event.preventDefault()}>{options.map((option, index) => <div key={option.value} id={optionId(index)} role="option" aria-selected={option.value === value} aria-disabled={option.disabled || undefined} data-active={index === active || undefined} className="hy-select-option" onPointerMove={() => { if (!option.disabled) setActive(index); }} onClick={() => commit(index)}><span>{option.label}</span>{option.value === value && <Check aria-hidden="true" />}</div>)}</div></div>, popup.target)}
  </span>;
}

export interface SegmentedControlProps { value: string; onValueChange: (value: string) => void; options: ControlOption[]; 'aria-label': string }
export function SegmentedControl({ value, onValueChange, options, 'aria-label': label }: SegmentedControlProps) {
  const name = useId();
  const selected = options.findIndex(option => option.value === value);
  return <div className="hy-segmented" role="radiogroup" aria-label={label} style={{ '--hy-segment-count': Math.max(1, options.length), '--hy-segment-index': Math.max(0, selected) } as CSSProperties}>{selected >= 0 && <i className="hy-segmented__indicator" aria-hidden="true" />}{options.map(option => <label key={option.value} className="hy-segmented__option"><input type="radio" name={name} value={option.value} checked={value === option.value} disabled={option.disabled} onChange={() => onValueChange(option.value)} /><span>{option.label}</span></label>)}</div>;
}
