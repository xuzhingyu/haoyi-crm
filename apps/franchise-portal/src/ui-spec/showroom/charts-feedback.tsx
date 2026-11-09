import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Check, CheckCircle2, CircleAlert, Database, Inbox, LockKeyhole, Play, RefreshCw, Table2, WifiOff } from 'lucide-react';
import { DemoSection, SoftButton, useMotion } from './kit';
import { AnalyticsShowcase } from './analytics-showcase';
import './charts-feedback.css';

const numberFormat = (value: number) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);

/** Visual digits roll between supplied values; the accessible value is always final. */
export function AnimatedNumber({ value, format = numberFormat }: { value: number; format?: (value: number) => string }) {
  const formatted = format(value);
  const { reduced, level } = useMotion();
  const [frame, setFrame] = useState({ value: formatted, previous: formatted, version: 0 });
  useEffect(() => {
    setFrame(previous => previous.value === formatted ? previous : { value: formatted, previous: previous.value, version: previous.version + 1 });
  }, [formatted]);
  const previous = frame.previous.slice(-frame.value.length).padStart(frame.value.length, ' ');
  const active = !reduced && level !== 'off' && frame.version > 0;
  return <span className="neo-odometer" data-testid="neo-odometer">
    <span className="neo-chart-sr">{formatted}</span>
    <span className="neo-odometer-visual" aria-hidden="true">{Array.from(formatted).map((character, index) => {
      const digit = /\d/.test(character);
      const before = previous[index] ?? character;
      const moving = active && digit && /\d/.test(before) && before !== character;
      return <span key={index} className={digit ? 'neo-odometer-digit' : 'neo-odometer-symbol'}>{moving ? <span key={`${frame.version}-${index}`} className="neo-odometer-reel"><span>{before}</span><span>{character}</span></span> : character}</span>;
    })}</span>
  </span>;
}

type RingItem = { label: string; value: number; max: number; color?: string };
const chartColours = ['var(--neo-blue)', 'var(--neo-cyan)', 'var(--neo-chart-violet)', 'var(--neo-chart-orange)'];

export function ActivityRings({ items }: { items: RingItem[] }) {
  const id = useId();
  const rings = items.slice(0, 4);
  const first = rings[0];
  const valid = first && first.max > 0 && Number.isFinite(first.max) && Number.isFinite(first.value);
  return <div className="neo-activity">
    <div className="neo-ring-graphic" data-rings={rings.length}>
      <svg viewBox="0 0 240 240" role="img" aria-labelledby={id}>
        <title id={id}>{rings.map(item => `${item.label}：${numberFormat(item.value)}，目标 ${numberFormat(item.max)}`).join('；')}</title>
        {rings.map((item, index) => {
          const radius = 101 - index * 23;
          const circumference = 2 * Math.PI * radius;
          const ratio = item.max > 0 && Number.isFinite(item.max) && Number.isFinite(item.value) ? Math.min(1, Math.max(0, item.value / item.max)) : 0;
          return <g key={item.label} fill="none" strokeWidth="14"><circle cx="120" cy="120" r={radius} className="neo-ring-track" /><circle cx="120" cy="120" r={radius} stroke={item.color ?? chartColours[index]} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - ratio)} strokeLinecap="round" transform="rotate(-90 120 120)" className="neo-ring-value" /></g>;
        })}
      </svg>
      <div className="neo-ring-center" aria-hidden="true"><strong>{valid ? `${Math.round(first.value / first.max * 100)}%` : '—'}</strong><span>{valid ? '首项目标' : '暂无目标'}</span></div>
    </div>
    <dl className="neo-ring-legend">{rings.map((item, index) => <div key={item.label}><dt><span className="neo-series-swatch" style={{ background: item.color ?? chartColours[index] }} />{item.label}</dt><dd>{numberFormat(item.value)}<span> / {item.max > 0 && Number.isFinite(item.max) ? numberFormat(item.max) : '未设置'}</span></dd></div>)}</dl>
  </div>;
}

const chartSets = [
  { label: '第一组', signed: 18, trained: 27, revenue: 128640.5, cities: [32, 24, 18, 12], trend: [12, 18, 14, 25, 23, 32, 38], spent: 7.6, reserved: 2.4 },
  { label: '第二组', signed: 22, trained: 31, revenue: 146280.75, cities: [42, 28, 16, 20], trend: [20, 16, 25, 28, 24, 36, 44], spent: 10.8, reserved: 1.6 },
  { label: '第三组', signed: 26, trained: 36, revenue: 119850.25, cities: [28, 20, 32, 16], trend: [10, 17, 21, 18, 32, 28, 35], spent: 4.8, reserved: 3.2 },
];
const cityNames = ['南京', '苏州', '无锡', '南通'];
const money = (value: number) => new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

