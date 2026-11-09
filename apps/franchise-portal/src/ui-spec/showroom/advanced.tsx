import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ChevronUp, GripHorizontal, Layers, RotateCcw, ShieldCheck, X } from 'lucide-react';
import type { DialogProps } from '../components';
import { Presence, usePresence } from '../../ui/Presence';
import { useOverlay } from '../../ui/useOverlay';
import { SoftButton, useMotion } from './kit';
import './advanced.css';

export function HoldConfirmButton({ onConfirm, durationMs = 1200, disabled = false, busy = false, label = '长按确认' }: {
  onConfirm: () => void;
  durationMs?: number;
  disabled?: boolean;
  busy?: boolean;
  label?: string;
}) {
  const hintId = useId();
  const [phase, setPhase] = useState<'idle' | 'holding' | 'complete'>('idle');
  const [progress, setProgress] = useState(0);
  const [alternative, setAlternative] = useState(false);
  const active = useRef(false);
  const confirmed = useRef(false);
  const frame = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const callback = useRef(onConfirm);
  const locked = useRef(disabled || busy);
  const fromSpace = useRef(false);
  callback.current = onConfirm;
  locked.current = disabled || busy;
  const duration = Number.isFinite(durationMs) ? Math.max(300, durationMs) : 1200;

  const cancel = useCallback(() => {
    active.current = false;
    cancelAnimationFrame(frame.current);
    clearTimeout(timer.current);
    if (!confirmed.current) { setProgress(0); setPhase('idle'); }
  }, []);

  const finish = useCallback(() => {
    if (!active.current || confirmed.current || locked.current) return;
    active.current = false;
    confirmed.current = true;
    cancelAnimationFrame(frame.current);
    clearTimeout(timer.current);
    setProgress(1);
    setPhase('complete');
    callback.current();
  }, []);

  function start() {
    if (active.current || locked.current) return;
    confirmed.current = false;
    active.current = true;
    setPhase('holding');
    setProgress(0);
    const started = performance.now();
    const tick = (now: number) => {
      if (!active.current) return;
      setProgress(Math.min((now - started) / duration, 1));
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    timer.current = setTimeout(finish, duration);
  }

  useEffect(() => {
    const hidden = () => { if (document.hidden) cancel(); };
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', hidden);
      active.current = false;
      cancelAnimationFrame(frame.current);
      clearTimeout(timer.current);
    };
  }, [cancel]);
  useEffect(() => { if (disabled || busy) cancel(); }, [disabled, busy, cancel]);

  function pointerStart(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || event.isPrimary === false) return;
    fromSpace.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    start();
  }
  function pointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!active.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) cancel();
  }

  return <div className="neo-hold-control">
    <button type="button" className="neo-hold-button" data-state={phase} disabled={disabled || busy} aria-label={label} aria-describedby={hintId} aria-busy={busy || undefined}
      onPointerDown={pointerStart} onPointerMove={pointerMove} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel} onLostPointerCapture={cancel} onBlur={cancel}
      onKeyDown={event => {
        if (event.key === ' ') { event.preventDefault(); fromSpace.current = true; if (!event.repeat) start(); }
        if (event.key === 'Escape') cancel();
        if (event.key === 'Enter') { event.preventDefault(); cancel(); fromSpace.current = false; if (!locked.current) setAlternative(true); }
      }}
      onKeyUp={event => { if (event.key === ' ') { event.preventDefault(); cancel(); fromSpace.current = false; } }}
      onClick={event => { if (event.detail === 0 && !fromSpace.current && !locked.current) setAlternative(true); fromSpace.current = false; }}>
      <span className="neo-hold-ring" aria-hidden="true"><svg viewBox="0 0 48 48"><circle className="neo-hold-track" cx="24" cy="24" r="20" /><circle className="neo-hold-progress" cx="24" cy="24" r="20" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - progress} /></svg>{phase === 'complete' ? <Check size={19} /> : <ShieldCheck size={19} />}</span>
      <span>{busy ? '正在处理' : phase === 'complete' ? '已确认' : phase === 'holding' ? '保持按住…' : label}</span>
    </button>
    <span id={hintId} className="neo-hold-hint">按住 {(duration / 1000).toFixed(1)} 秒，提前松开取消</span>
    <SoftButton variant="quiet" disabled={disabled || busy} onClick={() => setAlternative(true)}>使用普通确认</SoftButton>
    <span className="neo-visually-hidden" role="status">{phase === 'complete' ? '确认完成' : phase === 'holding' ? '正在确认，松开可取消' : ''}</span>
    <ShowroomDialog open={alternative} title="确认操作" onClose={() => setAlternative(false)} busy={busy} footer={requestClose => <><SoftButton onClick={requestClose}>取消</SoftButton><SoftButton variant="primary" disabled={disabled || busy} onClick={() => {
      if (locked.current) return;
      setAlternative(false); confirmed.current = true; setPhase('complete'); setProgress(1); callback.current();
    }}>确认执行</SoftButton></>}><p>这会执行当前示例中的确认操作。请核对操作对象与后果后继续。</p></ShowroomDialog>
  </div>;
}

