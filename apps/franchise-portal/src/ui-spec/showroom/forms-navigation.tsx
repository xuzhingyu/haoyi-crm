import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, Building2, Check, ChevronLeft, ChevronRight, Eye, EyeOff, RotateCcw, Search, Send, SlidersHorizontal } from 'lucide-react';
import { ActionMenu, Field } from '../components';
import { Checkbox, RadioGroup, SegmentedControl, Select, Switch } from '../controls';
import { DemoSection, SoftButton, useMotion } from './kit';
import './forms-navigation.css';

type DemoProps = { notify: (message: string) => void };
type FormErrors = { name?: string; email?: string };

function FieldGroup({ children, className = 'neo-form-grid' }: { children: ReactNode; className?: string }) {
  return <div data-slot="field-group" className={className}>{children}</div>;
}

export function FormsDemo({ notify }: DemoProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('haoyi-demo');
  const [showPassword, setShowPassword] = useState(false);
  const [city, setCity] = useState('nanjing');
  const [amount, setAmount] = useState('12800');
  const [count, setCount] = useState('4');
  const [date, setDate] = useState('2026-11-16');
  const [notes, setNotes] = useState('安排现场沟通，确认服务与培训需求。');
  const [priority, setPriority] = useState('normal');
  const [channel, setChannel] = useState('visit');
  const [subscribed, setSubscribed] = useState(true);
  const [reminders, setReminders] = useState(true);
  const [radius, setRadius] = useState(60);
  const [fail, setFail] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errors, setErrors] = useState<FormErrors>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sliderId = useId();
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'saving' || timer.current !== null) return;
    const next: FormErrors = {};
    if (!name.trim()) next.name = '请输入客户名称';
    if (!email.trim()) next.email = '请输入联系邮箱';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = '请输入有效的邮箱地址';
    setErrors(next);
    if (next.name || next.email) {
      setStatus('idle');
      (next.name ? nameRef : emailRef).current?.focus();
      return;
    }
    setStatus('saving');
    timer.current = setTimeout(() => {
      timer.current = null;
      setStatus(fail ? 'error' : 'success');
      if (!fail) notify('客户资料已保存到本次演示');
    }, 850);
  }

  function reset() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setName(''); setEmail(''); setPassword('haoyi-demo'); setShowPassword(false);
    setCity('nanjing'); setAmount('12800'); setCount('4'); setDate('2026-11-16');
    setNotes('安排现场沟通，确认服务与培训需求。'); setPriority('normal'); setChannel('visit');
    setSubscribed(true); setReminders(true); setRadius(60); setErrors({}); setStatus('idle'); setFail(false);
  }

  return <div className="neo-forms-demo">
    <form className="neo-client-form" onSubmit={submit} noValidate aria-label="客户资料演示表单" aria-busy={status === 'saving' || undefined}>
      <fieldset disabled={status === 'saving'} className="neo-form-fieldset">
        <legend className="neo-visually-hidden">客户资料</legend>
        <div className="neo-form-layout">
          <section className="neo-form-main" aria-labelledby="neo-customer-fields">
            <header data-slot="card-header" className="neo-form-panel-heading"><span className="neo-form-panel-icon"><Building2 size={23} strokeWidth={1.7} aria-hidden="true" /></span><h2 id="neo-customer-fields">客户资料</h2><span className="neo-form-required-note">* 必填</span></header>
            <FieldGroup>
              <Field label="客户名称" required error={errors.name}><input ref={nameRef} className="neo-input" name="customer" autoComplete="off" value={name} placeholder="例如：江宁新能源服务中心" onChange={event => { setName(event.target.value); setErrors(value => ({ ...value, name: undefined })); setStatus('idle'); }} /></Field>
              <Field label="联系邮箱" required error={errors.email}><input ref={emailRef} className="neo-input" name="email" type="email" autoComplete="off" value={email} placeholder="name@example.com" onChange={event => { setEmail(event.target.value); setErrors(value => ({ ...value, email: undefined })); setStatus('idle'); }} /></Field>
            </FieldGroup>
            <fieldset data-slot="field-set" className="neo-service-fieldset">
              <legend data-slot="field-legend">服务信息</legend>
              <FieldGroup>
              <Field label="所在城市">{control => <Select {...control} name="city" value={city} onValueChange={setCity} options={[{ value: 'nanjing', label: '南京市' }, { value: 'suzhou', label: '苏州市' }, { value: 'wuxi', label: '无锡市' }, { value: 'other', label: '其他城市', disabled: true }]} />}</Field>
              <Field label="预约日期"><input className="neo-input" name="date" type="date" value={date} onChange={event => setDate(event.target.value)} /></Field>
              <Field label="预计金额（元）">{control => <div data-slot="input-group" className="neo-input-accessory neo-amount-input"><input {...control} data-slot="input-group-control" name="amount" type="number" min="0" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /><span data-slot="input-group-addon" data-align="inline-start" className="neo-input-addon" aria-hidden="true">¥</span></div>}</Field>
              <Field label="新能源工位（个）"><input className="neo-input" name="count" type="number" min="0" step="1" value={count} onChange={event => setCount(event.target.value)} /></Field>
              <div className="neo-form-wide"><Field label="沟通备注"><textarea className="neo-input" rows={3} name="notes" value={notes} onChange={event => setNotes(event.target.value)} /></Field></div>
              </FieldGroup>
            </fieldset>
          </section>
          <section className="neo-form-preferences" aria-labelledby="neo-followup-settings">
            <header data-slot="card-header" className="neo-form-panel-heading"><span className="neo-form-panel-icon"><SlidersHorizontal size={22} strokeWidth={1.7} aria-hidden="true" /></span><h2 id="neo-followup-settings">跟进设置</h2></header>
            <FieldGroup className="neo-control-stack">
              <RadioGroup label="跟进优先级" name="demo-priority" value={priority} onValueChange={setPriority} options={[{ value: 'normal', label: '常规' }, { value: 'high', label: '优先' }, { value: 'urgent', label: '紧急' }]} />
              <div className="neo-label-group"><span>联系渠道</span><SegmentedControl aria-label="联系渠道" value={channel} onValueChange={setChannel} options={[{ value: 'visit', label: '到店' }, { value: 'phone', label: '电话' }, { value: 'online', label: '线上' }]} /></div>
              <div className="neo-slider-field"><div><label htmlFor={sliderId}>服务半径</label><output htmlFor={sliderId}>{radius} <span>km</span></output></div><input id={sliderId} type="range" min="10" max="100" step="10" value={radius} onChange={event => setRadius(Number(event.target.value))} style={{ '--neo-range': `${(radius - 10) / 90 * 100}%` } as CSSProperties} /><div className="neo-slider-scale" aria-hidden="true"><span>10 km</span><span>100 km</span></div></div>
              <div className="neo-form-options"><div data-slot="field" data-orientation="horizontal" className="neo-setting-row"><Checkbox label="保存后加入重点客户" checked={subscribed} onCheckedChange={setSubscribed} /></div><div data-slot="field" data-orientation="horizontal" className="neo-setting-row"><Switch label="开启跟进提醒" checked={reminders} onCheckedChange={setReminders} /></div></div>
            </FieldGroup>
          </section>
        </div>
      </fieldset>
      <footer data-slot="card-footer" className="neo-form-savebar" data-status={status}>
        <div className="neo-form-outcome" aria-live="polite" aria-atomic="true">
          {status === 'saving' && <p>正在保存演示资料…</p>}
          {status === 'success' && <p className="neo-form-success"><span className="neo-form-status-icon"><Check size={18} aria-hidden="true" /></span>客户资料已保存</p>}
          {status === 'error' && <p className="neo-form-error" role="alert"><span className="neo-form-status-icon"><AlertCircle size={18} aria-hidden="true" /></span><span>模拟请求失败，内容已保留。关闭“模拟保存失败”后可重试。</span></p>}
        </div>
        <div className="neo-form-actions"><Switch label="模拟保存失败" checked={fail} onCheckedChange={value => { setFail(value); setStatus('idle'); }} disabled={status === 'saving'} /><div><SoftButton variant="quiet" onClick={reset} disabled={status === 'saving'}><RotateCcw size={16} aria-hidden="true" />重置</SoftButton><SoftButton type="submit" variant="primary" loading={status === 'saving'}><Send size={16} aria-hidden="true" />{status === 'error' ? '重试保存' : '保存资料'}</SoftButton></div></div>
      </footer>
    </form>
    <DemoSection title="输入状态" className="neo-field-state-section">
      <FieldGroup className="neo-field-states">
        <Field label="演示密码">{control => <div data-slot="input-group" className="neo-input-accessory"><input {...control} data-slot="input-group-control" name="demo-password" type={showPassword ? 'text' : 'password'} value={password} autoComplete="off" onChange={event => setPassword(event.target.value)} /><span data-slot="input-group-addon" data-align="inline-end" className="neo-input-addon"><SoftButton type="button" variant="quiet" iconOnly aria-label={showPassword ? '隐藏演示密码' : '显示演示密码'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</SoftButton></span></div>}</Field>
        <Field label="客户编号" hint="只读"><input className="neo-input" value="HY-DEMO-026" readOnly /></Field>
        <Field label="所属组织" hint="由管理员设置"><input className="neo-input" value="浩宜总部" disabled /></Field>
        <Field label="错误示例" error="请输入完整的客户名称"><input className="neo-input" value="" readOnly placeholder="缺少必填信息" /></Field>
      </FieldGroup>
      <div className="neo-choice-state-row"><Checkbox label="部分选中" checked="mixed" disabled /><Switch label="未开放功能" checked={false} onCheckedChange={() => undefined} disabled /></div>
    </DemoSection>
  </div>;
}

