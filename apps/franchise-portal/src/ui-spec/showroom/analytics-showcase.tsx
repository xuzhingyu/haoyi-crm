import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactElement, type ReactNode, type RefObject } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { useMotion } from './kit';
import './analytics-showcase.css';

export type AnalyticsData = {
  label: string; signed: number; trained: number; revenue: number;
  cities: number[]; trend: number[]; spent: number; reserved: number;
};

// Source references: ui.shadcn.com/docs/components/chart and the official
// chart-area-interactive / chart-bar-interactive registry examples. The local
// Card composition and ChartConfig retain this showroom's semantic CSS tokens.
type ChartConfig = Record<string, { label: string; color: string }>;
const chartConfig = {
  count: { label: '新增线索', color: 'var(--neo-blue)' },
  training: { label: '培训完成', color: 'var(--neo-cyan)' },
} satisfies ChartConfig;
const trainingTarget = 36;
const number = new Intl.NumberFormat('zh-CN');
const amount = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function CardHeader({ children }: { children: ReactNode }) { return <header className="neo-analytics-card-header">{children}</header>; }
function CardTitle({ id, children }: { id: string; children: ReactNode }) { return <h3 id={id} className="neo-analytics-card-title">{children}</h3>; }
function CardContent({ children }: { children: ReactNode }) { return <div className="neo-analytics-card-content">{children}</div>; }
function CardFooter({ children }: { children: ReactNode }) { return <footer className="neo-analytics-card-footer">{children}</footer>; }

function subscribeVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}
function useChartVisibility(ref: RefObject<HTMLDivElement | null>) {
  const [inView, setInView] = useState(true);
  const shown = useSyncExternalStore(subscribeVisibility, () => !document.hidden, () => true);
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => setInView(entries.some(entry => entry.isIntersecting)));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return inView && shown;
}

function ChartViewport({ children, radial = false }: { children: ReactElement; radial?: boolean }) {
  // initialDimension provides deterministic fallback rendering when ResizeObserver
  // is unavailable; measured browser dimensions always own the chart viewport.
  return <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: radial ? 280 : 640, height: radial ? 250 : 300 }}>{children}</ResponsiveContainer>;
}

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload.length) return null;
  const value = payload[0]?.value;
  return <div className="neo-analytics-tooltip">
    <span>{label}</span>
    <div><i aria-hidden="true" />{chartConfig.count.label}<strong>{typeof value === 'number' ? number.format(value) : '—'}<small> 条</small></strong></div>
  </div>;
}

