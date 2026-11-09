import { Presence } from '../../ui/Presence';
import { useEffect, useState } from 'react'
import type { ActionItem, CityDetail, Region } from '../services/api'
import { api } from '../services/api'
import { Analytics } from './Analytics'
import { BusinessRail } from './BusinessRail'
import { DashboardTopbar } from './DashboardTopbar'
import { AiDialog, ImportDialog } from './Overlays'
import { NetworkCanvas } from './NetworkCanvas'
import { useDashboard } from '../hooks/useDashboard'
import type { MapViewState } from './networkMapModel'
import type { Route } from '../hooks/useHashRoute'
import { FeedbackBanner } from './operations'

export function PersonalDashboard({ onOpen }: { onOpen?: (route: Route, id?: number | null) => void }) {
  const [period, setPeriod] = useState('本月')
  const { data, error, refresh } = useDashboard(period)
  const [selected, setSelected] = useState<Region | null>(null)
  const [done, setDone] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [report, setReport] = useState<{ pdf_url: string; pptx_url: string } | null>(null)
  const [actions, setActions] = useState<ActionItem[]>([])
  const [mapView, setMapView] = useState<MapViewState>({ level: 'national', province: null, city: null, layer: 'network' })
  const [cityDetail, setCityDetail] = useState<CityDetail | null>(null)
  const [actionError, setActionError] = useState('')
  useEffect(() => { setSelected(null); setDone(false); setReport(null); setCityDetail(null) }, [period])
  useEffect(() => { setActions(Array.isArray(data?.actions) ? data!.actions! : []) }, [data])
  useEffect(() => {
    if (mapView.level !== 'city' || !mapView.province || !mapView.city) { setCityDetail(null); return }
    let alive = true
    setCityDetail(null)
    api.cityDetail(mapView.province, mapView.city).then((detail) => { if (alive) setCityDetail(detail?.city ? detail : null) }).catch(() => { if (alive) setCityDetail(null) })
    return () => { alive = false }
  }, [mapView.level, mapView.province, mapView.city])
  const focusAction = (action: ActionItem) => {
    if (action.href?.startsWith('#/')) {
      const raw = action.href.slice(2)
      const [path, query] = raw.split('?')
      const id = Number(new URLSearchParams(query || '').get('id'))
      onOpen?.(path as Route, Number.isFinite(id) && id > 0 ? id : null)
      return
    }
    if (action.city && action.province) setMapView({ level: 'city', province: action.province, city: action.city, layer: mapView.layer })
    else if (action.province) setMapView({ level: 'province', province: action.province, city: null, layer: mapView.layer })
  }
  const completeAction = async (action: ActionItem) => {
    setActionError('')
    try {
      await api.completeAction(action.id)
      setActions((current) => current.filter((item) => item.id !== action.id))
      refresh()
    } catch { setActionError('待办未保存，请重试；当前事项仍保留在列表中') }
  }
  if (!data && !error) return <div className="loading" aria-label="工作台加载中"><i /><i /><i /></div>
  if (error) return <div className="error-state" role="alert">暂时无法加载经营数据<button onClick={() => void refresh()}>重新加载</button></div>
  const risks = (data?.regions ?? []).filter((region) => (region.delivery_risks ?? 0) > 0)
  return <><FeedbackBanner error={actionError} /><DashboardTopbar period={period} onPeriodChange={setPeriod} onImport={() => setImportOpen(true)} onAi={() => setAiOpen(true)} aiOpen={aiOpen} report={report} onReport={setReport} /><div className="board"><BusinessRail dashboard={data!} period={period} done={done} onToggle={() => setDone(!done)} actions={actions} onFocus={focusAction} onComplete={completeAction} /><main className="content"><NetworkCanvas regions={data!.regions} selected={selected} onSelect={setSelected} risks={risks} view={mapView} onViewChange={setMapView} />{cityDetail && <section className="city-detail" aria-label="城市详情"><h2>{cityDetail.city} 经营详情</h2><p>门店 {cityDetail.leads.length} · 机会 {cityDetail.opportunities.length} · 加盟商 {cityDetail.franchises.length}</p><div className="city-actions">{cityDetail.leads.slice(0, 4).map((lead) => <button type="button" key={lead.id} onClick={() => onOpen?.('leads', lead.id)}>{lead.shop_name}</button>)}</div></section>}<Analytics dashboard={data!} period={period} /></main></div><Presence present={Boolean(importOpen)}>{importOpen && <ImportDialog close={() => setImportOpen(false)} onSuccess={refresh} />}</Presence><Presence present={Boolean(aiOpen)}>{aiOpen && <AiDialog period={period} region={selected} close={() => setAiOpen(false)} />}</Presence></>
}