type Customer = { id: string; name: string; city: string; amount: number; status: '待跟进' | '已完成'; initials: string };
const demoCustomers: Customer[] = [
  { id: 'client-1', name: '江宁新能源服务中心', city: '南京市', amount: 28000, status: '待跟进', initials: '江' },
  { id: 'client-2', name: '苏州湖畔汽车服务', city: '苏州市', amount: 42000, status: '待跟进', initials: '湖' },
  { id: 'client-3', name: '无锡青禾维修站', city: '无锡市', amount: 18000, status: '已完成', initials: '青' },
  { id: 'client-4', name: '常州远行养护中心', city: '常州市', amount: 36000, status: '待跟进', initials: '远' },
  { id: 'client-5', name: '南通新港服务中心', city: '南通市', amount: 24000, status: '待跟进', initials: '港' },
  { id: 'client-6', name: '南京桥北汽车工坊', city: '南京市', amount: 52000, status: '已完成', initials: '桥' },
  { id: 'client-7', name: '扬州运河新能源', city: '扬州市', amount: 31000, status: '待跟进', initials: '运' },
  { id: 'client-8', name: '镇江城市维修中心', city: '镇江市', amount: 22000, status: '已完成', initials: '城' },
];
const filters = ['全部客户', '待跟进', '已完成'] as const;
const steps = ['选择客户', '填写资料', '确认提交'];
const money = (value: number) => new Intl.NumberFormat('zh-CN').format(value);