function Figure({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return <figure className={`neo-chart-figure ${className}`}><figcaption>{title}</figcaption>{children}</figure>;
}

/** Replays paint only. Dataset values and accessible names never enter an intermediate state. */
function startChartReveal(root: HTMLElement, level: 'rich' | 'gentle') {
  const running: { element: Element; animation: Animation; visible: boolean }[] = [];
  const duration = level === 'rich' ? 1050 : 300;
  const add = (element: Element, frames: Keyframe[], order = 0) => {
    if (!element.animate) return;
    const rect = element.getBoundingClientRect();
    const visible = rect.bottom > 0 && rect.top < window.innerHeight;
    const animation = element.animate(frames, { duration, delay: level === 'rich' ? order * 65 : 0, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'backwards' });
    if (!visible || document.hidden) animation.pause();
    running.push({ element, animation, visible });
  };
  root.querySelectorAll<SVGCircleElement>('.neo-ring-value').forEach((element, index) => {
    const length = 2 * Math.PI * Number(element.getAttribute('r'));
    add(element, [{ strokeDashoffset: `${length}` }, { strokeDashoffset: element.getAttribute('stroke-dashoffset') ?? '0' }], index);
  });
  root.querySelectorAll<HTMLElement>('.neo-bar-fill, .neo-progress-track > span').forEach((element, index) => {
    add(element, [{ transform: 'scaleX(0)' }, { transform: element.style.transform }], index);
  });
  root.querySelectorAll<SVGPolylineElement>('.neo-chart-line').forEach(element => {
    const length = typeof element.getTotalLength === 'function' ? element.getTotalLength() : 400;
    add(element, [{ strokeDasharray: `${length}`, strokeDashoffset: `${length}` }, { strokeDasharray: `${length}`, strokeDashoffset: '0' }]);
  });
  root.querySelectorAll('.neo-chart-point').forEach((element, index) => {
    add(element, [{ opacity: 0 }, { opacity: 1 }], index);
  });
  root.querySelectorAll<SVGCircleElement>('.neo-donut circle').forEach((element, index) => {
    add(element, [{ strokeDasharray: '0 100' }, { strokeDasharray: element.getAttribute('stroke-dasharray') ?? '0 100' }], index);
  });
  root.querySelectorAll('.neo-budget-track').forEach(element => {
    add(element, [{ clipPath: 'inset(0 100% 0 0 round 8px)' }, { clipPath: 'inset(0 0% 0 0 round 8px)' }]);
  });
  const synchronize = () => running.forEach(({ animation, visible }) => {
    if (animation.playState === 'finished' || animation.playState === 'idle') return;
    if (visible && !document.hidden) animation.play(); else animation.pause();
  });
  const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => {
    entries.forEach(entry => { const item = running.find(value => value.element === entry.target); if (item) item.visible = entry.isIntersecting; });
    synchronize();
  }) : null;
  running.forEach(item => observer?.observe(item.element));
  document.addEventListener('visibilitychange', synchronize);
  return () => { observer?.disconnect(); document.removeEventListener('visibilitychange', synchronize); running.forEach(({ animation }) => animation.cancel()); };
}