export type FanStackItem = { id: string; title: string; subtitle?: string; image?: string };

function fanSpring(from: string, to: string): Keyframe[] {
  if (typeof DOMMatrixReadOnly !== 'function') return [{ transform: from }, { transform: to }];
  const start = new DOMMatrixReadOnly(from);
  const end = new DOMMatrixReadOnly(to);
  const keys = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
  return [0, 1.1, .975, 1.006, 1].map((amount, index) => ({
    transform: `matrix(${keys.map(key => start[key] + (end[key] - start[key]) * amount).join(',')})`,
    offset: [0, .56, .78, .92, 1][index],
  }));
}

export function FanStack({ items, onSelect }: { items: FanStackItem[]; onSelect?: (item: FanStackItem) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const focusInside = useRef(false);
  const touchOpening = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const before = useRef(new Map<string, string>());
  const animations = useRef<Animation[]>([]);
  const replayTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [width, setWidth] = useState(360);
  const shown = items.slice(0, 7);
  const { level } = useMotion();
  const halfCount = (shown.length - 1) / 2;
  const angle = halfCount > 0 ? Math.min(14, 24 / halfCount) : 0;
  const angleRadians = angle * Math.max(0, halfCount) * Math.PI / 180;
  const edgeWidth = 88 * Math.cos(angleRadians) + 236 * Math.sin(angleRadians);
  const spread = halfCount > 0 ? Math.max(0, Math.min(76, (width / 2 - edgeWidth - 16) / halfCount)) : 0;
  const capture = useCallback(() => {
    before.current.clear();
    root.current?.querySelectorAll<HTMLElement>('.neo-fan-card').forEach(card => before.current.set(card.dataset.fanId ?? '', getComputedStyle(card).transform));
  }, []);
  function show(next: boolean) { clearTimeout(replayTimer.current); capture(); setExpanded(next); }
  function replay() {
    clearTimeout(replayTimer.current);
    if (level === 'off') { setSelected(null); setExpanded(true); return; }
    capture(); setSelected(null); setExpanded(false);
    replayTimer.current = setTimeout(() => { capture(); setExpanded(true); }, level === 'rich' ? 220 : 80);
  }
  useLayoutEffect(() => {
    animations.current.forEach(animation => animation.cancel());
    animations.current = [];
    const previous = before.current;
    if (level !== 'off' && !document.hidden) {
      root.current?.querySelectorAll<HTMLElement>('.neo-fan-card').forEach((card, index, cards) => {
        const from = previous.get(card.dataset.fanId ?? '');
        const to = getComputedStyle(card).transform;
        if (!from || from === to || typeof card.animate !== 'function') return;
        animations.current.push(card.animate(level === 'rich' ? fanSpring(from, to) : [{ transform: from }, { transform: to }], {
          duration: level === 'rich' ? selected ? 680 : expanded ? 620 : 480 : 180,
          delay: level === 'rich' ? (expanded ? index : cards.length - index - 1) * 24 : 0,
          easing: 'ease-out', fill: 'backwards',
        }));
      });
    }
    previous.clear();
  }, [expanded, selected, width, level]);
  useEffect(() => {
    const stop = () => { if (document.hidden) { animations.current.forEach(animation => animation.cancel()); clearTimeout(replayTimer.current); } };
    document.addEventListener('visibilitychange', stop);
    return () => { document.removeEventListener('visibilitychange', stop); animations.current.forEach(animation => animation.cancel()); clearTimeout(replayTimer.current); };
  }, []);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => { const next = element.getBoundingClientRect().width; if (next > 0) setWidth(next); };
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  return <div ref={root} className="neo-fan" data-expanded={expanded} data-motion={level}
    onPointerEnter={event => { if (event.pointerType !== 'touch') show(true); }}
    onPointerLeave={event => { if (event.pointerType !== 'touch' && !focusInside.current) show(false); }}
    onFocus={() => { focusInside.current = true; if (!touchOpening.current) show(true); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { focusInside.current = false; show(false); } }}>
    <div className="neo-fan-stage" aria-label="资料卡片栈" style={{ '--neo-fan-count': shown.length, '--neo-fan-angle': `${angle}deg`, '--neo-fan-spread': `${spread}px` } as CSSProperties}>
      {!shown.length && <p className="neo-fan-empty">暂无资料</p>}
      {shown.map((item, index) => <button type="button" key={item.id} className={`neo-fan-card ${item.image ? 'neo-fan-photo' : 'neo-fan-document'}`}
        data-fan-id={item.id} aria-label={`查看${item.title}`} aria-pressed={selected === item.id} style={{ '--neo-fan-i': index, '--neo-fan-offset': index - (shown.length - 1) / 2 } as CSSProperties}
        onPointerDown={event => { if (event.pointerType === 'touch') { touchOpening.current = !expanded; if (!expanded) show(true); } else touchOpening.current = false; }}
        onClick={() => { if (touchOpening.current) { touchOpening.current = false; return; } if (!expanded) { show(true); return; } capture(); setSelected(item.id); onSelect?.(item); }}>
        {item.image ? <img src={item.image} alt="" draggable={false} /> : <span className="neo-fan-doc-mark" aria-hidden="true"><Layers size={26} /></span>}
        <span className="neo-fan-caption"><strong>{item.title}</strong>{item.subtitle && <span>{item.subtitle}</span>}</span>
        {selected === item.id && <span className="neo-fan-selected-mark" aria-hidden="true"><Check size={13} /></span>}
      </button>)}
    </div>
    <div className="neo-fan-controls"><span>{items.length} 份资料</span><SoftButton variant="quiet" disabled={shown.length < 2} aria-expanded={expanded} onClick={() => show(!expanded)}>{expanded ? '收起卡片' : '摊开卡片'}</SoftButton><SoftButton variant="quiet" disabled={shown.length < 2} onClick={replay}><RotateCcw size={14} aria-hidden="true" />重播摊开</SoftButton></div>
    {selected && <span className="neo-visually-hidden" role="status">已选择{items.find(item => item.id === selected)?.title}</span>}
  </div>;
}

const sheetSnaps = [0.4, 0.72, 0.94] as const;
type SheetProps = { open: boolean; onClose: () => void; children?: ReactNode; title?: string };

export function MorphSheet({ open, onClose, children, title = '手势面板' }: SheetProps) {
  const { reduced, level } = useMotion();
  const nativeRef = useRef<HTMLDialogElement | null>(null);
  const instant = reduced || level === 'off';
  useLayoutEffect(() => () => { nativeRef.current?.close(); }, []);
  return <Presence present={open} enterMs={instant ? 0 : level === 'gentle' ? 180 : 340} exitMs={instant ? 0 : level === 'gentle' ? 120 : 220} onExited={() => nativeRef.current?.close()}>{open && <MorphSheetSurface nativeRef={nativeRef} onClose={onClose} title={title}>{children}</MorphSheetSurface>}</Presence>;
}

function MorphSheetSurface({ onClose, title, children, nativeRef }: Omit<SheetProps, 'open'> & { nativeRef: { current: HTMLDialogElement | null } }) {
  const titleId = useId();
  const { level } = useMotion();
  const { phase, isPresent } = usePresence();
  const ref = useOverlay<HTMLDialogElement>(onClose);
  const [snap, setSnap] = useState(0);
  const [viewport, setViewport] = useState(() => window.visualViewport?.height ?? window.innerHeight);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{ y: number; height: number; pointerId: number } | null>(null);
  const openViewport = useRef(window.innerHeight);
  const height = dragHeight ?? viewport * sheetSnaps[snap];

  useLayoutEffect(() => {
    const dialog = ref.current;
    nativeRef.current = dialog;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { dialog?.close(); nativeRef.current = null; };
  }, [ref, nativeRef]);
  useEffect(() => {
    const resize = () => {
      const next = window.visualViewport?.height ?? window.innerHeight;
      setViewport(next);
      drag.current = null; setDragHeight(null);
      if (next < openViewport.current * 0.78) setSnap(2);
    };
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('resize', resize); };
  }, []);

  function release(cancelled = false) {
    if (!drag.current) return;
    if (!cancelled && dragHeight != null) {
      const ratio = dragHeight / viewport;
      if (ratio < 0.24 && isPresent) onClose();
      else setSnap(sheetSnaps.reduce((best, value, index) => Math.abs(value - ratio) < Math.abs(sheetSnaps[best] - ratio) ? index : best, 0));
    }
    drag.current = null;
    setDragHeight(null);
  }

  return createPortal(<dialog ref={ref} tabIndex={-1} className="hy-spec neo-morph-dialog" aria-labelledby={titleId}
    data-hy-phase={phase} data-hy-overlay="drawer" data-motion={level} data-snap={sheetSnaps[snap]} data-dragging={dragHeight != null}
    style={{ '--neo-sheet-height': `${height}px`, '--neo-sheet-maxheight': `${viewport * .94}px`, '--neo-sheet-travel': `${viewport * .94 - height}px`, '--neo-sheet-bottom': `${Math.max(0, window.innerHeight - viewport - (window.visualViewport?.offsetTop ?? 0))}px` } as CSSProperties}
    onCancel={event => { event.preventDefault(); if (isPresent) onClose(); }}
    onClick={event => { if (event.target !== event.currentTarget || !isPresent) return; const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientY < bounds.top || event.clientX < bounds.left || event.clientX > bounds.right) onClose(); }}>
    <div className="neo-sheet-surface"><button type="button" className="neo-sheet-handle" aria-label="拖动面板调整高度" aria-describedby={`${titleId}-snap`}
      onPointerDown={event => { if (event.button !== 0 || !isPresent) return; event.currentTarget.setPointerCapture?.(event.pointerId); drag.current = { y: event.clientY, height, pointerId: event.pointerId }; setDragHeight(height); }}
      onPointerMove={event => { if (!drag.current || event.pointerId !== drag.current.pointerId) return; setDragHeight(Math.max(viewport * 0.12, Math.min(viewport * 0.94, drag.current.height + drag.current.y - event.clientY))); }}
      onPointerUp={() => release()} onPointerCancel={() => release(true)} onLostPointerCapture={() => release(true)}
      onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); setSnap(current => Math.max(0, Math.min(2, current + (event.key === 'ArrowUp' ? 1 : -1)))); } }}>
      <GripHorizontal size={36} aria-hidden="true" />
    </button>
    <header className="neo-sheet-heading"><div><h2 id={titleId}>{title}</h2><span id={`${titleId}-snap`} className="neo-sheet-position" role="status"><span key={snap}>{['轻览', '展开', '全览'][snap]}，{Math.round(sheetSnaps[snap] * 100)}%</span></span></div><SoftButton variant="quiet" iconOnly aria-label="关闭手势面板" onClick={onClose}><X size={19} aria-hidden="true" /></SoftButton></header>
    <div className="neo-sheet-body">{children ?? <><p>拖住顶部把手，面板会停在合适的位置。</p><p>正文可以独立滚动，展开和收起也可以通过按钮完成。</p></>}</div>
    <footer className="neo-sheet-footer"><div className="neo-sheet-detents" role="group" aria-label="面板高度">{sheetSnaps.map((value, index) => <button key={value} type="button" aria-pressed={snap === index} aria-label={`${['轻览', '展开', '全览'][index]} ${Math.round(value * 100)}%`} onClick={() => setSnap(index)}><span>{Math.round(value * 100)}%</span></button>)}</div><div className="neo-sheet-step-actions"><SoftButton disabled={snap === 0} onClick={() => setSnap(current => Math.max(0, current - 1))}><ChevronDown size={17} aria-hidden="true" />收起</SoftButton><SoftButton variant="primary" disabled={snap === 2} onClick={() => setSnap(current => Math.min(2, current + 1))}><ChevronUp size={17} aria-hidden="true" />展开</SoftButton></div></footer></div>
  </dialog>, document.body);
}

