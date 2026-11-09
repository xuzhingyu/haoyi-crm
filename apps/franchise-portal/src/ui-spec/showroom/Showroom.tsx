import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, Bell, Check, ChevronDown, ChevronRight, Copy, Heart, Layers, MousePointer2, Navigation, PanelsTopLeft, Plus, RefreshCw, RotateCcw, Save, Settings2, SlidersHorizontal, Sparkles, Trash2, TrendingUp, X } from 'lucide-react';
import { MotionContext, SoftButton, DemoSection, useMotion, type MotionLevel } from './kit';
import { FanStack, HoldConfirmButton, MorphSheet, ShowroomDialog as Dialog, ShowroomPopover } from './advanced';
import { FormsDemo, NavigationDemo } from './forms-navigation';
import { ActivityRings, AnimatedNumber, ChartsDemo, FeedbackDemo } from './charts-feedback';
import sampleOne from './assets/sample-1.jpg';
import sampleTwo from './assets/sample-2.jpg';
import credits from './assets/credits.json';
import './showroom.css';
import './overlay-showcase.css';
import { ShowroomNav } from './showroom-nav';

const sections = [
  { id: 'buttons', label: '按钮与触感', icon: MousePointer2, description: '柔软的按压，清楚的回应。' },
  { id: 'cards', label: '卡片与资料', icon: Layers, description: '从一张卡片，到一叠可以展开的资料。' },
  { id: 'forms', label: '表单与选择', icon: SlidersHorizontal, description: '输入、选择、校验和保存，始终有据可循。' },
  { id: 'navigation', label: '导航与列表', icon: Navigation, description: '在清楚的结构里，找到下一步。' },
  { id: 'overlays', label: '弹层与手势', icon: PanelsTopLeft, description: '轻轻拉起，停在刚刚好的位置。' },
  { id: 'charts', label: '图表与数字', icon: TrendingUp, description: '让数据的变化看得见，也读得懂。' },
  { id: 'feedback', label: '加载与反馈', icon: RefreshCw, description: '等待、完成或遇到问题，都有明确的反馈。' },
  { id: 'experience', label: '组合体验', icon: Sparkles, description: '把组件放进一段完整的操作里。' },
] as const;
type SectionId = typeof sections[number]['id'];
type Notify = { notify: (message: string) => void };
const pictures = [
  { id: 'model', title: '建筑模型', subtitle: 'CC0 / Robert-brook', image: sampleOne },
  { id: 'thread', title: '色彩与材质', subtitle: 'CC0 / Jebulon', image: sampleTwo },
];
const contentCards = [
  { id: 'research', title: '服务网络研究', subtitle: '研究资料示例' },
  { id: 'visit', title: '门店走访记录', subtitle: '业务资料示例' },
  { id: 'training', title: '技术培训安排', subtitle: '协作资料示例' },
];

