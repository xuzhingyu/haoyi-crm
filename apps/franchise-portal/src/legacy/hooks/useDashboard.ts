import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type Dashboard } from '../services/api'

export function useDashboard(period: string) {
  const [data, setData] = useState<Dashboard | null>(null); const [error, setError] = useState(false); const sequence = useRef(0); const controller = useRef<AbortController | null>(null)
  const refresh = useCallback(async () => { const requestId = ++sequence.current; controller.current?.abort(); const nextController = new AbortController(); controller.current = nextController; setData(null); setError(false); try { const result = await api.dashboard(period, nextController.signal); if (requestId === sequence.current) setData(result) } catch (cause) { if (requestId === sequence.current && (cause as Error).name !== 'AbortError') setError(true) } }, [period])
  useEffect(() => { void refresh() }, [refresh])
  return { data, error, refresh }
}
