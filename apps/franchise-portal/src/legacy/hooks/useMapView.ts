import { useCallback, useEffect, useState } from 'react'
import { drillIntoCity, drillIntoProvince, drillOut, type MapLayer, type MapViewState } from '../components/networkMapModel'

const initialView: MapViewState = { level: 'national', province: null, city: null, layer: 'network' }

export function useMapView(controlled?: MapViewState, onChange?: (view: MapViewState) => void) {
  const [internal, setInternal] = useState<MapViewState>(controlled ?? initialView)
  const view = controlled ?? internal

  useEffect(() => {
    if (controlled) setInternal(controlled)
  }, [controlled])

  const commit = useCallback((next: MapViewState) => {
    if (!controlled) setInternal(next)
    onChange?.(next)
  }, [controlled, onChange])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && view.level !== 'national') {
        event.preventDefault()
        commit(drillOut(view))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [commit, view])

  return {
    view,
    setLayer: (layer: MapLayer) => commit({ ...view, layer }),
    enterProvince: (province: string) => commit(drillIntoProvince(view, province)),
    enterCity: (city: string) => commit(drillIntoCity(view, city)),
    goBack: () => commit(drillOut(view)),
    goNational: () => commit({ level: 'national', province: null, city: null, layer: view.layer ?? 'network' }),
  }
}
