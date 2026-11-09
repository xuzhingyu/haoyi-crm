import { useCallback, useEffect, useSyncExternalStore, type RefObject } from 'react';

export function useMediaQuery(query: string) {
  const subscribe = useCallback((notify: () => void) => {
    const media = window.matchMedia?.(query);
    media?.addEventListener('change', notify);
    return () => media?.removeEventListener('change', notify);
  }, [query]);
  const snapshot = useCallback(() => window.matchMedia?.(query).matches ?? false, [query]);
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

// Animate surfaces, never a route ancestor containing sticky controls or portals.
const surfaceSelectors = [
  '.workspace-welcome', '.page-heading', '.home-overview-group', '.metrics-strip',
  '.home-columns > .home-panel', '.home-side > *', '.intelligence-toolbar',
  '.article-list', '.research-heading', '.research-composer', '.research-history',
  '.research-report', '.citation-panel', '.proposal-panel', '.filters', '.data-table',
  '.opportunity-pipeline', '.work-task-list', '.settings-panel', '.source-panel',
  '.studio-page-heading', '.studio-panel', '.studio-ledger', '.rail-panel',
  '.analytics > article', '.table-scroll', '.lead-cards', '.delivery-list',
  '.kanban', '.knowledge-list', '.report-list',
];
const surfaceSelector = surfaceSelectors.join(',');
const pressSelector = '.button:not(.quiet), .legacy-crm button.primary, .legacy-crm .studio-tabs button';

/** Event delegation only controls the internal CSS face; it never dispatches an action. */
function useButtonFeedback(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const forced = window.matchMedia?.('(forced-colors: active)');
    const active = new Map<HTMLElement, ReturnType<typeof setTimeout> | undefined>();
    const noMotion = () => Boolean(document.hidden || reduced?.matches || forced?.matches);
    const clear = (button: HTMLElement) => { clearTimeout(active.get(button)); active.delete(button); delete button.dataset.hyPress; };
    const clearAll = () => { for (const button of active.keys()) clear(button); };
    const buttonFor = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>(pressSelector) : null;
    const locked = (button: HTMLElement) => button.matches(':disabled') || Boolean(button.closest('[aria-disabled="true"],[aria-busy="true"],[inert]'));
    const press = (button: HTMLElement | null) => {
      if (!button || locked(button) || noMotion()) return;
      clear(button); button.dataset.hyPress = 'down'; active.set(button, undefined);
    };
    const release = (button: HTMLElement | null) => {
      if (!button || !active.has(button)) return;
      if (locked(button) || noMotion()) { clear(button); return; }
      clearTimeout(active.get(button));
      button.dataset.hyPress = 'release';
      active.set(button, setTimeout(() => clear(button), 460));
    };
    const down = (event: PointerEvent) => { if (event.button === 0 && event.isPrimary !== false) press(buttonFor(event.target)); };
    const up = (event: PointerEvent) => { if (event.isPrimary !== false) release(buttonFor(event.target)); };
    const cancel = (event: Event) => { const button = buttonFor(event.target); if (button) clear(button); };
    const out = (event: PointerEvent) => { const button = buttonFor(event.target); if (button && (!(event.relatedTarget instanceof Node) || !button.contains(event.relatedTarget))) clear(button); };
    const keyDown = (event: KeyboardEvent) => { if (!event.repeat && (event.key === ' ' || event.key === 'Enter')) press(buttonFor(event.target)); };
    const keyUp = (event: KeyboardEvent) => { if (event.key === ' ' || event.key === 'Enter') release(buttonFor(event.target)); };
    const animationEnd = (event: AnimationEvent) => { if (event.animationName === 'hy-button-release') cancel(event); };
    const visibility = () => { document.documentElement.toggleAttribute('data-hy-motion-suspended', document.hidden); if (document.hidden) clearAll(); };
    const observer = new MutationObserver(() => { for (const button of active.keys()) if (!button.isConnected || locked(button)) clear(button); });
    observer.observe(document.body, { attributes: true, attributeFilter: ['disabled', 'aria-disabled', 'aria-busy', 'inert'], childList: true, subtree: true });
    document.addEventListener('pointerdown', down, true); document.addEventListener('pointerup', up, true);
    document.addEventListener('pointerout', out, true); document.addEventListener('pointercancel', cancel, true);
    document.addEventListener('keydown', keyDown, true); document.addEventListener('keyup', keyUp, true);
    document.addEventListener('focusout', cancel, true); document.addEventListener('animationend', animationEnd, true);
    document.addEventListener('visibilitychange', visibility); window.addEventListener('blur', clearAll);
    reduced?.addEventListener('change', clearAll); forced?.addEventListener('change', clearAll);
    visibility();
    return () => {
      clearAll(); observer.disconnect(); document.documentElement.removeAttribute('data-hy-motion-suspended');
      document.removeEventListener('pointerdown', down, true); document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointerout', out, true); document.removeEventListener('pointercancel', cancel, true);
      document.removeEventListener('keydown', keyDown, true); document.removeEventListener('keyup', keyUp, true);
      document.removeEventListener('focusout', cancel, true); document.removeEventListener('animationend', animationEnd, true);
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('blur', clearAll);
      reduced?.removeEventListener('change', clearAll); forced?.removeEventListener('change', clearAll);
    };
  }, [ready]);
}

