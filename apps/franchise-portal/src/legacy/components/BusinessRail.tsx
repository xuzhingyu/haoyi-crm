import { CheckSquare, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import type { ActionItem, Dashboard } from '../services/api'

type Props = {
  dashboard: Dashboard
  period: string
  done: boolean
  onToggle: () => void
  actions?: ActionItem[]
  onFocus?: (action: ActionItem) => void
  onComplete?: (action: ActionItem) => void
}
export function BusinessRail({ dashboard, period, done, onToggle, actions = [], onFocus, onComplete }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const risks = dashboard.risks.slice(0, 4)
  const taskName = risks[0] ? `跟进${risks[0].shop_name}` : `复核${period}经营数据`
  const persistent = actions.filter((item) => !item.done).slice(0, 8)
  const goals = dashboard.goals
  return <aside className="business-rail" aria-label="经营业务栏">
    <section className="rail-panel"><div className="panel-head"><h2>{period}概览</h2><button type="button" aria-label={collapsed ? '展开概览' : '收起概览'} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}><ChevronUp style={{ transform: collapsed ? 'rotate(180deg)' : undefined }} /></button></div>{!collapsed && <><div className="metric-row"><span>线索总数<b>{dashboard.metrics.lead_total}</b></span><span>商机总数<b>{dashboard.metrics.opportunity_total}</b></span></div>{goals && <p className="rail-note">本月目标：合格加盟 {goals.qualified_franchise_opportunities} · 签约 {goals.signed_franchises} · 合格渠道 {goals.qualified_channel_opportunities}</p>}{persistent.length ? persistent.map((item) => <div className="task-row" key={item.id}><button type="button" className="task-button" onClick={() => onFocus?.(item)}><span>{item.title}<small>{item.detail || item.due_date || '待处理'}</small></span></button>{onComplete && <button type="button" className="task-complete" aria-label={`完成${item.title}`} title="标记完成" onClick={() => onComplete(item)}><CheckSquare aria-hidden="true" /></button>}</div>) : <label className={done ? 'task done' : 'task'}><input aria-label={taskName} checked={done} onChange={onToggle} type="checkbox" /><span>{taskName}<small>{risks[0]?.reason ?? '基于当前 API 数据'}</small></span><CheckSquare aria-hidden="true" /></label>}</>}</section>
    <section className="rail-panel"><div className="panel-head"><h2>加盟网络</h2></div><div className="metric-row"><span>加盟门店<b>{dashboard.metrics.franchise_total}</b></span><span>月订单容量<b>{dashboard.metrics.monthly_order_capacity}</b></span></div>{dashboard.regions.length ? <p className="rail-note">覆盖 {dashboard.regions.length} 个地区节点</p> : <p className="rail-note">暂无加盟网络数据</p>}</section>
    <section className="rail-panel compact"><div className="panel-head"><h2>逾期跟进 <span className="red">{risks.length}</span></h2></div>{risks.length ? risks.map((risk) => <button type="button" className="risk" key={risk.follow_up_id} onClick={() => onFocus?.({ id: risk.follow_up_id, kind: 'follow_up', title: risk.shop_name, detail: risk.reason, province: null, city: null, due_date: risk.due_date, done: false, href: `#/leads?id=${risk.lead_id}` })}>{risk.shop_name}<b>{risk.reason}</b></button>) : <p>暂无逾期跟进</p>}</section>
    <section className="rail-panel compact"><div className="panel-head"><h2>培训交付</h2></div><div className="metric-row"><span>已完成<b>{dashboard.training.completed}</b></span><span>计划培训<b>{dashboard.training.total}</b></span></div><p className="rail-note">完成率 {Math.round(dashboard.training.completion_rate * 100)}%{dashboard.unknowns ? ` · 未知项 ${dashboard.unknowns.application_unknown}` : ''}</p>{dashboard.updated_at && <p className="rail-note">更新于 {dashboard.updated_at}</p>}</section>
  </aside>
}
