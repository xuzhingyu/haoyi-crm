import type { Region } from '../services/api'

export type BusinessArea = '华东' | '华南' | '华中' | '华北' | '西南' | '西北' | '东北' | '港澳台' | '其他'
export type ActivityTier = 'signed' | 'focus' | 'standard' | 'risk'
export type MapLevel = 'national' | 'province' | 'city'
export type MapLayer = 'pending' | 'focus' | 'franchise' | 'network' | 'risk'
export type MapPosition = readonly [leftPercent: number, topPercent: number]

export type MapViewState = {
  level: MapLevel
  province?: string | null
  city?: string | null
  layer?: MapLayer
}

export type MapRisk = { province?: string | null; city?: string | null }

export type NetworkMapNode = {
  key: string
  region: Region
  position: MapPosition | null
  businessArea: BusinessArea
  activityTier: ActivityTier
  locationSource: 'city' | 'province' | 'other'
}

export type NetworkMapHub = {
  area: BusinessArea
  position: MapPosition
}

export type NetworkMapEdge = {
  key: string
  area: BusinessArea
  from: MapPosition
  to: MapPosition
}

export type NetworkMapModel = {
  nodes: NetworkMapNode[]
  hubs: NetworkMapHub[]
  edges: NetworkMapEdge[]
}

const GEO_BOUNDS = { west: 73, east: 136, south: 17, north: 54 }
const normalizeCity = (city: string | null) => city?.replace(/(?:市|地区|自治州)$/, '') ?? ''
const normalizeProvince = (province: string | null) => province?.replace(/(?:省|市|壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区)$/, '') ?? ''

const percentFromLongitudeLatitude = (longitude: number, latitude: number): MapPosition => [
  ((longitude - GEO_BOUNDS.west) / (GEO_BOUNDS.east - GEO_BOUNDS.west)) * 100,
  ((GEO_BOUNDS.north - latitude) / (GEO_BOUNDS.north - GEO_BOUNDS.south)) * 100,
]

const CITY_COORDINATES: Record<string, readonly [number, number]> = {
  北京: [116.4074, 39.9042], 上海: [121.4737, 31.2304], 南京: [118.7969, 32.0603],
  苏州: [120.5853, 31.2989], 无锡: [120.3119, 31.4912], 常州: [119.9741, 31.8112],
  徐州: [117.2841, 34.2058], 南通: [120.8943, 31.9802], 扬州: [119.421, 32.3932],
  镇江: [119.425, 32.1878], 杭州: [120.1551, 30.2741], 宁波: [121.5503, 29.8746],
  温州: [120.6994, 27.9943], 合肥: [117.2272, 31.8206], 武汉: [114.3054, 30.5931],
  郑州: [113.6254, 34.7466], 济南: [117.1205, 36.6512], 青岛: [120.3826, 36.0671],
  广州: [113.2644, 23.1291], 深圳: [114.0579, 22.5431], 成都: [104.0665, 30.5723],
  重庆: [106.5516, 29.563], 西安: [108.9398, 34.3416], 沈阳: [123.4315, 41.8057],
}

const PROVINCE_COORDINATES: Record<string, readonly [number, number]> = {
  北京: [116.4, 39.9], 天津: [117.2, 39.12], 河北: [114.5, 38.04], 山西: [112.55, 37.87],
  内蒙古: [111.77, 40.82], 辽宁: [123.43, 41.8], 吉林: [125.32, 43.9], 黑龙江: [126.64, 45.76],
  上海: [121.47, 31.23], 江苏: [118.76, 32.06], 浙江: [120.15, 30.27], 安徽: [117.28, 31.86],
  福建: [119.3, 26.08], 江西: [115.86, 28.68], 山东: [117.02, 36.67], 河南: [113.63, 34.75],
  湖北: [114.3, 30.6], 湖南: [112.94, 28.23], 广东: [113.27, 23.13], 广西: [108.37, 22.82],
  海南: [110.35, 20.02], 重庆: [106.55, 29.56], 四川: [104.07, 30.67], 贵州: [106.71, 26.58],
  云南: [102.71, 25.04], 西藏: [91.13, 29.65], 陕西: [108.95, 34.27], 甘肃: [103.83, 36.06],
  青海: [101.78, 36.62], 宁夏: [106.23, 38.49], 新疆: [87.62, 43.82], 台湾: [121.0, 23.7],
  香港: [114.17, 22.32], 澳门: [113.54, 22.2],
}

const AREA_PROVINCES: Record<Exclude<BusinessArea, '其他'>, string[]> = {
  华东: ['上海', '江苏', '浙江', '安徽', '福建', '江西', '山东'],
  华南: ['广东', '广西', '海南'],
  华中: ['河南', '湖北', '湖南'],
  华北: ['北京', '天津', '河北', '山西', '内蒙古'],
  西南: ['重庆', '四川', '贵州', '云南', '西藏'],
  西北: ['陕西', '甘肃', '青海', '宁夏', '新疆'],
  东北: ['辽宁', '吉林', '黑龙江'],
  港澳台: ['香港', '澳门', '台湾'],
}

