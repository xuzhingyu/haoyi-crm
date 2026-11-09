import { useLayoutEffect, useRef } from 'react';
import { usePresence, usePresenceRegistration } from './Presence';

const modalStack: HTMLElement[] = [];
let previousOverflow = '';
let appWasInert = false;
function syncModalLayers() { const top = modalStack.at(-1); modalStack.forEach(element => { element.inert = element !== top; }); }

/** One focus/scroll stack for native dialogs and legacy portal surfaces. */
export function useOverlay<T extends HTMLElement>(onClose: () => void, open = true, dismissible = true) {
  const ref = useRef<T>(null);
  const closeRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  const { isPresent } = usePresence();
  const presentRef = useRef(isPresent);
  const register = usePresenceRegistration();
  closeRef.current = onClose; dismissibleRef.current = dismissible; presentRef.current = isPresent;
  useLayoutEffect(() => {
    const element = ref.current;
    if (!open || !element) return;
    const trigger = document.activeElement as HTMLElement | null;
    const app = document.querySelector<HTMLElement>('.app-shell');
    if (!modalStack.length) {
      previousOverflow = document.body.style.overflow; appWasInert = app?.hasAttribute('inert') ?? false;
      document.body.style.overflow = 'hidden'; app?.setAttribute('inert', '');
    }
    modalStack.push(element); syncModalLayers();
    const unregister = register(element); element.focus();
    const keydown = (event: KeyboardEvent) => {
      if (modalStack.at(-1) !== element) return;
      if (event.key === 'Escape') { event.preventDefault(); if (presentRef.current && dismissibleRef.current) closeRef.current(); }
      if (event.key !== 'Tab') return;
      const nodes = [...element.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')]
        .filter(node => !node.closest('[hidden]') && !element.contains(node.closest('[inert]')) && node.getAttribute('aria-hidden') !== 'true');
      const first = nodes[0]; const last = nodes.at(-1);
      if (!first) { event.preventDefault(); element.focus(); return; }
      if (document.activeElement === element || !element.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const preventExitingAction = (event: Event) => { if (!presentRef.current) { event.preventDefault(); event.stopPropagation(); } };
    element.addEventListener('click', preventExitingAction, true); element.addEventListener('submit', preventExitingAction, true);
    window.addEventListener('keydown', keydown);
    return () => {
      const wasTop = modalStack.at(-1) === element; const index = modalStack.indexOf(element);
      if (index !== -1) modalStack.splice(index, 1);
      element.inert = false; syncModalLayers();
      if (!modalStack.length) { document.body.style.overflow = previousOverflow; if (!appWasInert) app?.removeAttribute('inert'); }
      element.removeEventListener('click', preventExitingAction, true); element.removeEventListener('submit', preventExitingAction, true);
      window.removeEventListener('keydown', keydown);
      if (wasTop) { if (trigger?.isConnected && (modalStack.at(-1)?.contains(trigger) || !trigger.closest('[inert]'))) trigger.focus(); else modalStack.at(-1)?.focus(); }
      unregister();
    };
  }, [open, register]);
  return ref;
}