export function Showroom() {
  const [section, setSection] = useState<SectionId>(() => { const value = new URLSearchParams(location.search).get('section'); return sections.some(s => s.id === value) ? value as SectionId : 'buttons'; });
  const [motion, setMotion] = useState<MotionLevel>('rich');
  const [palette, setPalette] = useState<'mist' | 'energy'>('energy');
  const [epoch, setEpoch] = useState(0);
  const [toast, setToast] = useState('');
  const main = useRef<HTMLElement>(null);
  useEffect(() => { document.documentElement.dataset.neoShowroom = 'true'; document.title = '浩宜新能源 · 新拟态组件展厅'; return () => { delete document.documentElement.dataset.neoShowroom; delete document.documentElement.dataset.neoMotion; delete document.documentElement.dataset.neoPalette; }; }, []);
  useEffect(() => { document.documentElement.dataset.neoMotion = motion; }, [motion]);
  useEffect(() => { document.documentElement.dataset.neoPalette = palette; }, [palette]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 5000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { const pop = () => { const id = new URLSearchParams(location.search).get('section'); if (sections.some(s => s.id === id)) setSection(id as SectionId); }; window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop); }, []);
  const current = sections.find(item => item.id === section)!;
  function navigate(id: SectionId) { setSection(id); setToast(''); const url = new URL(location.href); url.searchParams.set('section', id); history.replaceState(null, '', url); main.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }
  const shared = { notify: setToast };
  const pages: Record<SectionId, ReactNode> = {
    buttons: <ButtonsDemo {...shared} />, cards: <CardsDemo {...shared} />, forms: <FormsDemo {...shared} />, navigation: <NavigationDemo {...shared} />,
    overlays: <OverlaysDemo {...shared} />, charts: <ChartsDemo {...shared} />, feedback: <FeedbackDemo {...shared} />, experience: <ExperienceDemo {...shared} />,
  };
  return <MotionContext.Provider value={motion}><div className="hy-spec neo-showroom app-shell">
    <a href="#neo-content" className="neo-skip">跳到组件预览</a>
    <aside className="neo-sidebar"><div className="neo-brand"><span className="neo-brand-symbol" aria-hidden="true">H</span><div><strong>浩宜新能源</strong><small>组件展厅</small></div></div>
      <ShowroomNav items={sections} value={section} onChange={navigate} />
      <div className="neo-sidebar-foot"><p>柔软新拟态</p><a href="./ui-spec.html?legacy=1">查看原业务样板</a></div>
    </aside>
    <div className="neo-workspace"><header className="neo-topbar"><div className="neo-topbar-title"><span>组件展厅</span><ChevronRight size={15} aria-hidden="true" /><span>{current.label}</span></div><div className="neo-settings"><PalettePicker value={palette} onChange={setPalette} /><MotionPicker value={motion} onChange={setMotion} /><SoftButton iconOnly aria-label="重置当前示例" onClick={() => { setEpoch(value => value + 1); setToast('当前示例已重置'); }}><RotateCcw size={18} aria-hidden="true" /></SoftButton></div></header>
      <main ref={main} id="neo-content" className="neo-main" tabIndex={-1}><div className="neo-page-heading"><div><h1>{current.label}</h1><p>{current.description}</p></div><span className="neo-local-note">本地示例</span></div><div key={`${section}-${epoch}`} className="neo-page-content">{pages[section]}</div></main>
    </div>
    <div aria-live="polite" aria-atomic="true">{toast && <div className="neo-toast"><Check size={18} aria-hidden="true" /><span>{toast}</span><button className="neo-toast-close" aria-label="关闭提示" onClick={() => setToast('')}><X size={17} aria-hidden="true" /></button></div>}</div>
  </div></MotionContext.Provider>;
}

function MotionPicker({ value, onChange }: { value: MotionLevel; onChange: (value: MotionLevel) => void }) {
  const { reduced } = useMotion();
  return <div className="neo-motion-control"><span>动效</span><div className="neo-mode-track" style={{ '--neo-selection': ['rich', 'gentle', 'off'].indexOf(value), '--neo-options': 3 } as CSSProperties} role="group" aria-label="动效强度">{([['rich', '丰富'], ['gentle', '轻柔'], ['off', '关闭']] as const).map(([id, text]) => <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>{text}</button>)}</div>{reduced && value !== 'off' && <span>遵循系统设置</span>}</div>;
}

function PalettePicker({ value, onChange }: { value: 'mist' | 'energy'; onChange: (value: 'mist' | 'energy') => void }) {
  return <div className="neo-motion-control"><span>配色</span><div className="neo-mode-track" style={{ '--neo-selection': value === 'energy' ? 1 : 0, '--neo-options': 2 } as CSSProperties} role="group" aria-label="展厅配色">{([['mist', '柔雾'], ['energy', '彩色']] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>{label}</button>)}</div></div>;
}

