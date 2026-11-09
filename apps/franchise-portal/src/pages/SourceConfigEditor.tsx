import { useCallback, useState, type FormEvent } from 'react';
import type { SourceDraft, SourceVerification } from '../api/types';
import { Confirm, ErrorState, ExternalLink, Loading, Modal } from '../components';
import { dateTime, errorText, safeUrl, sourceNatureLabel, topics, useLoad, useWorkspace } from '../workspace';
import { Presence } from '../ui/Presence';

const defaultSource: SourceDraft = { name: '', url: '', kind: 'rss', topic: '新能源售后', interval_minutes: 360, enabled: true, item_selector: '', link_selector: '', title_selector: '', date_selector: '' };

export function SourceConfigEditor({ id, onClose, onSaved }: { id?: string; onClose: () => void; onSaved: () => void }) {
  const { api } = useWorkspace();
  const state = useLoad(useCallback(() => id ? api.getSourceConfig(id) : Promise.resolve(defaultSource), [api, id]));
  if (state.error || !state.data) return <Modal title={id ? '编辑信源' : '新增信源'} onClose={onClose}>{state.error ? <ErrorState error={state.error} retry={state.reload} /> : <Loading />}</Modal>;
  return <SourceConfigForm id={id} initial={state.data} onClose={onClose} onSaved={onSaved} />;
}

function SourceConfigForm({ id, initial, onClose, onSaved }: { id?: string; initial: SourceDraft; onClose: () => void; onSaved: () => void }) {
  const { api, notify } = useWorkspace(); const [draft, setDraft] = useState<SourceDraft>(initial); const [busy, setBusy] = useState<'validate' | 'save' | null>(null); const [error, setError] = useState(''); const [verification, setVerification] = useState<SourceVerification | null>(null); const [discard, setDiscard] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  function change<K extends keyof SourceDraft>(key: K, value: SourceDraft[K]) { setDraft(current => ({ ...current, [key]: value })); setVerification(null); setError(''); }
  function close() { if (dirty) setDiscard(true); else onClose(); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const validate = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'validate'; setBusy(validate ? 'validate' : 'save'); setError('');
    const input: SourceDraft = { name: draft.name.trim(), url: draft.url.trim(), kind: draft.kind, topic: draft.topic, interval_minutes: draft.interval_minutes, enabled: draft.enabled, item_selector: draft.item_selector, link_selector: draft.link_selector, title_selector: draft.title_selector, date_selector: draft.date_selector, ...(draft.version ? { version: draft.version } : {}) };
    try { if (validate) setVerification(await api.validateSourceConfig(input)); else { if (id) await api.updateSourceConfig(id, input); else await api.createSourceConfig(input); notify(id ? '信源配置已更新' : '信源已添加'); onSaved(); } }
    catch (reason) { setError(errorText(reason)); } finally { setBusy(null); }
  }
  return <><Modal title={id ? '编辑信源' : '新增信源'} onClose={close} busy={!!busy}><form className="source-config-editor" onSubmit={event => void submit(event)}><div className="form-body source-config-form">
    <label>信源名称<input name="source_name" value={draft.name} onChange={event => change('name', event.target.value)} required maxLength={200} /></label>
    <div className="form-two"><label>采集方式<select value={draft.kind} onChange={event => change('kind', event.target.value as SourceDraft['kind'])}><option value="rss">RSS / Atom 订阅</option><option value="web_list">网页列表</option></select></label><label>情报分类<select value={draft.topic} onChange={event => change('topic', event.target.value)}>{Object.entries(topics).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
    <label>{draft.kind === 'rss' ? '订阅地址' : '列表页地址'}<input type="url" name="source_url" value={draft.url} onChange={event => change('url', event.target.value)} required maxLength={2000} placeholder="https://" aria-describedby="source-url-hint" /></label><small id="source-url-hint" className="muted">仅支持可公开访问的 HTTPS / HTTP 地址。</small>
    <div className="form-two"><label>采集间隔（分钟）<input type="number" value={draft.interval_minutes} onChange={event => change('interval_minutes', Number(event.target.value))} required min={30} max={1440} step={1} /></label><label className="check-label source-enabled"><input type="checkbox" checked={draft.enabled} onChange={event => change('enabled', event.target.checked)} />启用定时采集</label></div>
    {draft.kind === 'web_list' && <fieldset className="source-selector-fields"><legend>列表解析规则</legend><div className="form-two"><label>条目选择器<input value={draft.item_selector} onChange={event => change('item_selector', event.target.value)} placeholder="例如：article" required /></label><label>链接选择器<input value={draft.link_selector} onChange={event => change('link_selector', event.target.value)} placeholder="例如：a" /></label><label>标题选择器<input value={draft.title_selector} onChange={event => change('title_selector', event.target.value)} placeholder="留空使用链接文字" /></label><label>日期选择器<input value={draft.date_selector} onChange={event => change('date_selector', event.target.value)} placeholder="可选，例如：time" /></label></div></fieldset>}
    {error && <ErrorState error={error} />}
    {verification && <section className="source-validation" aria-live="polite"><h3>采集验证通过 · {verification.count} 条</h3><p>{sourceNatureLabel(verification.nature)} · {dateTime(verification.checked_at, true)}</p><ol>{verification.items.slice(0, 5).map((item, index) => <li key={`${item.url}-${index}`}><ExternalLink href={safeUrl(item.url)}>{item.title}</ExternalLink>{item.published_at && <small>{dateTime(item.published_at)}</small>}</li>)}</ol></section>}
    </div><footer><button type="button" className="button secondary" onClick={close} disabled={!!busy}>取消</button><button type="submit" value="validate" className="button secondary" disabled={!!busy}>{busy === 'validate' ? '验证中…' : '测试采集'}</button><button type="submit" value="save" className="button primary" disabled={!!busy}>{busy === 'save' ? '验证并保存中…' : '验证并保存'}</button></footer></form></Modal><Presence present={discard}>{discard && <Confirm title="放弃未保存的信源配置？" onClose={() => setDiscard(false)} onConfirm={onClose}><p>关闭后，本次编辑不会保存。</p></Confirm>}</Presence></>;
}
