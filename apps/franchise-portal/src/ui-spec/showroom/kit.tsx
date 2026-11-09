import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';

export type MotionLevel = 'rich' | 'gentle' | 'off';
// The local specimen kit deliberately exposes its motion contract beside its primitives.
// eslint-disable-next-line react-refresh/only-export-components
export const MotionContext = createContext<MotionLevel>('rich');
const preferences = ['(prefers-reduced-motion: reduce)', '(forced-colors: active)'];
function subscribe(listener: () => void) {
  const queries = preferences.map(value => window.matchMedia(value));
  queries.forEach(query => query.addEventListener('change', listener));
  return () => queries.forEach(query => query.removeEventListener('change', listener));
}
function snapshot() { return preferences.some(value => window.matchMedia(value).matches); }
// eslint-disable-next-line react-refresh/only-export-components
export function useMotion() {
  const selected = useContext(MotionContext);
  const systemReduced = useSyncExternalStore(subscribe, snapshot, () => false);
  const level = systemReduced ? 'off' : selected;
  return { level, reduced: level === 'off' };
}

type SoftButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  loading?: boolean;
  iconOnly?: boolean;
};
export function SoftButton({ children, variant = 'secondary', loading = false, iconOnly = false, className = '', disabled, type = 'button', onPointerDown, onPointerUp, onPointerLeave, onPointerCancel, onKeyDown, onKeyUp, onBlur, ...props }: SoftButtonProps) {
  const surface = useRef<HTMLSpanElement>(null);
  const ripple = useRef<HTMLSpanElement>(null);
  const rippleAnimation = useRef<Animation | null>(null);
  const animation = useRef<Animation | null>(null);
  const pressed = useRef(false);
  const { level, reduced } = useMotion();
  useEffect(() => {
    const reset = () => { animation.current?.cancel(); rippleAnimation.current?.cancel(); pressed.current = false; };
    reset();
    document.addEventListener('visibilitychange', reset);
    return () => { reset(); document.removeEventListener('visibilitychange', reset); };
  }, [level, disabled, loading]);
  function animate(down: boolean, released = false) {
    if (disabled || loading || reduced || !surface.current?.animate) return;
    if (!down && !pressed.current) return;
    pressed.current = down;
    animation.current?.cancel();
    if (released && level === 'rich' && ripple.current?.animate) {
      rippleAnimation.current?.cancel();
      rippleAnimation.current = ripple.current.animate([{ transform: 'scale(.15)', opacity: .24 }, { transform: 'scale(1)', opacity: 0 }], { duration: 520, easing: 'ease-out' });
    }
    animation.current = surface.current.animate(down
      ? [{ transform: 'scale(1)' }, { transform: level === 'rich' ? 'scale(.94,.91)' : 'scale(.98)' }]
      : [{ transform: level === 'rich' ? 'scale(.94,.91)' : 'scale(.98)' }, { transform: level === 'rich' ? 'scale(1.035,1.055)' : 'scale(1)' }, { transform: 'scale(.993,.985)' }, { transform: 'scale(1)' }],
    { duration: down ? 110 : level === 'rich' ? 480 : 160, easing: 'cubic-bezier(.22,.8,.3,1)', fill: down ? 'forwards' : 'none' });
  }
  return <button {...props} data-slot="button" data-variant={variant} type={type} disabled={disabled || loading} aria-busy={loading || undefined}
    className={`neo-button neo-button--${variant} ${iconOnly ? 'neo-button--icon' : ''} ${className}`}
    onPointerDown={event => { if (event.button === 0) animate(true); onPointerDown?.(event); }}
    onPointerUp={event => { animate(false, true); onPointerUp?.(event); }}
    onPointerLeave={event => { animate(false); onPointerLeave?.(event); }}
    onPointerCancel={event => { animate(false); onPointerCancel?.(event); }}
    onKeyDown={event => { if (!event.repeat && [' ', 'Enter'].includes(event.key)) animate(true); onKeyDown?.(event); }}
    onBlur={event => { animate(false); onBlur?.(event); }}
    onKeyUp={event => { if ([' ', 'Enter'].includes(event.key)) animate(false, true); onKeyUp?.(event); }}>
    <span ref={surface} className="neo-button-face"><span ref={ripple} className="neo-button-ripple" aria-hidden="true" /><span className={loading ? 'neo-button-copy neo-hidden-copy' : 'neo-button-copy'}>{children}</span>{loading && <LoaderCircle className="neo-spin neo-button-loader" size={18} aria-hidden="true" />}</span>
  </button>;
}

export function DemoSection({ title, description, children, className = '' }: { title: string; description?: string; children: ReactNode; className?: string }) {
  return <section className={`neo-section ${className}`}><header className="neo-section-header"><h2>{title}</h2>{description && <p>{description}</p>}</header><div className="neo-section-body">{children}</div></section>;
}