function ButtonsDemo({ notify }: Notify) {
  const [presses, setPresses] = useState(0);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [liked, setLiked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  function save() { if (busy) return; setBusy(true); setSaved(false); timer.current = setTimeout(() => { setBusy(false); setSaved(true); notify('示例已保存'); }, 1300); }
  const states = [{ label: '默认', cls: '', text: '保存' }, { label: '悬停', cls: 'neo-forced-hover', text: '保存' }, { label: '聚焦', cls: 'neo-forced-focus', text: '保存' }, { label: '按下', cls: 'neo-forced-pressed', text: '保存' }, { label: '禁用', cls: '', text: '保存', disabled: true }, { label: '加载', cls: '', text: '保存', loading: true }, { label: '错误', cls: '', text: '重试', danger: true }, { label: '成功', cls: 'neo-success', text: '已保存' }];
  return <><div className="neo-demo-grid"><DemoSection title="Press Jelly" description="按下，再松开"><div className="neo-pad neo-playground neo-tone-blue"><SoftButton className="neo-button-large" variant="primary" onClick={() => setPresses(n => n + 1)}><Plus size={21} aria-hidden="true" />按一下试试</SoftButton><p className="neo-demo-caption" aria-live="polite">{presses ? `已回应 ${presses} 次` : '柔软压缩，轻轻回弹'}</p></div></DemoSection><DemoSection title="Hold to Confirm" description="长按 1.2 秒完成"><div className="neo-pad neo-playground neo-tone-green"><HoldConfirmButton label="长按确认" onConfirm={() => notify('长按确认完成，只操作本地示例')} /><p className="neo-demo-caption">中途松开，即可取消</p></div></DemoSection></div>
    <DemoSection title="每一种操作，都有分寸"><div className="neo-button-row"><SoftButton variant="primary" onClick={save} loading={busy}>{saved ? <Check size={17} aria-hidden="true" /> : <Save size={17} aria-hidden="true" />}{saved ? '已保存' : '保存更改'}</SoftButton><SoftButton onClick={() => notify('次要操作已响应')}>次要按钮</SoftButton><SoftButton variant="quiet" onClick={() => notify('文字操作已响应')}>文字按钮<ArrowRight size={17} aria-hidden="true" /></SoftButton><SoftButton variant="danger" onClick={() => notify('危险操作应进入确认层，可在“弹层与手势”中体验')}><Trash2 size={17} aria-hidden="true" />危险按钮</SoftButton><SoftButton iconOnly aria-label={liked ? '取消收藏' : '收藏'} aria-pressed={liked} onClick={() => setLiked(v => !v)}><Heart size={19} fill={liked ? 'currentColor' : 'none'} aria-hidden="true" /></SoftButton><SoftButton iconOnly aria-label="复制组件名称" onClick={() => { if (!navigator.clipboard) { notify('浏览器未允许复制'); return; } void navigator.clipboard.writeText('Press Jelly').then(() => notify('已复制组件名称')).catch(() => notify('浏览器未允许复制')); }}><Copy size={18} aria-hidden="true" /></SoftButton></div></DemoSection>
    <DemoSection title="八种状态" description="静态状态标本，可与上方真实操作对照"><div className="neo-state-grid">{states.map(state => <div key={state.label} className="neo-state-item"><SoftButton className={state.cls} disabled={state.disabled} loading={state.loading} variant={state.danger ? 'danger' : 'secondary'} onClick={() => notify(`${state.label}示例已响应`)}>{state.text}</SoftButton><span>{state.label}</span></div>)}</div></DemoSection>
    <DemoSection title="四种表面"><div className="neo-materials"><div className="neo-material">平面</div><div className="neo-material raised">凸起</div><div className="neo-material inset">内凹</div><div className="neo-material floating">悬浮</div></div></DemoSection></>;
}

function CardsDemo({ notify }: Notify) {
  const [selected, setSelected] = useState(false); const [expanded, setExpanded] = useState(false); const [done, setDone] = useState(false);
  const [picture, setPicture] = useState<(typeof pictures)[number] | null>(null);
  return <><DemoSection title="卡片，装下不同的内容"><div className="neo-card-showcase">
    <article className="neo-pad neo-energy-stat neo-composed-card"><header data-slot="card-header"><h3>本期签约</h3><span className="neo-card-badge">示例</span></header><div data-slot="card-content"><div className="neo-card-value"><AnimatedNumber value={12} /><small> 家</small></div><p className="neo-card-note">目标 16 家</p></div><footer data-slot="card-footer"><div className="neo-energy-meter" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <span key={i} data-filled={i < 12} style={{ '--neo-item': i } as CSSProperties} />)}</div></footer></article>
    <button type="button" className="neo-card-button" aria-pressed={selected} onClick={() => setSelected(v => !v)}><span className="neo-pad neo-card-face neo-composed-card"><span data-slot="card-header"><span className="neo-card-symbol"><Layers size={20} aria-hidden="true" /></span><span className="neo-card-select-mark">{selected ? <Check className="neo-choice-check" size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}</span></span><span data-slot="card-content"><span className="neo-card-title">{selected ? '已选择此卡片' : '可选择的资料卡'}</span><span className="neo-card-note">服务网络研究</span></span><span data-slot="card-footer"><span>{selected ? '点击取消选择' : '点击选择资料'}</span><ArrowRight size={18} aria-hidden="true" /></span></span></button>
    <article className="neo-pad neo-composed-card neo-task-card" data-complete={done}><header data-slot="card-header"><span className="neo-card-symbol neo-card-symbol-green"><Check size={20} aria-hidden="true" /></span><span className="neo-card-badge">{done ? '已完成' : '待处理'}</span></header><div data-slot="card-content"><h3>门店资料核对</h3><p className="neo-card-note">{done ? '这条示例待办已完成' : '一条可以完成的示例待办'}</p></div><footer data-slot="card-footer"><span>{done ? '核对完成' : '资料核对'}</span><SoftButton iconOnly variant="quiet" aria-label={done ? '恢复待办' : '完成待办'} onClick={() => setDone(v => !v)}>{done ? <RotateCcw size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}</SoftButton></footer></article>
    </div></DemoSection>
    <DemoSection title="Fan Stack" description="悬停或聚焦摊开，点击查看"><div className="neo-demo-grid"><div className="neo-pad neo-tone-blue"><FanStack items={pictures} onSelect={item => setPicture(pictures.find(p => p.id === item.id) ?? null)} /></div><div className="neo-pad neo-tone-cyan"><FanStack items={contentCards} onSelect={item => notify(`已选中：${item.title}`)} /></div></div></DemoSection>
    <DemoSection title="折叠与展开"><div className="neo-pad"><button className="neo-collapsible" aria-expanded={expanded} aria-controls="neo-card-detail" onClick={() => setExpanded(v => !v)}><span>资料摘要</span><ChevronDown size={20} style={{ transform: expanded ? 'rotate(180deg)' : undefined }} aria-hidden="true" /></button>{expanded && <div id="neo-card-detail" className="neo-expanded-content">把长内容留在需要的时候。展开后可以查看说明、来源与下一步操作，收起时仍保留清楚的标题。</div>}</div></DemoSection>
    <DemoSection title="图片与附件" description="公开授权示例图片，选择的文件仅在当前浏览器预览"><PictureGallery onSelect={setPicture} /><ImageUpload /></DemoSection><PictureDialog picture={picture} onClose={() => setPicture(null)} /></>;
}

