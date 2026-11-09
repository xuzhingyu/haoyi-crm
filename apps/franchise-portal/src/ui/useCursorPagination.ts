import { useCallback, useEffect, useState } from 'react';
import type { PageResult } from '../api/types';
import { errorText } from '../workspace';

/** Server cursors are opaque. Only already discovered page boundaries are navigable. */
export function useCursorPagination<T>(loader: (query: Record<string, string>) => Promise<PageResult<T>>, resetKey = '', initialPageSize = 20) {
  const [navigation, setNavigation] = useState({ key: resetKey, page: 1, pageSize: initialPageSize, cursors: [''], version: 0 });
  if (navigation.key !== resetKey) setNavigation({ key: resetKey, page: 1, pageSize: navigation.pageSize, cursors: [''], version: navigation.version + 1 });
  const current = navigation.key === resetKey ? navigation : { ...navigation, key: resetKey, page: 1, cursors: [''] };
  const cursor = current.cursors[current.page - 1] ?? '';
  const identity = JSON.stringify([resetKey, current.pageSize, current.page, cursor]);
  const [response, setResponse] = useState<{ identity: string; data: PageResult<T> | null; error: string; loading: boolean }>({ identity: '', data: null, error: '', loading: true });
  useEffect(() => {
    let active = true;
    setResponse(previous => ({ identity, data: previous.identity === identity ? previous.data : null, loading: true, error: '' }));
    loader({ limit: String(current.pageSize), ...(cursor ? { cursor } : {}) }).then(data => {
      if (!active) return;
      setResponse({ identity, data, error: '', loading: false });
      setNavigation(previous => {
        if (previous.key !== resetKey || previous.page !== current.page || previous.pageSize !== current.pageSize) return previous;
        const cursors = previous.cursors.slice(0, current.page);
        if (data.next_cursor && !cursors.includes(data.next_cursor)) cursors.push(data.next_cursor);
        return { ...previous, cursors };
      });
    }).catch(reason => { if (active) setResponse(previous => ({ identity, data: previous.identity === identity ? previous.data : null, error: errorText(reason), loading: false })); });
    return () => { active = false; };
  }, [loader, identity, cursor, current.page, current.pageSize, current.version, resetKey]);
  const visible = response.identity === identity ? response : { data: null, error: '', loading: true };
  const reload = useCallback(() => setNavigation(previous => ({ ...previous, version: previous.version + 1 })), []);
  const reset = useCallback(() => setNavigation(previous => ({ ...previous, page: 1, cursors: [''], version: previous.version + 1 })), []);
  const setPageSize = useCallback((pageSize: number) => setNavigation(previous => ({ ...previous, pageSize, page: 1, cursors: [''], version: previous.version + 1 })), []);
  const setPage = (page: number) => {
    if (visible.loading || !Number.isInteger(page) || page < 1 || page > current.cursors.length) return;
    setNavigation(previous => ({ ...previous, page }));
  };
  return { ...visible, items: visible.data?.items ?? [], page: current.page, pageSize: current.pageSize, hasNext: Boolean(visible.data?.next_cursor && current.cursors.length > current.page), reload, reset, setPage, setPageSize };
}