export function ChartsDemo({ notify }: { notify: (message: string) => void }) {
  const [index, setIndex] = useState(0);
  const [table, setTable] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const visuals = useRef<HTMLDivElement>(null);
  const stopReplay = useRef<(() => void) | null>(null);
  const { level, reduced } = useMotion();
  useEffect(() => { stopReplay.current?.(); stopReplay.current = null; return () => { stopReplay.current?.(); stopReplay.current = null; }; }, [level, index, table]);
  const data = chartSets[index];
  const total = data.cities.reduce((sum, value) => sum + value, 0);
  const trendId = useId();
  const donutId = useId();
  const linePoints = data.trend.map((value, i) => `${32 + i * 47},${154 - value * 2.6}`).join(' ');
  const switchData = () => { setIndex(value => (value + 1) % chartSets.length); notify('已切换示例数据'); };
  const replay = () => {
    if (!visuals.current || reduced || level === 'off') return;
    stopReplay.current?.();
    stopReplay.current = startChartReveal(visuals.current, level);
    setReplayKey(value => value + 1);
    notify('图表动效已重播，数据保持不变');
  };
  return <DemoSection title="经营指标">
    <div className="neo-chart-toolbar"><span>本地示例数据：{data.label}</span><div><SoftButton variant="primary" onClick={replay} disabled={table || reduced}><Play size={16} />重播图表动效</SoftButton><SoftButton onClick={switchData}><RefreshCw size={16} />切换数据</SoftButton><SoftButton aria-pressed={table} onClick={() => setTable(value => !value)}><Table2 size={16} />{table ? '显示图表' : '查看数据表'}</SoftButton></div></div>
    {table ? <div className="neo-chart-table-wrap" role="region" aria-label="图表数据" tabIndex={0}><table className="neo-chart-table"><caption>当前示例数据，图表与表格使用相同数值</caption><thead><tr><th>指标</th><th>数值</th><th>目标 / 单位</th></tr></thead><tbody><tr><th>签约目标</th><td>{data.signed}</td><td>24 家</td></tr><tr><th>培训完成</th><td>{data.trained}</td><td>36 条记录</td></tr><tr><th>预计管道金额</th><td>{money(data.revenue)}</td><td>元，非收入</td></tr>{cityNames.map((name, i) => <tr key={name}><th>{name}线索</th><td>{data.cities[i]}</td><td>条</td></tr>)}{data.trend.map((value, i) => <tr key={i}><th>第 {i + 1} 日新增线索</th><td>{value}</td><td>条</td></tr>)}<tr><th>AI 预算已用 / 预留 / 剩余</th><td>{data.spent.toFixed(2)} / {data.reserved.toFixed(2)} / {(20 - data.spent - data.reserved).toFixed(2)}</td><td>元，总额 20.00</td></tr></tbody></table></div> : <>
      <div ref={visuals} className="neo-chart-visuals"><AnalyticsShowcase data={data} replayKey={replayKey} /><div className="neo-chart-feature">
        <Figure title="目标进度" className="neo-chart-rings"><ActivityRings items={[{ label: '签约目标', value: data.signed, max: 24 }, { label: '培训完成', value: data.trained, max: 36 }]} /></Figure>
        <Figure title="预计管道金额" className="neo-chart-number neo-energy-stat"><div className="neo-large-number"><span className="neo-money-unit">¥</span><AnimatedNumber value={data.revenue} format={money} /></div><p>示例金额，不代表已确认收入</p><div className="neo-number-controls"><SoftButton onClick={() => setIndex(value => (value + 2) % 3)} aria-label="切换到上一组金额"><ChevronLeft size={16} />上一组</SoftButton><SoftButton onClick={switchData} aria-label="切换到下一组金额">下一组<ChevronRight size={16} /></SoftButton></div><div className="neo-number-detail"><span>本组线索</span><strong><AnimatedNumber value={total} /><small> 条</small></strong></div></Figure>
      </div>
      <div className="neo-chart-grid">
        <Figure title="地区线索分布"><div className="neo-bar-chart" role="img" aria-label={cityNames.map((name, i) => `${name} ${data.cities[i]} 条`).join('，')}>{cityNames.map((name, i) => <div key={name} className="neo-bar-row"><span>{name}</span><div className="neo-bar-track"><div className="neo-bar-fill" style={{ transform: `scaleX(${data.cities[i] / 50})` }} /></div><strong>{data.cities[i]}</strong></div>)}</div><p className="neo-chart-foot">数量 / 条，坐标上限 50</p></Figure>
        <Figure title="每日新增线索"><svg className="neo-line-chart" viewBox="0 0 350 190" role="img" aria-labelledby={trendId}><title id={trendId}>{data.trend.map((value, i) => `第${i + 1}日 ${value}条`).join('，')}</title>{[0, 20, 40].map(tick => <g key={tick}><line x1="32" y1={154 - tick * 2.6} x2="320" y2={154 - tick * 2.6} className="neo-chart-gridline" /><text x="23" y={158 - tick * 2.6} textAnchor="end">{tick}</text></g>)}<polyline points={linePoints} className="neo-chart-line" />{data.trend.map((value, i) => <g key={i}><circle cx={32 + i * 47} cy={154 - value * 2.6} r="4.5" className="neo-chart-point" /><text x={32 + i * 47} y="180" textAnchor="middle">{i + 1}日</text></g>)}</svg><p className="neo-chart-foot">仅用于组件演示的连续日期序列</p></Figure>
        <Figure title="线索地区占比"><div className="neo-donut-layout"><svg viewBox="0 0 180 180" className="neo-donut" role="img" aria-labelledby={donutId}><title id={donutId}>{cityNames.map((name, i) => `${name} ${Math.round(data.cities[i] / total * 100)}%`).join('，')}</title>{data.cities.map((value, i) => { const prior = data.cities.slice(0, i).reduce((a, b) => a + b, 0); return <circle key={cityNames[i]} cx="90" cy="90" r="62" fill="none" stroke={chartColours[i]} strokeWidth="22" pathLength="100" strokeDasharray={`${value / total * 100} ${100 - value / total * 100}`} strokeDashoffset={-prior / total * 100} transform="rotate(-90 90 90)" />; })}{data.cities.map((_, i) => { const angle = data.cities.slice(0, i).reduce((sum, value) => sum + value, 0) / total * Math.PI * 2 - Math.PI / 2; return <line key={`boundary-${cityNames[i]}`} x1={90 + Math.cos(angle) * 50} y1={90 + Math.sin(angle) * 50} x2={90 + Math.cos(angle) * 74} y2={90 + Math.sin(angle) * 74} strokeWidth="2" className="neo-donut-separator" aria-hidden="true" />; })}<text x="90" y="88" textAnchor="middle" className="neo-donut-total">{total}</text><text x="90" y="110" textAnchor="middle">条线索</text></svg><ul className="neo-chart-key">{cityNames.map((name, i) => <li key={name}><span className="neo-series-swatch" style={{ background: chartColours[i] }} /><span>{name}</span><strong>{Math.round(data.cities[i] / total * 100)}%</strong></li>)}</ul></div></Figure>
        <Figure title="今日 AI 额度"><div className="neo-budget-number">¥<AnimatedNumber value={20 - data.spent - data.reserved} format={money} /><span> 可用</span></div><div className="neo-budget-track" role="img" aria-label={`总额度20元，已用${data.spent}元，预留${data.reserved}元，剩余${20 - data.spent - data.reserved}元`}><span className="neo-budget-spent" style={{ flexGrow: data.spent }} /><span className="neo-budget-reserved" style={{ flexGrow: data.reserved }} /><span className="neo-budget-remaining" style={{ flexGrow: 20 - data.spent - data.reserved }} /></div><dl className="neo-budget-legend"><div><dt>已用</dt><dd>¥{data.spent.toFixed(2)}</dd></div><div><dt>预留</dt><dd>¥{data.reserved.toFixed(2)}</dd></div><div><dt>总额度</dt><dd>¥20.00</dd></div></dl><div className="neo-labeled-progress"><span>培训记录完成 <strong>{data.trained} / 36</strong></span><div role="progressbar" aria-label="培训记录完成" aria-valuenow={data.trained} aria-valuemin={0} aria-valuemax={36} className="neo-progress-track"><span style={{ transform: `scaleX(${data.trained / 36})` }} /></div></div></Figure>
      </div>
      </div>
    </>}
  </DemoSection>;
}