function PictureGallery({ onSelect }: { onSelect: (picture: typeof pictures[number]) => void }) { return <div className="neo-gallery">{pictures.map(picture => <button className="neo-image-tile" key={picture.id} onClick={() => onSelect(picture)}><img src={picture.image} alt={picture.title} /><span>{picture.title}</span></button>)}</div>; }
function PictureDialog({ picture, onClose }: { picture: typeof pictures[number] | null; onClose: () => void }) {
  const index = pictures.findIndex(p => p.id === picture?.id); const credit = credits[index];
  return <Dialog open={Boolean(picture)} title={picture?.title ?? '图片预览'} wide onClose={onClose}>{picture && <><img className="neo-image-preview" src={picture.image} alt={picture.title} />{credit && <p className="neo-credit">{credit.author} · {credit.license} · <a href={credit.source} target="_blank" rel="noreferrer">图片来源</a></p>}</>}</Dialog>;
}
function ImageUpload() {
  const [files, setFiles] = useState<{ id: string; name: string; url: string }[]>([]); const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(null); const urls = useRef(new Set<string>()); const id = useId();
  useEffect(() => { const owned = urls.current; return () => owned.forEach(url => URL.revokeObjectURL(url)); }, []);
  return <div className="neo-upload"><label htmlFor={id}>选择图片，体验附件预览</label><input id={id} type="file" accept="image/jpeg,image/png,image/webp" multiple aria-describedby={`${id}-help`} onChange={event => {
    const chosen = Array.from(event.target.files ?? []); const valid = chosen.filter(file => ['image/jpeg','image/png','image/webp'].includes(file.type) && file.size <= 10 * 1024 * 1024);
    setError(valid.length !== chosen.length ? '仅支持不超过 10 MB 的 JPG、PNG、WebP 图片。' : files.length + valid.length > 6 ? '本地示例最多保留 6 张图片。' : '');
    const added = valid.slice(0, Math.max(0, 6 - files.length)).map(file => { const url = URL.createObjectURL(file); urls.current.add(url); return { id: url, name: file.name, url }; }); setFiles(old => [...old, ...added]); event.target.value = '';
  }} /><p id={`${id}-help`} className="neo-local-note">JPG / PNG / WebP，每张不超过 10 MB，最多 6 张。不上传服务器。</p>{error && <p className="neo-error" role="alert">{error}</p>}<ul className="neo-upload-list">{files.map(file => <li key={file.id}><button className="neo-image-tile" aria-label={`预览 ${file.name}`} onClick={() => setPreview(file)}><img src={file.url} alt="" onError={() => setError('其中一张图片无法解码，请移除后重新选择。')} /></button><span>{file.name}</span><SoftButton iconOnly aria-label={`移除 ${file.name}`} onClick={() => { URL.revokeObjectURL(file.url); urls.current.delete(file.url); setFiles(old => old.filter(f => f.id !== file.id)); }}><X size={17} aria-hidden="true" /></SoftButton></li>)}</ul><Dialog open={Boolean(preview)} title={preview?.name ?? '附件预览'} wide onClose={() => setPreview(null)}>{preview && <img src={preview.url} className="neo-image-preview" alt={preview.name} />}</Dialog></div>;
}