/** Moves only the active navigation background between actual rendered links. */
export function useNavigationMotion(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = root.current;
    if (!container) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const forced = window.matchMedia?.('(forced-colors: active)');
    let previous = container.querySelector<HTMLElement>('.nav-link.active');
    let moving: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      clearTimeout(timer);
      if (moving) { delete moving.dataset.hyNavMoving; moving.style.removeProperty('--hy-nav-from-x'); moving.style.removeProperty('--hy-nav-from-y'); }
      moving = null;
    };
    const update = () => {
      const selected = container.querySelector<HTMLElement>('.nav-link.active');
      if (selected === previous) return;
      const source = moving ?? previous;
      const sourceBox = source?.isConnected ? source.getBoundingClientRect() : null;
      let from = sourceBox ? { left: sourceBox.left, top: sourceBox.top, width: sourceBox.width } : null;
      if (moving && from) {
        // Read the in-flight face before removing its animation; rapid selection
        // continues from the visible position instead of the old destination.
        const matrix = getComputedStyle(moving, '::before').transform.match(/^matrix(3d)?\(([^)]+)\)$/);
        if (matrix) {
          const values = matrix[2].split(',').map(Number);
          const x = values[matrix[1] ? 12 : 4]; const y = values[matrix[1] ? 13 : 5];
          if (Number.isFinite(x) && Number.isFinite(y)) from = { ...from, left: from.left + x, top: from.top + y };
        }
      }
      clear();
      if (from && selected && !document.hidden && !reduced?.matches && !forced?.matches) {
        const to = selected.getBoundingClientRect();
        if (from.width > 0 && to.width > 0) {
          moving = selected;
          selected.style.setProperty('--hy-nav-from-x', `${from.left - to.left}px`);
          selected.style.setProperty('--hy-nav-from-y', `${from.top - to.top}px`);
          selected.dataset.hyNavMoving = 'true';
          timer = setTimeout(clear, 240);
        }
      }
      previous = selected;
    };
    const observer = new MutationObserver(update);
    observer.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-current'] });
    document.addEventListener('visibilitychange', clear); window.addEventListener('resize', clear);
    reduced?.addEventListener('change', clear); forced?.addEventListener('change', clear);
    return () => { observer.disconnect(); clear(); document.removeEventListener('visibilitychange', clear); window.removeEventListener('resize', clear); reduced?.removeEventListener('change', clear); forced?.removeEventListener('change', clear); };
  }, [root]);
}