type LoadOutcome = 'success' | 'empty' | 'error' | 'offline' | 'forbidden';
const outcomes: { value: LoadOutcome; label: string }[] = [{ value: 'success', label: '成功' }, { value: 'empty', label: '空结果' }, { value: 'error', label: '请求失败' }, { value: 'offline', label: '离线' }, { value: 'forbidden', label: '无权限' }];
type LoadState = 'idle' | 'loading' | LoadOutcome;

function Skeleton({ variant, active }: { variant: 'metrics' | 'card' | 'table' | 'detail'; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [pageVisible, setPageVisible] = useState(!document.hidden);
  useEffect(() => {
    const visibility = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', visibility);
    const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => setVisible(entries[0]?.isIntersecting ?? false)) : null;
    if (ref.current) observer?.observe(ref.current);
    return () => { document.removeEventListener('visibilitychange', visibility); observer?.disconnect(); };
  }, []);
  const shapes = variant === 'metrics' ? <><i className="neo-skeleton-label" /><i className="neo-skeleton-value" /><i className="neo-skeleton-short" /></> : variant === 'card' ? <><i className="neo-skeleton-photo" /><i /><i className="neo-skeleton-short" /></> : variant === 'table' ? <>{Array.from({ length: 4 }, (_, i) => <div className="neo-skeleton-row" key={i}><i /><i /><i /></div>)}</> : <><div className="neo-skeleton-profile"><i /><div><i /><i className="neo-skeleton-short" /></div></div><i /><i /><i className="neo-skeleton-short" /></>;
  return <div ref={ref} className={`neo-skeleton neo-skeleton--${variant}`} aria-hidden="true" data-sweep={active && visible && pageVisible ? 'active' : 'paused'}>{shapes}</div>;
}

