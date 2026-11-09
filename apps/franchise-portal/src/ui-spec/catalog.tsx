import { useRef, useState } from 'react';
import { ArrowRight, Check, ChevronDown, CircleHelp, Download, Plus, Search, Settings2, SlidersHorizontal, X } from 'lucide-react';
import { Checkbox, Select, RadioGroup, Switch, SegmentedControl } from './controls';
import { BarChart, Button, ChartFrame, Dialog, EmptyState, Field, Panel, StatusBadge } from './components';

const swatches = [
  ['primary', '主色', '#2563EB'], ['accent', '科技辅助色', '#0E7490'], ['text', '主要文字', '#0F172A'],
  ['bg', '页面背景', '#F8FAFC'], ['surface', '内容表面', '#FFFFFF'], ['border', '分隔线', '#E2E8F0'],
  ['success', '成功', '#15803D'], ['warning', '警告', '#B45309'], ['danger', '危险', '#DC2626'],
];
const optionsFor = (values:string[]) => values.map(value=>({value,label:value}));
const chartRows = [{ label: '南京', value: 48 }, { label: '苏州', value: 36 }, { label: '无锡', value: 27 }, { label: '南通', value: 18 }];
type Scenario = 'ready' | 'loading' | 'refreshing' | 'empty' | 'filtered' | 'error' | 'forbidden' | 'offline';
const scenarioNames: Record<Scenario, string> = { ready: '正常', loading: '首次加载', refreshing: '后台刷新', empty: '空数据', filtered: '筛选无结果', error: '局部失败', forbidden: '无权限', offline: '离线' };