function useTableMotion(layoutKey: string) {
  const tableBody = useRef<HTMLTableSectionElement>(null);
  const before = useRef<Map<string, { left: number; top: number }> | null>(null);
  const animations = useRef<Animation[]>([]);
  const { level } = useMotion();
  const cancel = useCallback(() => { animations.current.forEach(animation => animation.cancel()); animations.current = []; }, []);
  function capture() {
    if (!tableBody.current || level === 'off') { before.current = null; return; }
    const origin = tableBody.current.getBoundingClientRect();
    before.current = new Map(Array.from(tableBody.current.rows).map(row => {
      const bounds = row.getBoundingClientRect();
      return [row.dataset.rowId!, { left: bounds.left - origin.left, top: bounds.top - origin.top }];
    }));
  }
  useLayoutEffect(() => {
    const previous = before.current;
    before.current = null;
    cancel();
    if (!previous || level === 'off' || !tableBody.current) return;
    const origin = tableBody.current.getBoundingClientRect();
    Array.from(tableBody.current.rows).forEach((row, index) => {
      if (typeof row.animate !== 'function') return;
      const bounds = row.getBoundingClientRect();
      const old = previous.get(row.dataset.rowId!);
      const maxDistance = level === 'rich' ? 160 : 12;
      const clamp = (value: number) => Math.max(-maxDistance, Math.min(maxDistance, value));
      const dx = old ? clamp(old.left - (bounds.left - origin.left)) : 0;
      const dy = old ? clamp(old.top - (bounds.top - origin.top)) : level === 'rich' ? 10 : 0;
      if (old && Math.abs(dx) < .5 && Math.abs(dy) < .5) return;
      animations.current.push(row.animate([
        { transform: `translate(${dx}px, ${dy}px)`, opacity: old ? 1 : .25 },
        { transform: 'translate(0px, 0px)', opacity: 1 },
      ], { duration: level === 'rich' ? 420 : 160, delay: level === 'rich' ? Math.min(index * 24, 72) : 0, easing: 'cubic-bezier(.22,.8,.25,1)', fill: 'backwards' }));
    });
    return cancel;
  }, [layoutKey, level, cancel]);
  useEffect(() => {
    const stop = () => { if (document.hidden) { cancel(); before.current = null; } };
    document.addEventListener('visibilitychange', stop);
    return () => { document.removeEventListener('visibilitychange', stop); cancel(); };
  }, [cancel]);
  return { tableBody, capture };
}

