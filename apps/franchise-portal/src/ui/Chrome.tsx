import { useEffect, useRef, type ReactNode } from 'react';
import { CheckCheck, CircleAlert, X } from 'lucide-react';
import { usePresence } from './Presence';
import { useNavigationMotion } from './Interactions';

export function NavigationSurface({ mobile, onClose, children }: { mobile: boolean; onClose: () => void; children: ReactNode }) {
  const { phase } = usePresence();
  const ref = useRef<HTMLElement>(null);
  useNavigationMotion(ref);
  const closeRef = useRef(onClose);
  const phaseRef = useRef(phase);
  closeRef.current = onClose;
  phaseRef.current = phase;
  useEffect(() => {
    const sidebar = ref.current;
    if (!mobile || !sidebar) return;
    const trigger = document.activeElement as HTMLElement | null;
    const background = [...document.querySelectorAll<HTMLElement>('.main-workspace, #legacy-portals')];
    const inert = background.map(element => element.inert);
    const overflow = document.body.style.overflow;
    background.forEach(element => { element.inert = true; });
    document.body.style.overflow = 'hidden';
    sidebar.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (phaseRef.current !== 'exiting') closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const items = [...sidebar.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex="0"]')].filter(item => !item.closest('[inert]') && item.getClientRects().length);
      const first = items[0];
      const last = items.at(-1);
      if (!first) { event.preventDefault(); sidebar.focus(); }
      else if (!sidebar.contains(document.activeElement) || document.activeElement === sidebar) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', keydown);
    return () => {
      window.removeEventListener('keydown', keydown);
      background.forEach((element, index) => { element.inert = inert[index]; });
      document.body.style.overflow = overflow;
      if (trigger?.isConnected && !trigger.closest('[inert]') && trigger.getClientRects().length) trigger.focus();
      else document.querySelector<HTMLElement>('.sidebar .nav-link.active')?.focus();
    };
  }, [mobile]);
  const close = () => { if (phase !== 'exiting') onClose(); };
  return <>
    {mobile && <button className="mobile-scrim" aria-label="关闭导航" tabIndex={-1} onClick={close} data-hy-overlay="backdrop" data-hy-phase={phase} />}
    <aside ref={ref} tabIndex={mobile ? -1 : undefined} role={mobile ? 'dialog' : undefined} aria-modal={mobile || undefined} aria-label={mobile ? '导航菜单' : undefined} className={`sidebar ${mobile ? 'sidebar-open' : ''}`} data-hy-overlay={mobile ? 'drawer' : undefined} data-hy-phase={mobile ? phase : undefined}>
      {mobile && <button type="button" className="icon-button mobile-nav-close" aria-label="关闭导航菜单" onClick={close}><X size={20} /></button>}
      {children}
    </aside>
  </>;
}

export function ToastSurface({ notice, onClose }: { notice: { message: string; error: boolean }; onClose: () => void }) {
  const { phase } = usePresence();
  return <div className={`toast ${notice.error ? 'toast-error' : ''}`} data-hy-overlay="toast" data-hy-phase={phase} role={notice.error ? 'alert' : 'status'}>
    <span className="hy-toast-status-icon" key={`${notice.error}:${notice.message}`} aria-hidden="true">{notice.error ? <CircleAlert size={19} /> : <CheckCheck size={19} />}</span><span>{notice.message}</span>
    <button className="icon-button" aria-label="关闭提示" onClick={() => { if (phase !== 'exiting') onClose(); }}><X size={16} /></button>
  </div>;
}
