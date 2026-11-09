import type { Dashboard } from '../services/api'

export function Analytics({ dashboard, period }: { dashboard: Dashboard; period: string }) {
  const completion = Math.round(dashboard.training.completion_rate * 100)
  const signed = dashboard.metrics.franchise_total
  return <section className="analytics" aria-label="经营分析">
    <article><div className="analytic-head"><h2>线索与签约趋势</h2><span>{period}</span></div><div className="stats"><p>线索数<strong>{dashboard.metrics.lead_total}</strong></p><p>签约数<strong>{signed}</strong></p></div><div className="metric-bars"><p>预计管道价值 <b>{dashboard.metrics.estimated_pipeline_value}</b></p><p>月订单容量 <b>{dashboard.metrics.monthly_order_capacity}</b></p></div></article>
    <article><div className="analytic-head"><h2>加盟转化漏斗</h2><span>{period}</span></div>{dashboard.funnel.length ? <div className="funnel">{dashboard.funnel.map((entry, index) => <div className={`funnel-step step-${index % 4}`} key={entry.stage}><span>{entry.stage}</span><b>{entry.count}</b></div>)}</div> : <p className="empty-copy">暂无转化漏斗数据</p>}</article>
    <article><div className="analytic-head"><h2>培训完成率</h2><span>{period}</span></div><div className="completion"><div className="donut" style={{ '--rate': `${completion * 3.6}deg` } as React.CSSProperties}><strong>{completion}%<small>整体完成率</small></strong></div><div className="completion-copy"><p>已完成培训 <b>{dashboard.training.completed} 人次</b></p><p>计划培训 <b>{dashboard.training.total} 人次</b></p></div></div></article>
  </section>
}