export function NavigationDemo({ notify }: DemoProps) {
  const [rows, setRows] = useState(demoCustomers);
  const [tab, setTab] = useState(0);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<'asc' | 'desc' | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<Customer | null>(null);
  const [step, setStep] = useState(0);
  const [stepDone, setStepDone] = useState(false);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const detailTitle = useRef<HTMLHeadingElement>(null);
  const listRegion = useRef<HTMLElement>(null);
  const lastDetail = useRef<string | null>(null);
  const uid = useId();
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    const result = rows.filter(row => (tab === 0 || row.status === filters[tab]) && (!value || `${row.name}${row.city}`.toLowerCase().includes(value)));
    return sort ? result.sort((a, b) => sort === 'asc' ? a.amount - b.amount : b.amount - a.amount) : result;
  }, [rows, tab, query, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 4));
  const visiblePage = Math.min(page, pageCount);
  const visible = filtered.slice((visiblePage - 1) * 4, visiblePage * 4);
  const allSelected = visible.length > 0 && visible.every(row => selected.includes(row.id));
  const someSelected = visible.some(row => selected.includes(row.id));
  const { tableBody, capture } = useTableMotion(`${detail?.id ?? 'list'}:${tab}:${sort}:${query}:${visiblePage}:${visible.map(row => `${row.id}:${row.status}`).join(',')}`);

  useEffect(() => {
    if (detail) { lastDetail.current = detail.id; detailTitle.current?.focus(); }
    else if (lastDetail.current) {
      const target = listRegion.current?.querySelector<HTMLButtonElement>(`[data-customer-id="${lastDetail.current}"]`);
      (target ?? tabs.current[tab])?.focus();
      lastDetail.current = null;
    }
  }, [detail, tab]);

  function chooseTab(index: number) { capture(); setTab(index); setPage(1); setDetail(null); }
  function changePage(next: number) { capture(); setPage(Math.max(1, Math.min(pageCount, next))); }
  function tabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? filters.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + filters.length) % filters.length;
    chooseTab(next); tabs.current[next]?.focus();
  }
  function mark(ids: string[]) {
    capture();
    setRows(items => items.map(row => ids.includes(row.id) ? { ...row, status: '已完成' } : row));
    setSelected([]);
    notify(`已将 ${ids.length} 位演示客户标记为完成`);
  }
  function selectPage(checked: boolean) {
    setSelected(current => checked ? [...new Set([...current, ...visible.map(row => row.id)])] : current.filter(id => !visible.some(row => row.id === id)));
  }
  function reset() { capture(); setRows(demoCustomers); setTab(0); setQuery(''); setPage(1); setSort(null); setSelected([]); setDetail(null); }

  return <div className="neo-navigation-demo">
    <DemoSection title="客户列表" className="neo-navigation-surface">
      <nav className="neo-breadcrumbs" aria-label="客户路径"><button type="button" onClick={() => { setDetail(null); setTab(0); setQuery(''); setPage(1); }}>客户工作区</button><ChevronRight size={14} aria-hidden="true" />{detail ? <><button type="button" onClick={() => setDetail(null)}>客户列表</button><ChevronRight size={14} aria-hidden="true" /><span aria-current="page">客户详情</span></> : <span aria-current="page">客户列表</span>}</nav>
      {detail ? <div className="neo-inline-detail"><div className="neo-customer-avatar" aria-hidden="true">{detail.initials}</div><h3 ref={detailTitle} tabIndex={-1}>{detail.name}</h3><dl><div><dt>城市</dt><dd>{detail.city}</dd></div><div><dt>预计金额</dt><dd>¥{money(detail.amount)}</dd></div><div><dt>状态</dt><dd>{detail.status}</dd></div></dl><SoftButton onClick={() => setDetail(null)}><ChevronLeft size={16} aria-hidden="true" />返回列表</SoftButton></div> : <>
        <div data-slot="tabs-list" className="neo-list-tabs" role="tablist" aria-label="客户视图" style={{ '--neo-tab-index': tab, '--neo-tab-count': filters.length } as CSSProperties}><span aria-hidden="true" className="neo-list-tab-indicator" />{filters.map((label, index) => <button data-slot="tabs-trigger" data-state={tab === index ? 'active' : 'inactive'} key={label} ref={element => { tabs.current[index] = element; }} type="button" role="tab" id={`${uid}-tab-${index}`} aria-controls={`${uid}-panel`} aria-selected={tab === index} tabIndex={tab === index ? 0 : -1} onClick={() => chooseTab(index)} onKeyDown={event => tabKey(event, index)}>{label}<span className="neo-tab-count">{index === 0 ? rows.length : rows.filter(row => row.status === label).length}</span></button>)}</div>
        <section ref={listRegion} id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${tab}`} tabIndex={0} className="neo-list-panel">
          <div className="neo-list-toolbar"><label className="neo-search"><Search size={18} aria-hidden="true" /><span className="neo-visually-hidden">搜索客户</span><input type="search" value={query} placeholder="搜索名称或城市" onChange={event => { capture(); setQuery(event.target.value); setPage(1); }} /></label><span className="neo-result-count" aria-live="polite">{filtered.length} 位客户</span><SoftButton variant="quiet" onClick={reset}><RotateCcw size={16} aria-hidden="true" />重置</SoftButton></div>
          {selected.length > 0 && <div className="neo-bulk-toolbar" role="region" aria-label="批量操作"><span>已选 {selected.length} 位</span><SoftButton variant="primary" onClick={() => mark(selected)}><Check size={16} aria-hidden="true" />标记完成</SoftButton><SoftButton variant="quiet" onClick={() => setSelected([])}>取消选择</SoftButton></div>}
          <div className="neo-table-scroll" role="region" aria-label="客户表格，可横向滚动" tabIndex={0}>
            <table className="neo-data-table"><caption className="neo-visually-hidden">客户列表，全部为本地演示资料</caption><thead><tr><th className="neo-select-column" scope="col"><Checkbox label={<span className="neo-visually-hidden">选择当前页全部客户</span>} checked={allSelected ? true : someSelected ? 'mixed' : false} onCheckedChange={selectPage} disabled={!visible.length} /></th><th scope="col">客户名称</th><th scope="col">城市</th><th scope="col" className="neo-align-right" aria-sort={sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : 'none'}><button type="button" className="neo-sort-control" onClick={() => { capture(); setSort(value => value === 'asc' ? 'desc' : 'asc'); setPage(1); }}>预计金额{sort === 'asc' ? <ArrowUp size={14} aria-hidden="true" /> : sort === 'desc' ? <ArrowDown size={14} aria-hidden="true" /> : <SlidersHorizontal size={14} aria-hidden="true" />}</button></th><th scope="col">状态</th><th scope="col"><span className="neo-visually-hidden">操作</span></th></tr></thead><tbody ref={tableBody}>{visible.map(row => <tr key={row.id} data-row-id={row.id} data-selected={selected.includes(row.id) || undefined}><td><Checkbox label={<span className="neo-visually-hidden">选择{row.name}</span>} checked={selected.includes(row.id)} onCheckedChange={checked => setSelected(value => checked ? [...new Set([...value, row.id])] : value.filter(id => id !== row.id))} /></td><th scope="row"><button type="button" className="neo-customer-link" data-customer-id={row.id} onClick={() => setDetail(row)}><span className="neo-customer-avatar" aria-hidden="true">{row.initials}</span><span>{row.name}</span></button></th><td>{row.city}</td><td className="neo-align-right neo-table-amount">¥{money(row.amount)}</td><td><span className={`neo-table-status ${row.status === '已完成' ? 'neo-table-status-done' : ''}`}>{row.status === '已完成' && <Check size={12} aria-hidden="true" />}{row.status}</span></td><td><ActionMenu label={`${row.name}的操作`} items={[{ label: '查看详情', onSelect: () => setDetail(row) }, { label: row.status === '已完成' ? '重新跟进' : '标记完成', onSelect: () => { if (row.status === '已完成') { capture(); setRows(items => items.map(item => item.id === row.id ? { ...item, status: '待跟进' } : item)); notify('已恢复跟进'); } else mark([row.id]); } }]} /></td></tr>)}</tbody></table>
            {!visible.length && <div className="neo-table-empty"><Search size={28} aria-hidden="true" /><p>没有符合条件的客户</p><SoftButton onClick={() => { setQuery(''); chooseTab(0); }}>清除筛选</SoftButton></div>}
          </div>
          <nav className="neo-pagination" aria-label="客户分页"><span>第 {visiblePage} / {pageCount} 页</span><div><SoftButton iconOnly aria-label="上一页客户" disabled={visiblePage <= 1} onClick={() => changePage(visiblePage - 1)}><ChevronLeft size={18} aria-hidden="true" /></SoftButton>{Array.from({ length: pageCount }, (_, index) => <SoftButton key={index} aria-label={`第 ${index + 1} 页客户`} aria-current={visiblePage === index + 1 ? 'page' : undefined} variant={visiblePage === index + 1 ? 'primary' : 'quiet'} onClick={() => changePage(index + 1)}>{index + 1}</SoftButton>)}<SoftButton iconOnly aria-label="下一页客户" disabled={visiblePage >= pageCount} onClick={() => changePage(visiblePage + 1)}><ChevronRight size={18} aria-hidden="true" /></SoftButton></div></nav>
        </section>
      </>}
    </DemoSection>
    <DemoSection title="录入步骤" className="neo-steps-surface">
      <ol className="neo-stepper" aria-label="资料录入步骤">{steps.map((label, index) => <li key={label} data-step-state={stepDone || index < step ? 'complete' : index === step ? 'active' : 'upcoming'}><button type="button" aria-current={!stepDone && index === step ? 'step' : undefined} onClick={() => { setStep(index); setStepDone(false); }}><span className="neo-step-number">{stepDone || index < step ? <Check size={18} aria-hidden="true" /> : index + 1}</span><span>{label}</span></button></li>)}</ol>
      <div className="neo-step-workspace"><span className="neo-step-explanation" aria-live="polite">{stepDone ? '本次演示已完成，可以重新体验。' : ['先从客户列表选择一位客户。', '补充联系信息与本次沟通资料。', '核对资料，确认后结束本次演示。'][step]}</span><div><SoftButton variant="quiet" disabled={step === 0 && !stepDone} onClick={() => { setStepDone(false); setStep(value => Math.max(0, value - 1)); }}>上一步</SoftButton><SoftButton variant="primary" onClick={() => { if (stepDone) { setStep(0); setStepDone(false); } else if (step === 2) { setStepDone(true); notify('步骤演示已完成'); } else setStep(value => value + 1); }}>{stepDone ? '重新体验' : step === 2 ? '确认完成' : '下一步'}<ChevronRight size={16} aria-hidden="true" /></SoftButton></div></div>
    </DemoSection>
  </div>;
}