export function useWorkspaceMotion(root: RefObject<HTMLElement | null>, pathname: string, ready: boolean) {
  useButtonFeedback(ready);
  useEffect(() => {
    const container = root.current;
    if (!ready || !container) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const forced = window.matchMedia?.('(forced-colors: active)');
    const fine = window.matchMedia?.('(hover: hover) and (pointer: fine)');
    const transparency = window.matchMedia?.('(prefers-reduced-transparency: reduce)');
    const seen = new WeakSet<Element>();
    const revealedSlots = new Set<string>();
    const seenItems = new Set<string>();
    const feedback = new WeakMap<Element, string>();
    let initializedItems = false;
    let revealedBudget = false;
    let scanFrame = 0;
    let pointerFrame = 0;
    let activeCard: HTMLElement | null = null;
    let pointerX = 0;
    let pointerY = 0;
    const noMotion = () => Boolean(document.hidden || reduced?.matches || forced?.matches);
    const clearGlow = () => {
      cancelAnimationFrame(pointerFrame);
      pointerFrame = 0;
      activeCard?.style.removeProperty('--hy-pointer-x');
      activeCard?.style.removeProperty('--hy-pointer-y');
      activeCard = null;
    };
    const reveal = () => {
      scanFrame = 0;
      const candidates = [...container.querySelectorAll<HTMLElement>(surfaceSelector)];
      const slotCounts = new Map<string, number>();
      let order = 0;
      for (const surface of candidates) {
        const selector = surfaceSelectors.find(selector => surface.matches(selector))!;
        const index = slotCounts.get(selector) ?? 0;
        slotCounts.set(selector, index + 1);
        const slot = `${selector}:${index}`;
        if (seen.has(surface)) continue;
        seen.add(surface);
        // Loading/sorting may recreate the same panel; its route-level entrance is still once.
        if (revealedSlots.has(slot)) continue;
        revealedSlots.add(slot);
        // One transform per surface tree; dense rows keep their reading position.
        if (noMotion() || surface.parentElement?.closest(surfaceSelector) || surface.closest('[role="dialog"],dialog')) continue;
        surface.style.setProperty('--hy-enter-delay', `${Math.min(order++ * 40, 200)}ms`);
        surface.classList.add('hy-page-enter');
      }
      const items = container.querySelectorAll<HTMLElement>('[data-hy-item-id]');
      for (const item of items) {
        const id = item.dataset.hyItemId!;
        if (seenItems.has(id)) continue;
        seenItems.add(id);
        if (initializedItems && !noMotion()) item.classList.add('hy-item-enter');
      }
      if (items.length || container.querySelector('.work-task-list,.claim-grid,.lead-cards,.empty-state h3,.collection-empty,.empty-copy')) initializedItems = true;
      const budgetBar = container.querySelector<HTMLElement>('.budget-track > span');
      if (budgetBar && !revealedBudget) {
        revealedBudget = true;
        if (!noMotion()) budgetBar.classList.add('hy-chart-enter');
      }
      for (const message of container.querySelectorAll<HTMLElement>('[role="alert"],.field-error,.form-error,.success-banner')) {
        const text = message.textContent?.trim() ?? '';
        if (!text || feedback.get(message) === text) continue;
        feedback.set(message, text);
        if (!noMotion()) message.classList.add('hy-feedback-enter');
      }
    };
    const queueReveal = () => { if (!scanFrame) scanFrame = requestAnimationFrame(reveal); };
    const stopAnimation = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      target?.closest<HTMLElement>('.hy-page-enter')?.classList.remove('hy-page-enter');
      target?.closest<HTMLElement>('.hy-item-enter')?.classList.remove('hy-item-enter');
      if (event.type === 'animationend') target?.classList.remove('hy-chart-enter');
      if (event.type === 'animationend') target?.classList.remove('hy-feedback-enter');
    };
    const pointerMove = (event: PointerEvent) => {
      if (!fine?.matches || noMotion() || transparency?.matches || document.documentElement.dataset.hyTransparency === 'reduced' || document.hidden) { clearGlow(); return; }
      const card = (event.target as Element).closest<HTMLElement>('.hy-glow-card');
      if (!card) { clearGlow(); return; }
      if (activeCard !== card) { clearGlow(); activeCard = card; }
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!pointerFrame) pointerFrame = requestAnimationFrame(() => {
        pointerFrame = 0;
        if (!activeCard) return;
        const rect = activeCard.getBoundingClientRect();
        activeCard.style.setProperty('--hy-pointer-x', `${((pointerX - rect.left) / rect.width - .5) * 8}px`);
        activeCard.style.setProperty('--hy-pointer-y', `${((pointerY - rect.top) / rect.height - .5) * 8}px`);
      });
    };
    const changedPreference = () => {
      clearGlow();
      if (noMotion()) container.querySelectorAll('.hy-page-enter,.hy-item-enter,.hy-chart-enter,.hy-feedback-enter').forEach(element => element.classList.remove('hy-page-enter','hy-item-enter','hy-chart-enter','hy-feedback-enter'));
    };
    const observer = new MutationObserver(queueReveal);
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    queueReveal();
    container.addEventListener('focusin', stopAnimation);
    container.addEventListener('animationend', stopAnimation);
    container.addEventListener('pointermove', pointerMove, { passive: true });
    container.addEventListener('pointerleave', clearGlow);
    document.addEventListener('visibilitychange', changedPreference);
    for (const media of [reduced, forced, fine, transparency]) media?.addEventListener('change', changedPreference);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(scanFrame);
      clearGlow();
      container.querySelectorAll('.hy-page-enter,.hy-item-enter,.hy-chart-enter,.hy-feedback-enter').forEach(element => element.classList.remove('hy-page-enter','hy-item-enter','hy-chart-enter','hy-feedback-enter'));
      container.removeEventListener('focusin', stopAnimation);
      container.removeEventListener('animationend', stopAnimation);
      container.removeEventListener('pointermove', pointerMove);
      container.removeEventListener('pointerleave', clearGlow);
      document.removeEventListener('visibilitychange', changedPreference);
      for (const media of [reduced, forced, fine, transparency]) media?.removeEventListener('change', changedPreference);
    };
  }, [root, pathname, ready]);
}