function Outcome({ state, retry }: { state: LoadState; retry: () => void }) {
  const { level } = useMotion();
  const content: Record<Exclude<LoadState, 'loading'>, { icon: ReactNode; title: string; copy: string; action?: string }> = {
    idle: { icon: <Database />, title: '等待演示', copy: '选择结果，再开始一次本地加载。' },
    success: { icon: <CheckCircle2 />, title: '加载完成', copy: '3 条示例记录已经就绪。', action: '再次加载' },
    empty: { icon: <Inbox />, title: '没有符合条件的记录', copy: '可以调整筛选条件，再试一次。', action: '重新加载' },
    error: { icon: <CircleAlert />, title: '暂时没有加载成功', copy: '示例请求失败，内容与操作仍然保留。', action: '重试' },
    offline: { icon: <WifiOff />, title: '网络连接已断开', copy: '这是本地模拟的离线状态。', action: '重新连接' },
    forbidden: { icon: <LockKeyhole />, title: '暂无查看权限', copy: '请联系管理员申请访问权限。', action: '返回演示' },
  };
  if (state === 'loading') return <div className="neo-feedback-outcome" role="status"><span className="neo-feedback-spinner" />正在加载示例记录…</div>;
  const item = content[state];
  return <div className={`neo-feedback-outcome neo-feedback-outcome--${state}`} data-motion={level} role="status"><span className="neo-feedback-icon" aria-hidden="true">{item.icon}</span><strong>{item.title}</strong><p>{item.copy}</p>{item.action && <SoftButton onClick={retry}>{item.action}</SoftButton>}</div>;
}

export function FeedbackDemo({ notify }: { notify: (message: string) => void }) {
  const { level } = useMotion();
  const [outcome, setOutcome] = useState<LoadOutcome>('success');
  const [state, setState] = useState<LoadState>('idle');
  const [skeleton, setSkeleton] = useState(false);
  const [progress, setProgress] = useState(0);
  const [saved, setSaved] = useState(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  function load(next = outcome) {
    clearTimers(); setState('loading'); setSkeleton(false); setProgress(0);
    timers.current.push(setTimeout(() => setSkeleton(true), 300));
    [20, 45, 70, 100].forEach((value, i) => timers.current.push(setTimeout(() => setProgress(value), (i + 1) * 700)));
    timers.current.push(setTimeout(() => { setState(next); setSkeleton(false); notify(next === 'success' ? '示例记录已就绪' : '已展示所选反馈状态'); }, 2800));
  }
  function reset() { clearTimers(); setState('idle'); setSkeleton(false); setProgress(0); }
  return <DemoSection title="加载状态演练">
    <div className="neo-feedback-controls"><label htmlFor="neo-load-result">模拟结果<select id="neo-load-result" value={outcome} onChange={event => setOutcome(event.target.value as LoadOutcome)} disabled={state === 'loading'}>{outcomes.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><SoftButton variant="primary" onClick={() => load()} disabled={state === 'loading'}><Play size={16} />开始加载</SoftButton><SoftButton onClick={reset}><RefreshCw size={16} />重置</SoftButton></div>
    <div className="neo-loading-progress"><div><span>{state === 'loading' ? '正在加载示例数据' : state === 'idle' ? '本地模拟进度' : '演示已结束'}</span><strong>{progress}%</strong></div><div role="progressbar" aria-label="本地模拟加载进度" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="neo-progress-track"><span style={{ transform: `scaleX(${progress / 100})` }} /></div></div>
    <div className="neo-skeleton-gallery" data-motion={level} aria-busy={state === 'loading'}>{(['metrics', 'card', 'table', 'detail'] as const).map((variant, index) => <div className="neo-skeleton-sample" key={variant}><h3>{['指标骨架', '卡片骨架', '表格骨架', '详情骨架'][index]}</h3>{state === 'loading' && !skeleton ? <div className="neo-skeleton-delay"><span>准备加载…</span></div> : state === 'success' ? <div className="neo-skeleton-success"><Check size={22} aria-hidden="true" /><strong>{['128 条线索', '南京示例服务中心', '3 条记录', '客户资料已就绪'][index]}</strong><span>示例数据</span></div> : state === 'loading' || state === 'idle' ? <Skeleton variant={variant} active={skeleton} /> : <div className="neo-skeleton-finished"><span>{outcomes.find(item => item.value === state)?.label}</span></div>}</div>)}</div>
    <div className="neo-feedback-stage"><Outcome state={state} retry={() => state === 'forbidden' ? reset() : load('success')} /></div>
    <div className="neo-feedback-inline"><CheckCircle2 size={18} aria-hidden="true" /><span>{saved ? '示例记录已保存' : '已撤销示例保存'}</span><SoftButton variant="quiet" onClick={() => { setSaved(value => !value); notify(saved ? '已撤销本地示例操作' : '本地示例已重新保存'); }}>{saved ? '撤销示例操作' : '重新保存'}</SoftButton></div>
  </DemoSection>;
}