export function businessAreaFor(province: string | null): BusinessArea {
  const normalized = normalizeProvince(province)
  return (Object.entries(AREA_PROVINCES).find(([, provinces]) => provinces.includes(normalized))?.[0] as BusinessArea | undefined) ?? '其他'
}

function basePosition(region: Region): { position: MapPosition | null; source: NetworkMapNode['locationSource'] } {
  const cityCoordinates = CITY_COORDINATES[normalizeCity(region.city)]
  if (cityCoordinates) return { position: percentFromLongitudeLatitude(...cityCoordinates), source: 'city' }
  if (region.city) return { position: null, source: 'other' }
  const provinceCoordinates = PROVINCE_COORDINATES[normalizeProvince(region.province)]
  if (provinceCoordinates) return { position: percentFromLongitudeLatitude(...provinceCoordinates), source: 'province' }
  return { position: null, source: 'other' }
}

export function nodeKeyForRegion(region: Region): string {
  if (!basePosition(region).position) return '其他地区'
  return `${normalizeProvince(region.province) || '未知'}-${normalizeCity(region.city) || '省级'}`
}

const constituentKeys = (group: Region[]) =>
  group.flatMap((item) => item.constituent_regions?.length ? item.constituent_regions : [{ province: item.province, city: item.city }])

const aggregateRegions = (regions: Region[]) => {
  const grouped = new Map<string, Region[]>()
  regions.forEach((region) => {
    const key = nodeKeyForRegion(region)
    grouped.set(key, [...(grouped.get(key) ?? []), region])
  })
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right, 'zh-CN')).map(([key, group]) => {
    const aggregate = group.reduce<Region>((total, item) => ({
      ...total,
      lead_total: total.lead_total + item.lead_total,
      monthly_order_capacity: total.monthly_order_capacity + item.monthly_order_capacity,
      franchise_total: (total.franchise_total ?? 0) + (item.franchise_total ?? 0),
      pending_batches: item.pending_batches == null && total.pending_batches == null ? undefined : (total.pending_batches ?? 0) + (item.pending_batches ?? 0),
      franchise_opportunities: item.franchise_opportunities == null && total.franchise_opportunities == null ? undefined : (total.franchise_opportunities ?? 0) + (item.franchise_opportunities ?? 0),
      channel_opportunities: item.channel_opportunities == null && total.channel_opportunities == null ? undefined : (total.channel_opportunities ?? 0) + (item.channel_opportunities ?? 0),
      delivery_risks: item.delivery_risks == null && total.delivery_risks == null ? undefined : (total.delivery_risks ?? 0) + (item.delivery_risks ?? 0),
    }), { ...group[0], lead_total: 0, monthly_order_capacity: 0, franchise_total: 0, pending_batches: undefined, franchise_opportunities: undefined, channel_opportunities: undefined, delivery_risks: undefined })
    return { key, region: key === '其他地区' ? { ...aggregate, province: null, city: '其他地区', constituent_regions: constituentKeys(group) } : aggregate }
  })
}

const median = (values: number[]) => {
  if (!values.length) return Number.POSITIVE_INFINITY
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const defaultView: Required<Pick<MapViewState, 'level' | 'layer'>> & MapViewState = { level: 'city', layer: 'network' }

export function drillIntoProvince(view: MapViewState, province: string): MapViewState {
  return { level: 'province', province, city: null, layer: view.layer ?? 'pending' }
}

export function drillIntoCity(view: MapViewState, city: string): MapViewState {
  return { level: 'city', province: view.province ?? null, city, layer: view.layer ?? 'pending' }
}

export function drillOut(view: MapViewState): MapViewState {
  if (view.level === 'city') return { level: 'province', province: view.province ?? null, city: null, layer: view.layer ?? 'pending' }
  return { level: 'national', province: null, city: null, layer: view.layer ?? 'pending' }
}

function matchesProvince(region: Region, province: string | null | undefined) {
  return !province || normalizeProvince(region.province) === normalizeProvince(province)
}

function matchesCity(region: Region, city: string | null | undefined) {
  return !city || normalizeCity(region.city) === normalizeCity(city)
}

function aggregateProvinces(regions: Region[]) {
  const grouped = new Map<string, Region[]>()
  regions.forEach((region) => {
    const normalized = normalizeProvince(region.province)
    const key = PROVINCE_COORDINATES[normalized] ? normalized : '其他地区'
    grouped.set(key, [...(grouped.get(key) ?? []), region])
  })
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right, 'zh-CN')).map(([key, group]) => {
    const aggregate = group.reduce<Region>((total, item) => ({
      ...total,
      lead_total: total.lead_total + item.lead_total,
      monthly_order_capacity: total.monthly_order_capacity + item.monthly_order_capacity,
      franchise_total: (total.franchise_total ?? 0) + (item.franchise_total ?? 0),
      pending_batches: item.pending_batches == null && total.pending_batches == null ? undefined : (total.pending_batches ?? 0) + (item.pending_batches ?? 0),
      franchise_opportunities: item.franchise_opportunities == null && total.franchise_opportunities == null ? undefined : (total.franchise_opportunities ?? 0) + (item.franchise_opportunities ?? 0),
      channel_opportunities: item.channel_opportunities == null && total.channel_opportunities == null ? undefined : (total.channel_opportunities ?? 0) + (item.channel_opportunities ?? 0),
      delivery_risks: item.delivery_risks == null && total.delivery_risks == null ? undefined : (total.delivery_risks ?? 0) + (item.delivery_risks ?? 0),
    }), { ...group[0], city: null, lead_total: 0, monthly_order_capacity: 0, franchise_total: 0, pending_batches: undefined, franchise_opportunities: undefined, channel_opportunities: undefined, delivery_risks: undefined })
    return { key, region: key === '其他地区' ? { ...aggregate, province: null, city: '其他地区', constituent_regions: constituentKeys(group) } : aggregate }
  })
}

