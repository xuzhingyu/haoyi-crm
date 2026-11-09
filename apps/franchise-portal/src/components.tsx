import { ArrowUpRight, Check, CircleAlert, Inbox, LoaderCircle, X } from "lucide-react";
import { useLayoutEffect, type ReactNode } from "react";
import { usePresence } from './ui/Presence';
import { useOverlay } from './ui/useOverlay';
import { statusLabel } from "./workspace";

export function Loading({ text = "正在读取…" }: { text?: string }) { return <div className="empty-state" role="status"><LoaderCircle className="spin" size={25} /><p>{text}</p></div>; }
export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) { return <div className="empty-state"><Inbox size={28} /><h3>{title}</h3>{text && <p>{text}</p>}{action}</div>; }
export function ErrorState({ error, retry }: { error: string; retry?: () => void }) { return <div className="error-state" role="alert"><CircleAlert size={19} /><div><strong>暂时无法完成</strong><p>{error}</p></div>{retry && <button className="button secondary" onClick={retry}>重试</button>}</div>; }
export function Status({ value }: { value: string }) { return <span className={`status status-${value}`}><i />{statusLabel(value)}</span>; }
export function PageHeading({ title, text, action }: { title: string; text?: string; action?: ReactNode }) { return <div className="page-heading"><div><h1>{title}</h1>{text && <p>{text}</p>}</div>{action}</div>; }
export function SectionHeading({ title, children }: { title: string; children?: ReactNode }) { return <div className="section-heading"><h2>{title}</h2>{children}</div>; }
export function Modal({ title, children, onClose, wide = false, busy = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean; busy?: boolean }) {
  const { phase, isPresent } = usePresence();
  const requestClose = () => { if (!busy && isPresent) onClose(); };
  const dialog = useOverlay<HTMLDialogElement>(requestClose, true, !busy);
  useLayoutEffect(() => { const element = dialog.current; if (element && !element.open) element.showModal(); return () => element?.close(); }, [dialog]);
  return <dialog ref={dialog} tabIndex={-1} className={`modal ${wide ? "modal-wide" : ""}`} data-hy-phase={phase} data-hy-overlay="dialog" aria-label={title} aria-busy={busy} onCancel={(event) => { event.preventDefault(); requestClose(); }} onClick={(event) => { if (event.target === dialog.current) requestClose(); }}><div className="modal-inner"><header><h2>{title}</h2><button type="button" className="icon-button" onClick={requestClose} disabled={busy} title={busy ? "正在保存，请稍候再关闭" : undefined} aria-label="关闭弹窗"><X size={21} /></button></header>{children}</div></dialog>;
}
export function Confirm({ title, children, busy, onClose, onConfirm }: { title: string; children: ReactNode; busy?: boolean; onClose: () => void; onConfirm: () => void }) { return <Modal title={title} onClose={onClose} busy={busy}><div className="modal-content">{children}</div><footer><button className="button secondary" onClick={onClose} disabled={busy}>取消</button><button className="button primary" onClick={onConfirm} disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}确认</button></footer></Modal>; }
export function MoreButton({ cursor, busy, onClick }: { cursor?: string | null; busy?: boolean; onClick: () => void }) { return cursor ? <div className="load-more"><button className="button secondary" disabled={busy} onClick={onClick}>{busy ? "加载中…" : "加载更多"}</button></div> : null; }
export function ExternalLink({ href, children }: { href?: string; children: ReactNode }) { return href ? <a href={href} className="external-link" target="_blank" rel="noreferrer">{children}<ArrowUpRight size={15} /></a> : <span>{children}</span>; }