export function AnalyticsShowcase({ data, replayKey = 0 }: { data: AnalyticsData; replayKey?: number }) {
  const { level } = useMotion();
  const [period, setPeriod] = useState('7');
  const [view, setView] = useState<'area' | 'bar'>('area');
  const [table, setTable] = useState(false);
  const trendRef = useRef<HTMLDivElement>(null);
  const radialRef = useRef<HTMLDivElement>(null);
  const trendVisible = useChartVisibility(trendRef);
  const radialVisible = useChartVisibility(radialRef);
  const id = useId();
  const trendId = `${id}-trend`;
  const radialId = `${id}-training`;
  const rows = data.trend.map((count, index) => ({ day: `第 ${index + 1} 日`, count })).slice(-Number(period));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const latest = rows.at(-1)?.count;
  const percentage = Math.round(data.trained / trainingTarget * 100);
  const remaining = trainingTarget - data.trained;
  const duration = level === 'rich' ? 900 : 240;
  const trendAnimated = level !== 'off' && trendVisible;
  const radialAnimated = level !== 'off' && radialVisible;
  // Replacing the chart cancels Recharts' running interpolation immediately on
  // motion/visibility changes. Source values and text are never interpolated.
  const sourceKey = `${data.trend.join(',')}:${data.trained}:${replayKey}:${level}`;
  const trendMotion = { isAnimationActive: trendAnimated, animationDuration: duration, animationEasing: 'ease-out' as const };
  const axes = <>
    <CartesianGrid vertical={false} stroke="var(--neo-chart-grid)" strokeDasharray="3 5" />
    <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={12} minTickGap={16} tick={{ fill: 'var(--neo-muted)', fontSize: 12 }} />
    <YAxis width={34} tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} domain={[0, 'auto']} tick={{ fill: 'var(--neo-muted)', fontSize: 12 }} />
    <Tooltip content={ChartTooltip} isAnimationActive={false} cursor={{ stroke: 'var(--neo-cyan)', strokeWidth: 1, strokeDasharray: '4 4' }} />
  </>;
  return <section className="neo-analytics" aria-label="经营趋势概览">
    <article className="neo-analytics-card neo-analytics-trend" aria-labelledby={trendId}>
      <CardHeader>
        <div><CardTitle id={trendId}>线索趋势</CardTitle><p>单位：条</p></div>
        <div className="neo-analytics-controls">
          <fieldset className="neo-analytics-switch"><legend className="neo-analytics-sr">趋势图样式</legend>
            {(['area', 'bar'] as const).map(value => <label key={value}><input type="radio" name={`${id}-view`} value={value} checked={view === value} onChange={() => setView(value)} /><span>{value === 'area' ? '面积' : '柱状'}</span></label>)}
          </fieldset>
          <label className="neo-analytics-period"><span className="neo-analytics-sr">趋势时间范围</span><select value={period} onChange={event => setPeriod(event.target.value)}><option value="7">全部 7 日</option><option value="3">近 3 日</option></select></label>
        </div>
      </CardHeader>
      <CardContent>
        <div className="neo-analytics-reading"><strong>{number.format(total)}<small> 条</small></strong><span>{rows.length} 日新增线索</span></div>
        <div ref={trendRef} className="neo-analytics-plot" data-motion={trendAnimated ? level : 'off'}>
          {table ? <div className="neo-analytics-table-scroll"><table><caption className="neo-analytics-sr">线索趋势明细</caption><thead><tr><th scope="col">日期</th><th scope="col">新增线索（条）</th></tr></thead><tbody>{rows.map(row => <tr key={row.day}><th scope="row">{row.day}</th><td>{number.format(row.count)}</td></tr>)}</tbody></table></div> : <ChartViewport key={`${sourceKey}:${period}:${view}:${trendAnimated}`}>
            {view === 'area' ? <AreaChart data={rows} accessibilityLayer aria-label="线索趋势，方向键查看各日数据" margin={{ top: 16, right: 12, bottom: 8, left: 0 }}>
              <defs><linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={chartConfig.count.color} stopOpacity={0.24} /><stop offset="100%" stopColor={chartConfig.count.color} stopOpacity={0.015} /></linearGradient></defs>
              {axes}<Area type="monotone" dataKey="count" name={chartConfig.count.label} stroke={chartConfig.count.color} fill={`url(#${id}-fill)`} strokeWidth={2.5} activeDot={{ r: 5, stroke: 'var(--neo-paper)', strokeWidth: 3 }} {...trendMotion} />
            </AreaChart> : <BarChart data={rows} accessibilityLayer aria-label="线索柱状图，方向键查看各日数据" margin={{ top: 16, right: 12, bottom: 8, left: 0 }}>
              {axes}<Bar dataKey="count" name={chartConfig.count.label} fill={chartConfig.count.color} radius={[5, 5, 0, 0]} maxBarSize={44} {...trendMotion} />
            </BarChart>}
          </ChartViewport>}
        </div>
        {!table && <p className="neo-analytics-sr">{rows.map(row => `${row.day}新增线索 ${row.count} 条`).join('；')}。</p>}
      </CardContent>
      <CardFooter><span className="neo-analytics-series"><i aria-hidden="true" />新增线索{latest !== undefined && <strong>末日 {latest} 条</strong>}</span><button type="button" className="neo-analytics-text-button" aria-expanded={table} onClick={() => setTable(value => !value)}>{table ? '返回趋势图' : '趋势数据表'}</button></CardFooter>
    </article>
    <article className="neo-analytics-card neo-analytics-training" aria-labelledby={radialId}>
      <CardHeader><div><CardTitle id={radialId}>培训目标</CardTitle><p>按完成记录统计</p></div><span className="neo-analytics-goal">目标 {trainingTarget}</span></CardHeader>
      <CardContent><div ref={radialRef} className="neo-analytics-radial" data-motion={radialAnimated ? level : 'off'}>
        <ChartViewport radial key={`${sourceKey}:${radialAnimated}`}><RadialBarChart data={[{ name: '培训完成', value: data.trained }]} innerRadius="76%" outerRadius="96%" startAngle={90} endAngle={-270} barSize={16} accessibilityLayer aria-label={`培训已完成 ${data.trained} 条，目标 ${trainingTarget} 条，${percentage}%`}>
          <PolarAngleAxis type="number" domain={[0, Math.max(trainingTarget, data.trained)]} tick={false} />
          <RadialBar dataKey="value" fill={chartConfig.training.color} background={{ fill: 'var(--neo-chart-track)' }} cornerRadius={12} isAnimationActive={radialAnimated} animationDuration={duration} animationEasing="ease-out" />
        </RadialBarChart></ChartViewport>
        <div className="neo-analytics-radial-value" aria-hidden="true"><strong>{percentage}<small>%</small></strong><span>目标完成度</span></div>
      </div><div className="neo-analytics-training-count"><strong>{number.format(data.trained)}<span> / {trainingTarget} 条</span></strong><p>{remaining > 0 ? `还需完成 ${remaining} 条记录` : remaining < 0 ? `超出目标 ${-remaining} 条记录` : '已完成本组目标'}</p></div></CardContent>
      <CardFooter><span>完成记录 / 目标记录</span></CardFooter>
    </article>
    <dl className="neo-analytics-summary">
      <div><dt>签约记录</dt><dd>{number.format(data.signed)}<small> 家</small></dd></div>
      <div><dt>预计管道金额</dt><dd><small>¥ </small>{amount.format(data.revenue)}</dd></div>
      <div><dt>区域线索合计</dt><dd>{number.format(data.cities.reduce((sum, value) => sum + value, 0))}<small> 条</small></dd></div>
      <div><dt>预算剩余</dt><dd><small>¥ </small>{amount.format(20 - data.spent - data.reserved)}</dd></div>
    </dl>
  </section>;
}