export function Catalog({ notify }: { notify: (message: string) => void }) {
  const [section, setSection] = useState('foundation');
  const [scenario, setScenario] = useState<Scenario>('ready');
  const [modal, setModal] = useState<'dialog' | 'drawer' | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState('success');
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [demoFilter, setDemoFilter] = useState('全部状态');
  const [chips, setChips] = useState(['江苏省', '待联系', '负责人：总部运营']);
  const nameInput = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const dirty = name.length > 0;

  function openEditor(kind: 'dialog' | 'drawer') { setName(''); setError(''); setModal(kind); }
  async function save() {
    if (saving.current) return;
    if (!name.trim()) { setError('请填写客户名称'); nameInput.current?.focus(); return; }
    saving.current = true; setBusy(true); setError('');
    await new Promise(resolve => window.setTimeout(resolve, 600));
    setBusy(false); saving.current = false;
    if (result === 'conflict') { setError('记录已被其他操作更新。请核对最新版本后重试。'); return; }
    if (result === 'timeout') { setError('本次未完成保存，输入已保留。请核对结果后重试。'); return; }
    setModal(null); setName(''); notify('样板记录已保存');
  }
  const sections = [['foundation', '视觉基础'], ['controls', '按钮与表单'], ['overlays', '弹层与反馈'], ['charts', '图表与数据']];

  return <div className="hy-catalog">
    <header className="hy-catalog-heading"><h1>组件与设计规范</h1><span className="hy-catalog-version">v1.1</span></header>
    <div className="hy-catalog-tabs hy-glass" role="tablist" aria-label="规范章节">{sections.map(([id, label]) => <button role="tab" key={id} id={`tab-${id}`} aria-selected={section === id} aria-controls={`panel-${id}`} tabIndex={section === id ? 0 : -1} onClick={() => setSection(id)} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const index = sections.findIndex(item => item[0] === section); const next = event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + sections.length) % sections.length; setSection(sections[next][0]); document.getElementById(`tab-${sections[next][0]}`)?.focus(); } }}>{label}</button>)}</div>
    <div role="tabpanel" id={`panel-${section}`} aria-labelledby={`tab-${section}`} className="hy-catalog-panel">
      {section === 'foundation' && <>
        <Panel title="颜色系统" action={<span className="hy-catalog-note">以语义命名，以用途选择</span>}><div className="hy-palette-grid">{swatches.map(([token, title, value]) => <div className="hy-swatch" key={token}><div style={{ background: `var(--hy-${token})` }} /><div><strong>{title}</strong><code>{value}</code></div></div>)}</div></Panel>
        <div className="hy-catalog-columns"><Panel title="字体与层级"><div className="hy-type-sample hy-type-title">以清晰为先，精确呈现。</div><div className="hy-type-sample hy-type-section">经营情况一目了然</div><div className="hy-type-sample hy-type-body">中文使用本机系统字体，数据使用等宽数字对齐。</div><div className="hy-type-numbers">128,640<span>.00</span><small>CNY · TABULAR NUMBERS</small></div><dl className="hy-token-list"><div><dt>页面标题</dt><dd>24 / 32 · 600</dd></div><div><dt>分区标题</dt><dd>18 / 26 · 600</dd></div><div><dt>桌面正文</dt><dd>14 / 22 · 400</dd></div><div><dt>手机正文</dt><dd>16 / 24 · 400</dd></div></dl></Panel>
          <Panel title="间距与形状"><div className="hy-space-examples">{[4,8,12,16,24,32,48].map(value => <div key={value}><span style={{ width: value, height: value }} /><code>{value}</code></div>)}</div><div className="hy-radius-examples">{[6,8,12,16].map(value => <div key={value} style={{ borderRadius: value }}>{value}px</div>)}</div><dl className="hy-token-list"><div><dt>标准行高 / 紧凑行高</dt><dd>48 / 40px</dd></div><div><dt>侧栏 / 收起</dt><dd>224 / 64px</dd></div><div><dt>顶栏 / 内容边距</dt><dd>56 / 24px</dd></div></dl></Panel></div>
        <MaterialComparison notify={notify}/><Panel title="语义与图标"><div className="hy-demo-row"><StatusBadge tone="info">进行中</StatusBadge><StatusBadge tone="success">已完成</StatusBadge><StatusBadge tone="warning">即将到期</StatusBadge><StatusBadge tone="danger">禁止联系</StatusBadge><StatusBadge tone="neutral">已归档</StatusBadge></div><div className="hy-icon-gallery">{[Search, Plus, Settings2, SlidersHorizontal, Check, X, ArrowRight, ChevronDown, CircleHelp].map((Icon, index) => <span key={index}><Icon aria-hidden="true" /></span>)}<span className="hy-catalog-note">Lucide · 16 / 20px</span></div></Panel>
      </>}
      {section === 'controls' && <>
        <ControlMatrix />
        <Panel title="按钮层级"><div className="hy-demo-row"><Button variant="primary" icon={<Plus aria-hidden="true" />} onClick={() => openEditor('drawer')}>新增客户</Button><Button onClick={() => notify('次要操作已响应')}>次要操作</Button><Button variant="quiet" onClick={() => notify('已查看样板详情')}>查看详情</Button><Button variant="danger" onClick={() => setConfirmOpen(true)}>作废记录</Button></div><p className="hy-catalog-note">每个操作区保留一个主要动作，危险操作独立分组。</p></Panel>
        <div className="hy-catalog-columns"><Panel title="尺寸与状态"><div className="hy-demo-row"><Button size="sm" onClick={() => notify('小号按钮 · 32px')}>小号 32</Button><Button onClick={() => notify('默认按钮 · 36px')}>默认 36</Button><Button size="lg" onClick={() => notify('大号按钮 · 44px')}>大号 44</Button></div><div className="hy-demo-row"><Button loading>保存中</Button><Button disabled>已归档，无法修改</Button><Button aria-label="搜索示例" icon={<Search aria-hidden="true" />} onClick={() => notify('搜索按钮已响应')} /></div><p className="hy-catalog-note">手机触控目标至少 44 × 44px；不可操作与提交中使用不同状态。</p></Panel>
          <Panel title="字段与校验"><form onSubmit={event => { event.preventDefault(); void save(); }} noValidate><Field label="客户名称" required htmlFor="catalog-customer" error={error}><input ref={nameInput} id="catalog-customer" value={name} onChange={event => { setName(event.target.value); if (event.target.value.trim()) setError(''); }} onBlur={() => { if (!name.trim()) setError('请填写客户名称'); }} placeholder="请输入客户名称" aria-invalid={!!error} /></Field><Field label="联系状态" htmlFor="catalog-filter">{field => <Select {...field} value={demoFilter} onValueChange={setDemoFilter} options={optionsFor(["全部状态","待联系","已联系"])}/>}</Field><div className="hy-demo-row"><Button variant="primary" type="submit" loading={busy}>验证并保存</Button><Button onClick={() => { setName(''); setError(''); }}>重置</Button></div></form></Panel></div>
        <Panel title="筛选项"><div className="hy-demo-row">{chips.map(label => <button className="hy-demo-chip" key={label} onClick={() => {setChips(current => current.filter(item => item !== label)); notify(`已移除筛选：${label}`);}} aria-label={`移除筛选 ${label}`}>{label}<X aria-hidden="true" /></button>)}</div><p className="hy-catalog-note">完整筛选与记录选择交互可在“客户线索”中体验。</p></Panel>
      </>}
      {section === 'overlays' && <>
        <Panel title="弹层与草稿保护"><div className="hy-demo-row"><Button variant="primary" onClick={() => openEditor('drawer')}>打开编辑抽屉</Button><Button onClick={() => openEditor('dialog')}>打开表单弹窗</Button><Button variant="danger" onClick={() => setConfirmOpen(true)}>危险操作确认</Button></div><Field label="保存结果示例" htmlFor="catalog-save-result">{field => <Select {...field} value={result} onValueChange={setResult} options={[{value:"success",label:"保存成功"},{value:"conflict",label:"版本冲突"},{value:"timeout",label:"请求未完成"}]}/>}</Field>{confirmed && <StatusBadge tone="neutral">示例记录已作废</StatusBadge>}</Panel>
        <Panel title="页面状态" action={<Select aria-label="页面状态示例" value={scenario} onValueChange={value => setScenario(value as Scenario)} options={Object.entries(scenarioNames).map(([value,label]) => ({value,label}))}/>}><div className="hy-state-stage">{scenario === 'ready' || scenario === 'refreshing' ? <><div className="hy-demo-record"><span className="hy-demo-record-icon"><ContactIcon /></span><div><strong>南京明远汽车服务有限公司</strong><p>南京 · 待联系</p></div><StatusBadge tone="info">有效线索</StatusBadge></div>{scenario === 'refreshing' && <p role="status" className="hy-catalog-note">正在刷新，当前内容仍可查看…</p>}</> : <EmptyState kind={scenario} action={scenario === 'forbidden' || scenario === 'loading' ? undefined : <Button onClick={() => { setScenario('ready'); notify('已恢复示例数据'); }}>{scenario === 'filtered' ? '清除筛选' : scenario === 'empty' ? '新增记录' : '重新加载'}</Button>} />}</div></Panel>
        <Panel title="操作反馈"><div className="hy-demo-row"><Button icon={<Check aria-hidden="true" />} onClick={() => notify('跟进记录已保存')}>成功提示</Button><Button icon={<Download aria-hidden="true" />} onClick={() => notify('当前样板未提供导出；实际页面按权限开放')}>权限说明示例</Button></div><p className="hy-catalog-note">成功提示短暂显示；错误在原位置保留，并提供恢复入口。</p></Panel>
      </>}
      {section === 'charts' && <>
        <div className="hy-catalog-columns"><ChartFrame title="区域线索规模" unit="条" period="截至 2026-11-05" note="演示数据。按当前线索记录所属城市统计，不代表转化率。" rows={chartRows}><BarChart rows={chartRows} /></ChartFrame><ChartFrame title="新增线索趋势" unit="条" period="11月1日—5日 · 示例时间序列" note="仅演示有时间桶时的画法。当前业务聚合接口尚未提供此序列。" rows={[{label:'11/01',value:8},{label:'11/02',value:13},{label:'11/03',value:10},{label:'11/04',value:18},{label:'11/05',value:22}]}><svg className="hy-line-example" viewBox="0 0 420 240" role="img" aria-label="演示新增线索由8条变化至22条"><g className="hy-chart-grid">{[0,10,20,30].map((n,i) => <g key={n}><line x1="40" x2="400" y1={200-i*60} y2={200-i*60}/><text x="24" y={204-i*60}>{n}</text></g>)}</g><polyline points="55,152 135,122 215,140 295,92 375,68" fill="none" stroke="var(--hy-primary)" strokeWidth="3" />{[[55,152,8],[135,122,13],[215,140,10],[295,92,18],[375,68,22]].map(([x,y,n],i)=><g key={x}><circle cx={x} cy={y} r="5" fill="var(--hy-primary)"/><text x={x} y={y-12} textAnchor="middle">{n}</text><text x={x} y="225" textAnchor="middle">11/{String(i+1).padStart(2,'0')}</text></g>)}</svg></ChartFrame></div>
        <Panel title="选图规则"><div className="hy-rule-grid">{[['规模对比','横向条形图','按数量排序，保留准确单位。'],['阶段存量','阶段分布图','当前状态分组，不计算转化率。'],['完成进度','进度条','同时显示完成数与总量。'],['时间变化','折线图','有真实时间序列才绘制趋势。'],['同批次转化','漏斗图','需要阶段事件、同批次与统计窗口。'],['地理覆盖','二维地图','3D 仅进入区域分析专用视图。']].map(([title,type,desc])=><div key={title}><span>{title}</span><strong>{type}</strong><p>{desc}</p></div>)}</div></Panel>
      </>}
    </div>
    <Dialog open={modal !== null} kind={modal ?? 'dialog'} title="编辑客户" dirty={dirty} busy={busy} onClose={() => setModal(null)} footer={requestClose => <><Button onClick={requestClose}>取消</Button><Button variant="primary" loading={busy} onClick={() => void save()}>保存</Button></>}><Field label="客户名称" htmlFor="catalog-dialog-name" required error={error}><input ref={nameInput} id="catalog-dialog-name" value={name} onChange={event=>{setName(event.target.value);setError('');}} placeholder="请输入客户名称" aria-invalid={!!error}/></Field>{error && result !== 'success' && <Button onClick={() => {setResult('success');setError('');notify('已核对示例结果，可以继续保存');}}>{result === 'conflict' ? '核对最新版本' : '核对保存结果'}</Button>}<p className="hy-catalog-note">输入后尝试关闭或按 Esc，可体验草稿保护。</p></Dialog>
    <Dialog open={confirmOpen} title="作废示例记录？" onClose={() => setConfirmOpen(false)} footer={<><Button onClick={() => setConfirmOpen(false)} autoFocus>取消</Button><Button variant="danger" onClick={() => { setConfirmed(true); setConfirmOpen(false); notify('示例记录已作废'); }}>确认作废</Button></>}><p>作废后该记录将不再参与有效业务统计。仅影响当前样板。</p></Dialog>
  </div>;
}