function OverlaysDemo({ notify }: Notify) {
  const [modal, setModal] = useState<'confirm' | 'form' | 'drawer' | null>(null); const [sheet, setSheet] = useState(false); const [tip, setTip] = useState(false); const [name, setName] = useState('');
  return <><DemoSection title="Morph Sheet" description="拖动手柄，或用按钮停在 40%、72%、94%"><div className="neo-pad neo-playground neo-tone-cyan"><div className="neo-material inset" style={{ width: 128, height: 80 }}><PanelsTopLeft size={30} strokeWidth={1.5} aria-hidden="true" /></div><SoftButton variant="primary" onClick={() => setSheet(true)}>拉起底部面板<ArrowRight size={17} aria-hidden="true" /></SoftButton></div></DemoSection>
    <DemoSection title="对话框与详情"><div className="neo-button-row"><SoftButton onClick={() => setModal('confirm')}>确认对话框</SoftButton><SoftButton onClick={() => setModal('form')}>表单弹窗</SoftButton><SoftButton onClick={() => setModal('drawer')}>详情抽屉</SoftButton><SoftButton onClick={() => notify('操作已完成，这是一条可关闭的提示')}>显示 Toast</SoftButton></div></DemoSection>
    <DemoSection title="轻量提示"><div className="neo-button-row"><span className="neo-tip-anchor" onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)} onFocus={() => setTip(true)} onBlur={() => setTip(false)} onKeyDown={event => { if (event.key === 'Escape') setTip(false); }}><SoftButton iconOnly aria-label="通知设置" aria-describedby={tip ? 'neo-tooltip' : undefined}><Bell size={20} aria-hidden="true" /></SoftButton>{tip && <span role="tooltip" id="neo-tooltip" className="neo-tooltip">管理消息通知</span>}</span><ShowroomPopover label={<><Settings2 size={18} aria-hidden="true" />快速设置</>} title="资料排序" footer={close => <SoftButton onClick={() => { close(); notify('已切换为按名称排序'); }}>切换为名称排序</SoftButton>}><p>资料按最近更新排序。</p></ShowroomPopover></div></DemoSection>
    <Dialog open={modal === 'confirm'} title="归档这条示例资料？" onClose={() => setModal(null)} footer={<><SoftButton onClick={() => setModal(null)}>取消</SoftButton><SoftButton variant="danger" onClick={() => { setModal(null); notify('示例资料已归档'); }}>确认归档</SoftButton></>}><p>归档后将从当前示例列表隐藏。重置示例即可恢复。</p></Dialog>
    <Dialog open={modal === 'form'} title="编辑资料" dirty={Boolean(name)} onClose={() => { setName(''); setModal(null); }} footer={requestClose => <><SoftButton onClick={requestClose}>取消</SoftButton><SoftButton variant="primary" onClick={() => { if (!name.trim()) return; setName(''); setModal(null); notify('示例资料已保存'); }} disabled={!name.trim()}>保存</SoftButton></>}><div className="neo-inline-form"><label>资料名称<input value={name} onChange={e => setName(e.target.value)} placeholder="填写资料名称" /></label><p>修改后尝试关闭，可以体验未保存提醒。</p></div></Dialog>
    <Dialog open={modal === 'drawer'} title="资料详情" kind="drawer" onClose={() => setModal(null)}><dl><div className="neo-summary-row"><dt>名称</dt><dd>服务网络研究</dd></div><div className="neo-summary-row"><dt>状态</dt><dd>待核对</dd></div><div className="neo-summary-row"><dt>来源</dt><dd>本地示例</dd></div></dl><PictureGallery onSelect={() => notify('在“卡片与资料”中查看大图')} /></Dialog>
    <MorphSheet open={sheet} onClose={() => setSheet(false)} title="筛选资料"><div className="neo-inline-form"><p>拖动顶部手柄改变高度，正文区域保持独立滚动。</p>{['全部资料','研究报告','走访记录','培训材料'].map((label,index) => <label key={label} className="neo-sheet-choice"><input type="checkbox" defaultChecked={!index} /><span>{label}</span></label>)}<SoftButton variant="primary" onClick={() => { setSheet(false); notify('示例筛选已应用'); }}>应用筛选</SoftButton>{Array.from({ length: 8 }, (_, i) => <p className="neo-card-note" key={i}>资料说明 {i + 1}：面板可以半停，长内容在面板内部滚动。</p>)}</div></MorphSheet></>;
}