/** shadcn's header/content/footer composition, on the app's existing modal lifecycle. */
export function ShowroomDialog({ open, ...props }: DialogProps) {
  const { level } = useMotion();
  const native = useRef<HTMLDialogElement | null>(null);
  const duration = level === 'off' ? 0 : level === 'gentle' ? 160 : props.kind === 'drawer' ? 360 : 320;
  useLayoutEffect(() => () => { native.current?.close(); }, []);
  return <Presence present={open} enterMs={duration} exitMs={level === 'off' ? 0 : level === 'gentle' ? 100 : 180} onExited={() => native.current?.close()}>
    {open && <ShowroomDialogSurface {...props} native={native} />}
  </Presence>;
}

function ShowroomDialogSurface({ title, children, onClose, footer, kind = 'dialog', wide = false, busy = false, dirty = false, native }: Omit<DialogProps, 'open'> & { native: { current: HTMLDialogElement | null } }) {
  const { phase, isPresent } = usePresence();
  const { level } = useMotion();
  const id = useId();
  const [confirming, setConfirming] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const notified = useRef(false);
  const finish = () => { if (notified.current || !isPresent) return; notified.current = true; setConfirming(false); onClose(); };
  const requestClose = () => { if (!isPresent || notified.current) return; if (busy) setBlocked(true); else if (dirty) setConfirming(true); else finish(); };
  const ref = useOverlay<HTMLDialogElement>(requestClose);
  useEffect(() => { if (isPresent) notified.current = false; }, [isPresent]);
  useLayoutEffect(() => {
    const dialog = ref.current;
    native.current = dialog;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { dialog?.close(); native.current = null; };
  }, [ref, native]);
  return createPortal(<>
    <dialog ref={ref} tabIndex={-1} aria-labelledby={id} aria-busy={busy || undefined} className={`hy-spec hy-dialog hy-dialog--${kind} ${wide ? 'hy-dialog--wide' : ''} neo-overlay-dialog`}
      data-hy-phase={phase} data-hy-overlay={kind} data-motion={level}
      onCancel={event => { event.preventDefault(); requestClose(); }}
      onClick={event => { if (event.target !== event.currentTarget) return; const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) requestClose(); }}>
      <header data-slot="dialog-header"><h2 id={id}>{title}</h2><SoftButton variant="quiet" iconOnly aria-label="关闭" onClick={requestClose}><X size={18} aria-hidden="true" /></SoftButton></header>
      <div className="hy-dialog__body" data-slot="dialog-content">{children}{blocked && busy && <p className="hy-dialog__notice" role="status">正在保存，请稍候再关闭。</p>}</div>
      {footer && <footer data-slot="dialog-footer">{typeof footer === 'function' ? footer(requestClose) : footer}</footer>}
    </dialog>
    <ShowroomDialog open={confirming} title="放弃未保存的修改？" onClose={() => setConfirming(false)} footer={<><SoftButton autoFocus onClick={() => setConfirming(false)}>继续编辑</SoftButton><SoftButton variant="danger" onClick={() => { if (busy) { setConfirming(false); setBlocked(true); } else finish(); }}>放弃修改</SoftButton></>}><p>关闭后，本次修改将不会保存。</p></ShowroomDialog>
  </>, document.body);
}

