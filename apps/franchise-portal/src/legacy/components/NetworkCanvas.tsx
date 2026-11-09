import { Component, lazy, Suspense, useMemo, useState, type ReactNode, type WheelEvent } from 'react'
import { Crosshair, Minus, Plus } from 'lucide-react'
import mapUrl from '../assets/maps/china-provinces.svg?url'
import { useMapView } from '../hooks/useMapView'
import type { Region } from '../services/api'
import { createNetworkMapModel, nodeKeyForRegion, type MapLayer, type MapRisk, type MapViewState } from './networkMapModel'
import type { ProjectedNodePosition } from './ChinaMap3D'

const ChinaMap3D = lazy(() => import('./ChinaMap3D'))

type Props = {
  regions: Region[]
  selected: Region | null
  onSelect: (region: Region | null) => void
  risks?: MapRisk[]
  view?: MapViewState
  onViewChange?: (view: MapViewState) => void
}
type BoundaryProps = { children: ReactNode; onError: () => void }

const LAYERS: Array<{ id: MapLayer; label: string }> = [
  { id: 'network', label: '全部' },
  { id: 'pending', label: '待处理' },
  { id: 'focus', label: '重点机会' },
  { id: 'franchise', label: '加盟网络' },
  { id: 'risk', label: '交付风险' },
]

class MapLoadBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.failed ? null : this.props.children }
}

const supportsWebGL2 = () => {
  if (typeof window === 'undefined' || typeof window.WebGL2RenderingContext === 'undefined') return false
  try { return Boolean(document.createElement('canvas').getContext('webgl2')) } catch { return false }
}

function FallbackMap() {
  return <div className="map-fallback"><img src={mapUrl} alt="中国省级行政区轮廓图" /></div>
}