function ExperienceDemo({ notify }: Notify) {
  const [name, setName] = useState('青禾汽车服务中心'); const [draft, setDraft] = useState(name); const [edit, setEdit] = useState(false); const [archive, setArchive] = useState(false); const [archived, setArchived] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [picture, setPicture] = useState<typeof pictures[number] | null>(null); const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined); const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  function save() { if (busy) return; if (!draft.trim()) { setError('请填写客户名称'); input.current?.focus(); return; } setBusy(true); timer.current = setTimeout(() => { setName(draft.trim()); setEdit(false); setBusy(false); notify('客户名称已保存到本地示例'); }, 1200); }
  return <DemoSection title="客户详情体验" description="全部内容为示例，操作不会影响业务数据"><div className="neo-combo-preview"><div className="neo-pad neo-combo-detail"><div><h2>{name}</h2><p className="neo-card-note">南京市 · 本地示例客户</p></div><dl><div className="neo-summary-row"><dt>状态</dt><dd>{archived ? '已归档' : '合作沟通中'}</dd></div><div className="neo-summary-row"><dt>负责人</dt><dd>示例运营</dd></div><div className="neo-summary-row"><dt>下一步</dt><dd>核对服务能力</dd></div></dl><div className="neo-button-row"><SoftButton variant="primary" disabled={archived} onClick={() => { setDraft(name); setError(''); setEdit(true); }}><Save size={17} aria-hidden="true" />编辑客户</SoftButton><SoftButton variant="danger" disabled={archived} onClick={() => setArchive(true)}>归档资料</SoftButton></div><ActivityRings items={[{ label: '资料完整度 · 示例', value: 3, max: 4 }]} /></div><div><DemoSection title="图片资料"><FanStack items={pictures} onSelect={item => setPicture(pictures.find(p => p.id === item.id) ?? null)} /><ImageUpload /></DemoSection></div></div>
    <Dialog open={edit} title="编辑示例客户" busy={busy} dirty={draft !== name} onClose={() => setEdit(false)} footer={requestClose => <><SoftButton disabled={busy} onClick={requestClose}>取消</SoftButton><SoftButton variant="primary" loading={busy} onClick={save}>保存更改</SoftButton></>}><form className="neo-inline-form" onSubmit={event => { event.preventDefault(); save(); }}><label>客户名称<input ref={input} value={draft} onChange={event => { setDraft(event.target.value); setError(''); }} required aria-invalid={Boolean(error)} aria-describedby={error ? 'neo-customer-error' : undefined} /></label>{error && <p id="neo-customer-error" role="alert" className="neo-error">{error}</p>}</form></Dialog>
    <Dialog open={archive} title="归档示例客户？" onClose={() => setArchive(false)}><p>归档后不可编辑这条示例客户。点击页面顶部“重置当前示例”即可恢复。</p><div style={{ marginTop: 24 }}><HoldConfirmButton label="长按归档" onConfirm={() => { setArchived(true); setArchive(false); notify('示例客户已归档'); }} /></div></Dialog><PictureDialog picture={picture} onClose={() => setPicture(null)} /></DemoSection>;
}