export function ShowroomPopover({ label, title, children, footer }: { label: ReactNode; title: string; children: ReactNode; footer?: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const { level } = useMotion();
  const trigger = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const restore = useRef(true);
  const id = useId();
  function dismiss(focus = true) { restore.current = focus; setOpen(false); }
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('button,input,select,textarea,[tabindex="0"]')?.focus();
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !trigger.current?.contains(event.target) && !panel.current?.contains(event.target)) dismiss(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <span className="neo-popup-anchor" ref={trigger}>
    <SoftButton aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? id : undefined} onClick={() => { restore.current = true; setOpen(value => !value); }}>{label}</SoftButton>
    <Presence present={open} enterMs={level === 'off' ? 0 : level === 'rich' ? 220 : 120} exitMs={level === 'off' ? 0 : 100} onExited={() => { if (restore.current) trigger.current?.querySelector('button')?.focus(); }}>
      {open && <ShowroomPopoverSurface id={id} title={title} panel={panel} trigger={trigger} close={dismiss} footer={footer}>{children}</ShowroomPopoverSurface>}
    </Presence>
  </span>;
}

function ShowroomPopoverSurface({ id, title, children, panel, trigger, close, footer }: { id: string; title: string; children: ReactNode; panel: { current: HTMLDivElement | null }; trigger: { current: HTMLSpanElement | null }; close: (focus?: boolean) => void; footer?: (close: () => void) => ReactNode }) {
  const { phase, isPresent } = usePresence();
  const { level } = useMotion();
  const [position, setPosition] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    const place = () => {
      const bounds = trigger.current?.getBoundingClientRect();
      if (!bounds) return;
      const width = Math.min(320, window.innerWidth - 32);
      const height = panel.current?.offsetHeight ?? 200;
      setPosition({ left: Math.max(16, Math.min(bounds.left, window.innerWidth - width - 16)), top: bounds.bottom + height + 12 > window.innerHeight ? Math.max(16, bounds.top - height - 8) : bounds.bottom + 8 });
    };
    place(); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [trigger, panel]);
  return createPortal(<div ref={panel} id={id} role="dialog" aria-labelledby={`${id}-title`} className="neo-overlay-popover" style={position} data-hy-phase={phase} data-motion={level} inert={!isPresent}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}
    onBlur={event => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget) && !trigger.current?.contains(event.relatedTarget)) close(false); }}>
    <header><h3 id={`${id}-title`}>{title}</h3></header><div className="neo-overlay-popover-content">{children}</div>{footer && <footer>{footer(() => close())}</footer>}
  </div>, trigger.current?.closest('dialog') ?? document.body);
}
