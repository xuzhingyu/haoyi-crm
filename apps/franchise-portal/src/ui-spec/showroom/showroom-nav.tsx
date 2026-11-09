import { useLayoutEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useMotion } from './kit';

type NavItem<T extends string> = { id: T; label: string; icon: LucideIcon };

export function ShowroomNav<T extends string>({ items, value, onChange }: { items: readonly NavItem<T>[]; value: T; onChange: (id: T) => void }) {
  const nav = useRef<HTMLElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  const previous = useRef<{ x: number; y: number } | null>(null);
  const running = useRef<Animation | null>(null);
  const interruptedTransform = useRef<string | null>(null);
  const { level } = useMotion();
  useLayoutEffect(() => {
    const root = nav.current;
    const surface = indicator.current;
    if (!root || !surface) return;
    const place = (animate: boolean) => {
      const selected = root.querySelector<HTMLButtonElement>('[aria-current="page"]');
      if (!selected) return;
      const box = selected.getBoundingClientRect();
      const origin = root.getBoundingClientRect();
      const next = { x: box.left - origin.left + root.scrollLeft, y: box.top - origin.top + root.scrollTop };
      if (!animate && previous.current?.x === next.x && previous.current?.y === next.y && surface.style.width === `${box.width}px` && surface.style.height === `${box.height}px`) return;
      surface.style.width = `${box.width}px`;
      surface.style.height = `${box.height}px`;
      surface.style.transform = `translate(${next.x}px, ${next.y}px)`;
      running.current?.cancel();
      if (animate && previous.current && level !== 'off' && !document.hidden && surface.animate) {
        running.current = surface.animate([
          { transform: interruptedTransform.current ?? `translate(${previous.current.x}px, ${previous.current.y}px)` },
          { transform: `translate(${next.x}px, ${next.y}px)` },
        ], { duration: level === 'rich' ? 360 : 160, easing: 'cubic-bezier(.22,.8,.3,1)' });
      }
      interruptedTransform.current = null;
      previous.current = next;
    };
    place(true);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => place(false)) : null;
    observer?.observe(root);
    const stop = () => running.current?.cancel();
    document.addEventListener('visibilitychange', stop);
    return () => {
      if (running.current?.playState === 'running') interruptedTransform.current = getComputedStyle(surface).transform;
      observer?.disconnect(); stop(); document.removeEventListener('visibilitychange', stop);
    };
  }, [value, level]);
  return <nav ref={nav} className="neo-nav" aria-label="组件分类">
    <span ref={indicator} className="neo-nav-indicator" aria-hidden="true" />
    {items.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={value === id ? 'page' : undefined} onClick={() => onChange(id)}><Icon size={19} strokeWidth={1.7} aria-hidden="true" /><span>{label}</span></button>)}
  </nav>;
}
