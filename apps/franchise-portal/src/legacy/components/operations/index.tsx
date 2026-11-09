import { useEffect, useId, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useModal } from '../../hooks/useModal'
import { Presence, usePresence, usePresenceBoundary } from '../../../ui/Presence'

type ActionDrawerProps = { title: string; open: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode; busy?: boolean; id?: string; descriptionId?: string; className?: string; onExited?: () => void }
type ActionSurfaceProps = ActionDrawerProps & { presentation: 'dialog' | 'drawer'; size?: 'regular' | 'wide' }
export function ActionDrawer(props: ActionDrawerProps) {
  return <ActionOverlay {...props} presentation="drawer" />
}
/** Focused tasks and general record reading use a centered dialog. */
export function ActionDialog(props: ActionDrawerProps & { size?: 'regular' | 'wide' }) {
  return <ActionOverlay {...props} presentation="dialog" />
}
function ActionOverlay(props: ActionSurfaceProps) {
  const boundary = usePresenceBoundary()
  if (boundary) return <ActionDrawerSurface {...props} />
  const drawer = props.presentation === 'drawer'
  return <Presence present={props.open} enterMs={drawer ? 360 : 320} exitMs={drawer ? 200 : 180} onExited={props.onExited}>{props.open && <ActionDrawerSurface {...props} />}</Presence>
}
function ActionDrawerSurface({ title, onClose, children, footer, busy = false, presentation, size = 'regular', id, descriptionId, className = '' }: ActionSurfaceProps) {
  const { phase, isPresent } = usePresence()
  const ref = useModal(onClose, true, !busy)
  const centered = presentation === 'dialog'
  const Surface = centered ? 'section' : 'aside'
  return createPortal(
    <div className={centered ? 'modal-backdrop action-dialog-backdrop' : 'drawer-backdrop'} data-hy-phase={phase} data-hy-overlay="backdrop" onClick={(event) => { if (isPresent && !busy && event.target === event.currentTarget) onClose() }}>
      <Surface id={id} ref={ref} tabIndex={-1} className={`action-drawer${centered ? ` action-dialog${size === 'wide' ? ' action-dialog-wide' : ''}` : ''} ${className}`} data-hy-phase={phase} data-hy-overlay={presentation} role="dialog" aria-modal="true" aria-label={title} aria-describedby={descriptionId} aria-busy={busy}>
        <header><h2>{title}</h2><button type="button" className="close" onClick={onClose} aria-label="关闭" disabled={busy} title={busy ? '正在保存，请稍候再关闭' : undefined}>×</button></header>
        <div className="action-drawer-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </Surface>
    </div>, (document.getElementById('legacy-portals') ?? document.body)
  )
}

export function ConfirmActionDialog({
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  danger = false,
  reasonRequired = false,
  error = '',
  pending = false,
  onConfirm,
  onClose,
}: {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  reasonRequired?: boolean
  error?: string
  pending?: boolean
  onConfirm: (reason: string) => void | Promise<void>
  onClose: () => void
}) {
  const { phase, isPresent } = usePresence()
  const [reason, setReason] = useState('')
  const [validation, setValidation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const busy = pending || submitting
  const ref = useModal(onClose, true, !busy)
  const reasonId = useId()
  const descriptionId = useId()
  const submit = async () => {
    if (busy) return
    if (reasonRequired && !reason.trim()) { setValidation('请填写操作原因后再确认'); return }
    setValidation(''); setSubmitting(true)
    try { await onConfirm(reason.trim()) }
    catch { setValidation('操作未完成，请检查输入后重试') }
    finally { setSubmitting(false) }
  }
  return createPortal(
    <div className="modal-backdrop confirmation-backdrop" data-hy-phase={phase} data-hy-overlay="backdrop" onClick={(event) => { if (isPresent && !busy && event.target === event.currentTarget) onClose() }}>
      <section ref={ref} tabIndex={-1} className="confirm-dialog" data-hy-phase={phase} data-hy-overlay="dialog" role="dialog" aria-modal="true" aria-label={title} aria-describedby={descriptionId} aria-busy={busy}>
        <h2>{title}</h2>
        <p id={descriptionId}>{message}</p>
        {reasonRequired && (
          <label htmlFor={reasonId}>
            操作原因 <span className="required-mark">*</span>
            <textarea aria-label="操作原因" id={reasonId} value={reason} onChange={(event) => { setReason(event.target.value); setValidation('') }} placeholder="请说明原因，方便后续追溯" disabled={busy} aria-invalid={Boolean(validation)} />
          </label>
        )}
        {(error || validation) && <p className="action-error" role="alert">{error || validation}</p>}
        <div>
          <button type="button" className="secondary" disabled={busy} onClick={onClose}>{cancelLabel}</button>
          <button
            type="button"
            disabled={busy}
            className={danger ? 'danger confirm-danger' : 'primary'}
            onClick={() => void submit()}
          >
            {busy ? '处理中…' : confirmLabel}
          </button>
        </div>
      </section>
    </div>, (document.getElementById('legacy-portals') ?? document.body)
  )
}

export function EntityHistory({ events }: { events: { id: number; action: string; actor?: string | null; reason?: string; created_at: string }[] }) {
  if (!events.length) return <p className="collection-empty">暂无操作历史</p>
  return (
    <ol className="entity-history">
      {events.map((item) => (
        <li key={item.id}>
          <strong>{item.action}</strong>
          <span>{item.actor || '系统'} · {new Date(item.created_at).toLocaleString('zh-CN')}</span>
          {item.reason ? <em>{item.reason}</em> : null}
        </li>
      ))}
    </ol>
  )
}

export type StatusAction = {
  label: string
  onClick: () => void
  disabled?: boolean
  reason?: string
  danger?: boolean
}

export function StatusActions({ actions, busy = false }: { actions: StatusAction[]; busy?: boolean }) {
  if (!actions.length) return null
  return (
    <div className="status-actions">
      {actions.map((item) => (
        <span className="status-option" key={item.label}>
        <button
          type="button"
          disabled={item.disabled || busy}
          title={busy ? '正在保存，请稍候' : item.disabled ? item.reason : undefined}
          className={item.danger ? 'danger' : undefined}
          onClick={item.onClick}
        >
          {item.label}
        </button>
        {item.disabled && item.reason && <small>{item.reason}</small>}
        </span>
      ))}
    </div>
  )
}

export function FeedbackBanner({ message, error }: { message?: string; error?: string }) {
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => { setDismissed(false) }, [message, error])
  if (!dismissed && (error || message)) return createPortal(<div className={`feedback-banner ${error ? 'is-error' : 'is-success'}`} role={error ? 'alert' : 'status'}><span aria-hidden="true">{error ? '!' : '✓'}</span>{error || message}<button type="button" aria-label="关闭提示" onClick={() => setDismissed(true)}>×</button></div>, (document.getElementById('legacy-portals') ?? document.body))
  return null
}