function ContactIcon() { return <Search aria-hidden="true" />; }

function MaterialComparison({notify}:{notify:(message:string)=>void}) {
  const [solidChecked,setSolidChecked]=useState(true);
  const [glassChecked,setGlassChecked]=useState(true);
  const [solidPeriod,setSolidPeriod]=useState('本月');
  const [glassPeriod,setGlassPeriod]=useState('本月');
  return <Panel title="实色与玻璃"><div className="hy-material-comparison">
    <section className="hy-material-stage"><div className="hy-material-sample hy-material-solid"><header><strong>实色内容面</strong><StatusBadge tone="neutral">阅读与录入</StatusBadge></header><div className="hy-material-record"><span>南京门店合作计划</span><strong>¥128,000.00</strong></div><div className="hy-material-controls"><Checkbox label="纳入待办" checked={solidChecked} onCheckedChange={setSolidChecked}/><Select aria-label="实色样例统计周期" value={solidPeriod} onValueChange={setSolidPeriod} options={optionsFor(['本月','上月','本季度'])}/><Button variant="secondary" onClick={()=>notify('已查看实色内容样例')}>查看</Button></div></div></section>
    <section className="hy-material-stage hy-material-stage-glass"><div className="hy-material-sample hy-glass"><header><strong>玻璃操作面</strong><StatusBadge tone="info">导航与浮层</StatusBadge></header><div className="hy-material-record"><span>南京门店合作计划</span><strong>¥128,000.00</strong></div><div className="hy-material-controls"><Checkbox label="纳入待办" checked={glassChecked} onCheckedChange={setGlassChecked}/><Select aria-label="玻璃样例统计周期" value={glassPeriod} onValueChange={setGlassPeriod} options={optionsFor(['本月','上月','本季度'])}/><Button variant="secondary" onClick={()=>notify('已查看玻璃操作样例')}>查看</Button></div></div></section>
  </div><p className="hy-catalog-note">内容保持纯白；玻璃只用于操作层。关闭透明效果后，两种表面都保留清晰边界与文字。</p></Panel>;
}

