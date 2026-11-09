/* eslint-disable react-refresh/only-export-components -- The presence primitive and its matching context hooks share one public entry. */
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

export type PresencePhase = 'entering' | 'open' | 'exiting';
type Owner = { present: boolean; parent: Owner | null };
type Layer = { element: HTMLElement; owner: Owner | null };
const layers: Layer[] = [];
const subscribers = new Set<() => void>();
let revision = 0;
function publish() { revision += 1; subscribers.forEach(listener => listener()); }
function subscribe(listener: () => void) { subscribers.add(listener); return () => { subscribers.delete(listener); }; }
function snapshot() { return revision; }
function belongsTo(owner: Owner | null, ancestor: Owner): boolean { return owner === ancestor || Boolean(owner?.parent && belongsTo(owner.parent, ancestor)); }
type PresenceValue = { phase: PresencePhase; isPresent: boolean; owner: Owner };
const PresenceContext = createContext<PresenceValue | null>(null);
const motionQueries = ['(prefers-reduced-motion: reduce)', '(forced-colors: active)'];
function instantMotion() { return typeof window.matchMedia === 'function' && motionQueries.some(query => window.matchMedia(query).matches); }
function subscribeMotion(listener: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {};
  const queries = motionQueries.map(query => window.matchMedia(query));
  queries.forEach(query => query.addEventListener('change', listener));
  return () => queries.forEach(query => query.removeEventListener('change', listener));
}

/** Keep the last committed subtree alive while its business state closes immediately. */
export function Presence({ present, children, enterMs = 320, exitMs = 180, onExited }: {
  present: boolean; children: ReactNode; enterMs?: number; exitMs?: number; onExited?: () => void;
}) {
  const parent = useContext(PresenceContext);
  const requested = present && (parent?.isPresent ?? true);
  const reduced = useSyncExternalStore(subscribeMotion, instantMotion, () => true);
  const registryVersion = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [state, setState] = useState<PresencePhase | 'absent'>(requested ? (reduced ? 'open' : 'entering') : 'absent');
  const retained = useRef(children);
  const owner = useRef<Owner>({ present: requested, parent: parent?.owner ?? null }).current;
  const exited = useRef(onExited);
  const wasPresent = useRef(requested);
  const absent = state === 'absent';
  useLayoutEffect(() => { exited.current = onExited; if (requested) retained.current = children; }, [children, onExited, requested]);
  useLayoutEffect(() => { owner.present = requested; owner.parent = parent?.owner ?? null; publish(); }, [owner, parent?.owner, requested]);
  useLayoutEffect(() => {
    if (requested) {
      wasPresent.current = true;
      setState(current => current === 'absent' || current === 'exiting' ? (reduced ? 'open' : 'entering') : current);
      if (reduced || enterMs <= 0) { setState('open'); return; }
      const timer = window.setTimeout(() => setState('open'), enterMs);
      return () => window.clearTimeout(timer);
    }
    if (absent) return;
    // Underlying panels wait for nested/top modals to leave the stack first.
    const owned = layers.filter(layer => belongsTo(layer.owner, owner));
    const top = layers.at(-1);
    if (owned.length && top && (top.owner !== owner || layers.some(layer => layer.owner !== owner && belongsTo(layer.owner, owner)))) return;
    setState('exiting');
    const finish = () => { if (owner.present) return; retained.current = null; setState('absent'); if (wasPresent.current) { wasPresent.current = false; exited.current?.(); } };
    if (reduced || exitMs <= 0) { finish(); return; }
    const surfaces = owned.filter(layer => layer.owner === owner).map(layer => layer.element);
    const animationEnd = (event: AnimationEvent) => {
      if (surfaces.includes(event.target as HTMLElement) && /exit|out|leave/i.test(event.animationName)) finish();
    };
    surfaces.forEach(element => element.addEventListener('animationend', animationEnd));
    const timer = window.setTimeout(finish, exitMs);
    return () => { window.clearTimeout(timer); surfaces.forEach(element => element.removeEventListener('animationend', animationEnd)); };
  }, [requested, reduced, enterMs, exitMs, absent, owner, registryVersion]);
  const value = useMemo(() => ({ phase: absent ? 'entering' as const : state as PresencePhase, isPresent: requested, owner }), [state, absent, requested, owner]);
  if (absent && !requested) return null;
  return <PresenceContext.Provider value={value}>{requested ? children : retained.current}</PresenceContext.Provider>;
}

export function usePresence() {
  const value = useContext(PresenceContext);
  return { phase: value?.phase ?? 'open' as PresencePhase, isPresent: value?.isPresent ?? true };
}
export function usePresenceBoundary() { return useContext(PresenceContext) !== null; }

/** Register the actual modal stacking order, including nested portals. */
export function usePresenceRegistration() {
  const owner = useContext(PresenceContext)?.owner ?? null;
  return useMemo(() => (element: HTMLElement) => {
    const layer = { element, owner }; layers.push(layer); publish();
    return () => { const index = layers.indexOf(layer); if (index !== -1) layers.splice(index, 1); publish(); };
  }, [owner]);
}