export function NetworkCanvas({ regions, selected, onSelect, risks = [], view, onViewChange }: Props) {
  const mapView = useMapView(view, onViewChange)
  const model = useMemo(() => createNetworkMapModel(regions, mapView.view, risks), [regions, mapView.view, risks])
  const [zoom, setZoom] = useState(1)
  const [webglFailed, setWebglFailed] = useState(false)
  const [webglAvailable] = useState(supportsWebGL2)
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const [projected, setProjected] = useState<Record<string, ProjectedNodePosition>>({})
  const configured3d = import.meta.env.VITE_ENABLE_3D_MAP !== 'false'
  const use3d = configured3d && !webglFailed && webglAvailable
  const selectedKey = selected ? nodeKeyForRegion(selected) : null

  if (!regions.length) return <section className="network empty"><p>暂无可展示的加盟网络节点</p></section>

  const changeZoom = (next: number) => setZoom(Math.min(1.24, Math.max(0.88, Number(next.toFixed(2)))))
  const handleWheel = (event: WheelEvent<HTMLElement>) => {
    if (!use3d) return
    event.preventDefault()
    changeZoom(zoom + (event.deltaY < 0 ? 0.08 : -0.08))
  }
  const updateProjectedPositions = (positions: ProjectedNodePosition[]) => {
    const next = Object.fromEntries(positions.map((position) => [position.key, position]))
    setProjected((current) => {
      const keys = Object.keys(next)
      if (keys.length === Object.keys(current).length && keys.every((key) => current[key]?.left === next[key].left && current[key]?.top === next[key].top)) return current
      return next
    })
  }

  const activateNode = (region: Region) => {
    if (mapView.view.level === 'national' && region.province) {
      mapView.enterProvince(region.province)
      onSelect(region)
      return
    }
    if (mapView.view.level === 'province' && region.city) mapView.enterCity(region.city)
    onSelect(region)
  }

  const clearSelection = () => { if (selected) onSelect(null) }
  const isMapChrome = (target: EventTarget | null) => {
    const element = target instanceof Element ? target : null
    return Boolean(element?.closest('.map-node, .selected-card, .map-legend, .map-controls, .map-layers, .map-breadcrumb, .map-title'))
  }
  const handleBackgroundPointer = (event: { target: EventTarget | null }) => {
    if (!selected || isMapChrome(event.target)) return
    const element = event.target instanceof Element ? event.target : null
    if (element?.closest('.map-webgl-canvas, .map-webgl-host')) return
    clearSelection()
  }

  const locatedNodes = model.nodes.filter((node) => node.position)
  const unlocatedNodes = model.nodes.filter((node) => !node.position)
  const leadTotal = model.nodes.reduce((sum, node) => sum + node.region.lead_total, 0)
  const orderCapacity = model.nodes.reduce((sum, node) => sum + node.region.monthly_order_capacity, 0)
  const announcement = mapView.view.level === 'national'
    ? '全国视图'
    : mapView.view.level === 'province'
      ? `已进入${mapView.view.province}`
      : `已进入${mapView.view.city}`

  return <section className={use3d ? 'network network-3d' : 'network network-2d'} aria-label="加盟网络态势" onWheel={handleWheel} onClick={handleBackgroundPointer}>
    <div className="map-scene">
      {use3d ? <MapLoadBoundary onError={() => setWebglFailed(true)}><Suspense fallback={<FallbackMap />}><ChinaMap3D nodes={model.nodes} hubs={model.hubs} edges={model.edges} zoom={zoom} view={mapView.view} hoveredKey={hoveredKey} selectedKey={selectedKey} onPick={activateNode} onClear={clearSelection} onHover={setHoveredKey} onProjectionChange={updateProjectedPositions} onError={() => setWebglFailed(true)} /></Suspense></MapLoadBoundary> : <FallbackMap />}
    </div>

    <div className="map-title"><span>Regional Franchise Network</span><h2>区域加盟网络</h2><p>全国加盟网络分布与发展态势</p></div>
    <div className="map-live" aria-live="polite">{announcement}</div>
    <nav className="map-breadcrumb" aria-label="地图层级">
      {mapView.view.level === 'national' ? <span aria-current="page">全国</span> : <button type="button" onClick={mapView.goNational} aria-label="返回全国视图">全国</button>}
      {mapView.view.province && (mapView.view.level === 'province' ? <span aria-current="page">{mapView.view.province}</span> : <button type="button" onClick={mapView.goBack}>{mapView.view.province}</button>)}
      {mapView.view.city && <span aria-current="page">{mapView.view.city}</span>}
    </nav>
    <fieldset className="map-layers" aria-label="地图图层">
      {LAYERS.map((layer) => <label key={layer.id}><input type="radio" name="map-layer" checked={(mapView.view.layer ?? 'network') === layer.id} onChange={() => mapView.setLayer(layer.id)} />{layer.label}</label>)}
    </fieldset>

    <div className="map-node-layer">
      {locatedNodes.map((node) => {
        const position = use3d && projected[node.key]
          ? [projected[node.key].left, projected[node.key].top]
          : node.position!
        const label = mapView.view.level === 'national' && node.region.province
          ? `进入${node.region.province}`
          : `查看${node.region.city ?? node.region.province ?? '其他地区'}网络节点`
        return <button
          key={node.key}
          style={{ left: `${position[0]}%`, top: `${position[1]}%` }}
          className={`map-node ${node.activityTier}${selectedKey === node.key || hoveredKey === node.key ? ' selected' : ''}`}
          aria-label={label}
          title={`${node.region.city ?? node.region.province} · ${node.businessArea}`}
          onMouseEnter={() => setHoveredKey(node.key)}
          onMouseLeave={() => setHoveredKey(null)}
          onClick={() => activateNode(node.region)}
        ><i /><span>{node.region.city ?? node.region.province}</span></button>
      })}
      {unlocatedNodes.map((node) => <button key={node.key} className={`map-node unlocated ${selectedKey === node.key ? 'selected' : ''}`} aria-label="查看其他地区网络节点" onClick={() => activateNode(node.region)}><i /><span>其他地区</span></button>)}
    </div>

    <aside className="map-legend" aria-label="地图图例">
      <h3>活跃度</h3>
      <p><span><i className="legend-dot signed" />高活跃</span><b>{model.nodes.filter((node) => node.activityTier === 'signed').length}</b></p>
      <p><span><i className="legend-dot focus" />中等</span><b>{model.nodes.filter((node) => node.activityTier === 'focus').length}</b></p>
      <p><span><i className="legend-dot standard" />低活跃</span><b>{model.nodes.filter((node) => node.activityTier === 'standard').length}</b></p>
      <p><span><i className="legend-dot risk" />风险</span><b>{model.nodes.filter((node) => node.activityTier === 'risk').length}</b></p>
      <div><span>地区节点 <b>{model.nodes.length}</b></span><span>线索 <b>{leadTotal}</b></span><span>订单容量 <b>{orderCapacity}</b></span></div>
    </aside>

    {use3d && <div className="map-controls" aria-label="地图缩放控制">
      <button type="button" aria-label="放大地图" disabled={zoom >= 1.24} onClick={() => changeZoom(zoom + 0.12)}><Plus /></button>
      <button type="button" aria-label="缩小地图" disabled={zoom <= 0.88} onClick={() => changeZoom(zoom - 0.12)}><Minus /></button>
      <button type="button" aria-label="恢复地图视角" disabled={zoom === 1 && mapView.view.level === 'national'} onClick={() => { changeZoom(1); mapView.goNational() }}><Crosshair /></button>
    </div>}

    <p className="map-disclaimer">大区连线仅表示区域分组 · 开发底图，公开发布前需完成地图审核</p>

    {selected && <article className="selected-card" onClick={(event) => event.stopPropagation()} style={selectedKey && projected[selectedKey] ? { left: `${Math.min(72, projected[selectedKey].left + 5)}%`, top: `${Math.max(10, projected[selectedKey].top - 10)}%` } : undefined}><div><h3>{selected.city ?? selected.province}加盟网络</h3><span>已选择</span></div><p>线索总数 {selected.lead_total}</p><p>已签约 {selected.franchise_total ?? 0} 家</p><p>月订单容量 {selected.monthly_order_capacity}</p></article>}
  </section>
}