function ControlMatrix() {
  const [choices,setChoices]=useState<Record<string,boolean|'mixed'>>({off:false,on:true,mixed:'mixed',error:false,focus:false});
  const [radio,setRadio]=useState('team');
  const [requiredRadio,setRequiredRadio]=useState('');
  const [mode,setMode]=useState('list');
  const [switches,setSwitches]=useState({off:false,on:true,error:false});
  const [requiredCity,setRequiredCity]=useState('');
  const [invalid,setInvalid]=useState(false);
  const setChoice=(name:string)=>(checked:boolean)=>setChoices(current=>({...current,[name]:checked}));
  return <>
    <Panel title="复选框与开关"><div className="hy-control-matrix">
      <div className="hy-control-example"><span>{choices.off?'已选':'未选'} / {switches.off?'开启':'关闭'}</span><Checkbox label="跟进提醒" checked={choices.off} onCheckedChange={setChoice('off')}/><Switch label="邮件通知" checked={switches.off} onCheckedChange={checked=>setSwitches(current=>({...current,off:checked}))}/></div>
      <div className="hy-control-example"><span>{choices.on?'已选':'未选'} / {switches.on?'开启':'关闭'}</span><Checkbox label="重要客户" checked={choices.on} onCheckedChange={setChoice('on')}/><Switch label="站内提醒" checked={switches.on} onCheckedChange={checked=>setSwitches(current=>({...current,on:checked}))}/></div>
      <div className="hy-control-example"><span>{choices.mixed==='mixed'?'部分选择':choices.mixed?'全部选择':'未选择'}</span><Checkbox label="当前列表部分已选" checked={choices.mixed} onCheckedChange={setChoice('mixed')}/><Button size="sm" variant="quiet" onClick={()=>setChoices(current=>({...current,mixed:'mixed'}))}>恢复部分选择</Button></div>
      <div className="hy-control-example"><span>禁用 · 未选</span><Checkbox label="归档记录" checked={false} onCheckedChange={()=>{}} disabled/><Switch label="停用通知" checked={false} onCheckedChange={()=>{}} disabled/></div>
      <div className="hy-control-example"><span>禁用 · 已选</span><Checkbox label="系统保留项" checked disabled onCheckedChange={()=>{}}/><Switch label="系统审计" checked disabled onCheckedChange={()=>{}}/></div>
      <div className="hy-control-example"><span>必填与错误反馈</span><Checkbox label="确认资料已核对" checked={choices.error} onCheckedChange={setChoice('error')} aria-invalid={!choices.error} aria-describedby={!choices.error?'catalog-check-error':undefined}/>{!choices.error&&<p id="catalog-check-error" className="hy-control-error">请先核对资料。</p>}<Switch label="预算告警" checked={switches.error} onCheckedChange={checked=>setSwitches(current=>({...current,error:checked}))} aria-invalid={!switches.error} aria-describedby={!switches.error?'catalog-switch-error':undefined}/>{!switches.error&&<p id="catalog-switch-error" className="hy-control-error">设置保存失败，请重新开启。</p>}</div>
    </div><div className="hy-control-interaction-note"><span>悬停和键盘焦点使用真实交互状态。</span><Button size="sm" onClick={()=>document.getElementById('catalog-focus-checkbox')?.focus()}>查看焦点</Button><Checkbox id="catalog-focus-checkbox" label="焦点示例" checked={choices.focus} onCheckedChange={setChoice('focus')}/></div></Panel>
    <div className="hy-catalog-columns"><Panel title="单选与分段选择"><RadioGroup name="catalog-owner-scope" label="跟进范围" value={radio} onValueChange={setRadio} options={[{value:'mine',label:'仅自己'},{value:'team',label:'当前团队'},{value:'all',label:'全部组织',disabled:true}]}/><div className="hy-control-separated"><RadioGroup name="catalog-locked-scope" label="只读查看范围" value="team" onValueChange={()=>{}} options={[{value:'mine',label:'仅自己'},{value:'team',label:'当前团队'}]} disabled/></div><div className="hy-control-separated"><RadioGroup name="catalog-required-scope" label="通知范围" value={requiredRadio} onValueChange={setRequiredRadio} options={[{value:'mine',label:'仅自己'},{value:'team',label:'当前团队'}]} aria-invalid={!requiredRadio} aria-describedby={!requiredRadio?'catalog-radio-error':undefined}/>{!requiredRadio&&<p id="catalog-radio-error" className="hy-control-error">请选择通知范围。</p>}</div><div className="hy-control-separated"><span className="hy-control-label">显示方式</span><SegmentedControl aria-label="目录显示方式" value={mode} onValueChange={setMode} options={[{value:'list',label:'列表'},{value:'cards',label:'卡片'},{value:'map',label:'地图',disabled:true}]}/><p className="hy-catalog-note">当前选择：{mode==='list'?'列表':'卡片'}。地图由区域分析专用视图提供。</p></div></Panel>
      <Panel title="下拉选择状态"><div className="hy-control-fields"><Field label="服务城市" htmlFor="catalog-required-city" required error={invalid&&!requiredCity?'请选择服务城市':undefined}>{field=><Select {...field} value={requiredCity} onValueChange={value=>{setRequiredCity(value);setInvalid(false);}} options={[{value:'',label:'请选择城市'},...optionsFor(['南京','苏州','无锡'])]}/>}</Field><Field label="已归档客户地区" htmlFor="catalog-disabled-city" hint="归档后不可修改地区。">{field=><Select {...field} value="南京" disabled onValueChange={()=>{}} options={optionsFor(['南京','苏州'])}/>}</Field><div className="hy-demo-row"><Button onClick={()=>{setInvalid(true);if(!requiredCity)document.getElementById('catalog-required-city')?.focus();}}>检查必填</Button></div></div></Panel></div>
  </>;
}