function isRiskRegion(region: Region, risks: MapRisk[]) {
  return risks.some((risk) => matchesProvince(region, risk.province) && (!risk.city || matchesCity(region, risk.city)))
}

export function createNetworkMapModel(regions: Region[], view: MapViewState = defaultView, risks: MapRisk[] = []): NetworkMapModel {
  const level = view.level ?? 'city'
  const layer = view.layer ?? 'network'
  const scoped = regions.filter((region) => {
    if (level === 'province' || (level === 'city' && view.province)) return matchesProvince(region, view.province)
    if (level === 'city' && view.city) return matchesProvince(region, view.province) && matchesCity(region, view.city)
    return true
  })
  const cityAggregates = aggregateRegions(scoped)
  const unsignedMedian = median(cityAggregates.filter(({ region }) => !(region.franchise_total ?? 0)).map(({ region }) => region.monthly_order_capacity))
  const classified = cityAggregates.filter(({ region }) => {
    const signed = (region.franchise_total ?? 0) > 0
    const focus = !signed && region.monthly_order_capacity >= unsignedMedian
    const hasBusinessCounts = region.pending_batches != null || region.franchise_opportunities != null || region.delivery_risks != null
    if (layer === 'franchise') return signed
    if (layer === 'focus') return hasBusinessCounts ? ((region.franchise_opportunities ?? 0) + (region.channel_opportunities ?? 0)) > 0 : focus
    if (layer === 'pending') return hasBusinessCounts ? (region.pending_batches ?? 0) > 0 || !signed : !signed
    if (layer === 'risk') return hasBusinessCounts ? (region.delivery_risks ?? 0) > 0 || isRiskRegion(region, risks) : isRiskRegion(region, risks)
    return true
  })
  const aggregates = level === 'national' ? aggregateProvinces(classified.map((item) => item.region)) : classified
  const provinceFallbackCounts = new Map<string, number>()
  const nodes = aggregates.map<NetworkMapNode>(({ key, region }) => {
    const located = basePosition(region)
    let position = located.position
    if (position && located.source === 'province' && region.city) {
      const province = normalizeProvince(region.province)
      const index = provinceFallbackCounts.get(province) ?? 0
      provinceFallbackCounts.set(province, index + 1)
      const angle = index * 2.399963
      const radius = 1.25 + Math.floor(index / 6) * 0.65
      position = [position[0] + Math.cos(angle) * radius, position[1] + Math.sin(angle) * radius]
    }
    const signed = (region.franchise_total ?? 0) > 0
    const activityTier: ActivityTier = isRiskRegion(region, risks)
      ? 'risk'
      : signed
        ? 'signed'
        : region.monthly_order_capacity >= unsignedMedian ? 'focus' : 'standard'
    return { key, region, position, businessArea: businessAreaFor(region.province), activityTier, locationSource: located.source }
  })

  const hubs: NetworkMapHub[] = []
  const edges: NetworkMapEdge[] = []
  const areaGroups = new Map<BusinessArea, NetworkMapNode[]>()
  nodes.filter((node) => node.position && node.businessArea !== '其他').forEach((node) => {
    areaGroups.set(node.businessArea, [...(areaGroups.get(node.businessArea) ?? []), node])
  })
  areaGroups.forEach((members, area) => {
    if (members.length < 2) return
    const position: MapPosition = [
      members.reduce((sum, node) => sum + node.position![0], 0) / members.length,
      members.reduce((sum, node) => sum + node.position![1], 0) / members.length,
    ]
    hubs.push({ area, position })
    members.forEach((node) => edges.push({ key: `${area}-${node.key}`, area, from: node.position!, to: position }))
  })
  return { nodes, hubs, edges }
}
