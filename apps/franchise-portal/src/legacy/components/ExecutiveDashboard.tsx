import { Download, Expand, Handshake, Target, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Region } from '../services/api'
import { api, type Dashboard } from '../services/api'
import { NetworkCanvas } from './NetworkCanvas'
import type { MapViewState } from './networkMapModel'

export function ExecutiveDashboard() {
  const [period, setPeriod] = useState('本月')
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Region | null>(null)
  const [report, setReport] = useState<{ pdf_url: string; pptx_url: string } | null>(null)
  const [reportPending, setReportPending] = useState(false)
  const [reportError, setReportError] = useState('')
  const [mapView, setMapView] = useState<MapViewState>({ level: 'national', layer: 'franchise' })
  const [snapshotMode, setSnapshotMode] = useState<'live' | 'frozen'>('live')

  const [snapshots, setSnapshots] = useState<{ id: number; period: string; version: number; frozen_at?: string }[]>([])
  const [snapshotId, setSnapshotId] = useState<number | null>(null)
  const [liveData, setLiveData] = useState<Dashboard | null>(null)

  useEffect(() => {
    let alive = true
    setLiveData(null); setError(''); setSelected(null); setReport(null); setReportError('')
    api.dashboard(period, undefined, 'executive')
      .then((next) => { if (!next?.metrics) throw new Error('invalid executive dashboard'); if (alive) setLiveData(next) })
      .catch(() => alive && setError('暂时无法加载领导经营数据'))
    api.snapshots().then((rows) => alive && setSnapshots(Array.isArray(rows) ? rows : [])).catch(() => undefined)
    return () => { alive = false }
  }, [period])

  useEffect(() => {
    if (snapshotMode !== 'frozen' || !snapshots.length) return
    const latest = snapshots.find((item) => item.period === period) ?? snapshots[0]
    setSnapshotId(latest.id)
    void api.snapshot(latest.id).then((item) => { if (item.payload?.metrics) setData(item.payload) }).catch(() => undefined)
  }, [snapshotMode, snapshots, period])

  useEffect(() => {
    if (snapshotMode === 'live') setData(liveData)
  }, [snapshotMode, liveData])

  const createReport = async () => {
    setReportPending(true); setReportError(''); setReport(null)
    try {
      const listed = await api.reports() as unknown
      const items = Array.isArray(listed) ? listed : [listed]
      const published = items.find((item: { pdf_url?: string }) => item?.pdf_url)
      if (!published) throw new Error('no published report')
      setReport({ pdf_url: published.pdf_url, pptx_url: published.pptx_url })
    }
    catch { setReportError('报告导出失败，请稍后重试') }
    finally { setReportPending(false) }
  }
  const fullScreen = () => void document.documentElement.requestFullscreen?.()

  if (!data && !error) return <section className="executive-dashboard"><ExecutiveHeader period={period} onPeriod={setPeriod} onFullScreen={fullScreen} onReport={createReport} reportPending={reportPending} snapshotMode={snapshotMode} onSnapshotMode={setSnapshotMode} /><div className="loading" aria-label="领导驾驶舱加载中"><i /><i /><i /></div></section>
  if (error) return <section className="executive-dashboard"><ExecutiveHeader period={period} onPeriod={setPeriod} onFullScreen={fullScreen} onReport={createReport} reportPending={reportPending} snapshotMode={snapshotMode} onSnapshotMode={setSnapshotMode} /><div className="error-state" role="alert">{error}</div></section>
  if (!data) return null

  const summary = [`本期有效线索 ${data.metrics.lead_total} 条`, `重点商机 ${data.metrics.opportunity_total} 项`, `累计加盟 ${data.metrics.franchise_total} 家`, `培训完成率 ${Math.round(data.training.completion_rate * 100)}%`]
  const risks = data.regions.filter((region) => (region.delivery_risks ?? 0) > 0)
  return <section className="executive-dashboard">
    <ExecutiveHeader period={period} onPeriod={setPeriod} onFullScreen={fullScreen} onReport={createReport} reportPending={reportPending} snapshotMode={snapshotMode} onSnapshotMode={setSnapshotMode} />
    <div className="executive-kpis"><Kpi icon={<Users />} label="有效线索" value={data.metrics.lead_total} /><Kpi icon={<Target />} label="重点商机" value={data.metrics.opportunity_total} /><Kpi icon={<Handshake />} label="本期签约" value={data.metrics.franchise_total} /><Kpi icon={<Users />} label="培训完成率" value={`${Math.round(data.training.completion_rate * 100)}%`} /></div>
    <div className="ai-summary" aria-label="可追溯经营摘要"><strong>经营摘要</strong>{summary.map((line) => <span key={line}>{line}</span>)}{data.updated_at && <span>更新于 {data.updated_at}</span>}</div>
    <div className="executive-board executive-board-wide">
      <aside className="executive-rail">
        <ReadOnlyPanel title="本期目标" rows={data.goals ? [`合格加盟机会 ${data.goals.qualified_franchise_opportunities}`, `签约 ${data.goals.signed_franchises}`, `合格渠道机会 ${data.goals.qualified_channel_opportunities}`] : [`线索总数 ${data.metrics.lead_total}`, `加盟门店 ${data.metrics.franchise_total}`]} />
        <ReadOnlyPanel title="重点商机" rows={data.funnel.length ? data.funnel.slice(0, 4).map((item) => `${item.stage} ${item.count} 项 · ${item.estimated_value.toLocaleString()} 元`) : ['暂无可展示的重点商机']} />
      </aside>
      <main className="content executive-map"><NetworkCanvas regions={data.regions} selected={selected} onSelect={setSelected} risks={risks} view={mapView} onViewChange={setMapView} /></main>
      <aside className="executive-rail">
        <ReadOnlyPanel title="交付健康" rows={[`已完成培训 ${data.training.completed}`, `未知应用 ${data.unknowns?.application_unknown ?? 0}`, data.training.total > data.training.completed ? '待完成课程需协调资源' : '培训节奏正常']} />
        <ReadOnlyPanel title="风险" rows={data.risks.length ? data.risks.slice(0, 3).map((item) => `${item.shop_name}：${item.reason}`) : ['暂无逾期跟进风险']} />
        <ReadOnlyPanel title="需要协调" rows={data.unknowns?.missing_next_action ? [`${data.unknowns.missing_next_action} 个机会缺少下一步`] : ['暂无需要协调事项']} />
      </aside>
    </div>
    <ExecutiveAnalytics dashboard={data} />
    {reportError && <p className="action-error" role="alert">{reportError}</p>}
    {report && <div className="report-actions" role="status">报告已生成<a href={report.pdf_url} download>下载 PDF</a><a href={report.pptx_url} download>下载 PPT</a>{snapshotId && snapshotMode === 'frozen' && <span>冻结版本 #{snapshotId}</span>}</div>}
  </section>
}

function ExecutiveHeader({ period, onPeriod, onFullScreen, onReport, reportPending, snapshotMode, onSnapshotMode }: { period: string; onPeriod: (period: string) => void; onFullScreen: () => void; onReport: () => void; reportPending: boolean; snapshotMode: 'live' | 'frozen'; onSnapshotMode: (mode: 'live' | 'frozen') => void }) {
  return <header className="topbar"><div><h1>经营概览</h1><p>加盟经营全局只读概览，指标均可追溯至原始业务记录</p></div><div className="top-actions"><label>筛选周期<select aria-label="领导筛选周期" value={period} onChange={(event) => onPeriod(event.target.value)}><option>本月</option><option>上月</option><option>本季度</option></select></label><button onClick={() => onSnapshotMode(snapshotMode === 'live' ? 'frozen' : 'live')}>{snapshotMode === 'live' ? '查看冻结快照' : '返回实时数据'}</button><button onClick={onFullScreen}><Expand />全屏</button><button onClick={onReport} disabled={reportPending}><Download />{reportPending ? '生成中…' : '导出报告'}</button></div></header>
}

function ExecutiveAnalytics({ dashboard }: { dashboard: Dashboard }) {
  const rates = dashboard.regions.map((item) => item.lead_total ? (item.franchise_total ?? 0) / item.lead_total : null)
  const maxRate = Math.max(...rates.filter((rate): rate is number => rate !== null), 0.01)
  return <section className="executive-analytics" aria-label="经营数据分析">
    <article><h2>线索与签约趋势</h2><p className="empty-copy">暂无历史趋势数据</p></article>
    <article><h2>区域转化对比</h2>{dashboard.regions.length ? <div className="region-comparison">{dashboard.regions.map((item) => { const rate = item.lead_total ? (item.franchise_total ?? 0) / item.lead_total : null; return <div key={`${item.province}-${item.city}`}><span>{item.city ?? item.province ?? '未分配地区'}</span><i><b style={{ width: `${rate === null ? 0 : Math.max(8, rate / maxRate * 100)}%` }} /></i><em>{rate === null ? '—' : `${Math.round(rate * 100)}%`}</em></div> })}</div> : <p className="empty-copy">暂无区域数据</p>}</article>
    <article><h2>培训交付</h2><div className="training-overview"><strong>{Math.round(dashboard.training.completion_rate * 100)}%</strong><p>已完成 {dashboard.training.completed} / {dashboard.training.total} 家</p><small>完成率仅按已有培训记录统计，已授课不自动计为有效交付</small></div></article>
  </section>
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) { return <article><span>{icon}</span><p>{label}</p><strong>{value}</strong></article> }
function ReadOnlyPanel({ title, rows }: { title: string; rows: string[] }) { return <section className="rail-panel"><h2>{title}</h2>{rows.map((row) => <p className="rail-note" key={row}>{row}</p>)}</section> }
