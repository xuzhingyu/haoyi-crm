import { useCallback, useState } from 'react';

function positiveInteger(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? Math.max(1, Math.floor(value)) : fallback;
}

/** Slice only an already filtered/sorted complete collection, never a server page. */
export function useClientPagination<T>(items: readonly T[], resetKey = '', initialPageSize = 10) {
  const [state, setState] = useState(() => ({ resetKey, page: 1, pageSize: positiveInteger(initialPageSize, 10) }));
  const total = items.length;
  const pageSize = state.pageSize;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const page = resetKey === state.resetKey ? Math.min(state.page, lastPage) : 1;

  // Reconcile during render so a reduced collection never commits an empty page,
  // and subsequently adding rows cannot resurrect a now-invalid page selection.
  if (state.resetKey !== resetKey || state.page !== page) setState({ ...state, resetKey, page });

  const setPage = useCallback((next: number) => {
    setState(current => ({ ...current, resetKey, page: Math.min(lastPage, positiveInteger(next, 1)) }));
  }, [lastPage, resetKey]);
  const setPageSize = useCallback((size: number) => {
    setState(current => ({ resetKey, page: 1, pageSize: positiveInteger(size, current.pageSize) }));
  }, [resetKey]);

  return { items: items.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total, setPage, setPageSize };
}
