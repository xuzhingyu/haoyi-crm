import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PageResult } from '../api/types';
import { useCursorPagination } from './useCursorPagination';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('server cursor pagination', () => {
  it('uses opaque cursor boundaries, supports previous pages and resets page size', async () => {
    const loader = vi.fn(async (query: Record<string, string>) => query.cursor ? { items: ['third'], next_cursor: null } : { items: ['first', 'second'], next_cursor: 'opaque-boundary' });
    const { result } = renderHook(() => useCursorPagination(loader));
    await waitFor(() => expect(result.current.hasNext).toBe(true));
    act(() => result.current.setPage(2));
    await waitFor(() => expect(result.current.items).toEqual(['third']));
    expect(loader).toHaveBeenLastCalledWith({ cursor: 'opaque-boundary', limit: '20' });
    expect(result.current.hasNext).toBe(false);
    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(2);
    act(() => result.current.setPage(1));
    await waitFor(() => expect(result.current.items).toEqual(['first', 'second']));
    act(() => result.current.setPage(2));
    await waitFor(() => expect(result.current.page).toBe(2));
    act(() => result.current.setPageSize(50));
    await waitFor(() => expect(loader).toHaveBeenLastCalledWith({ limit: '50' }));
    expect(result.current.page).toBe(1);
  });

  it('rejects an old next-page response after filters change', async () => {
    const pending = deferred<PageResult<string>>();
    const original = vi.fn((query: Record<string, string>) => query.cursor ? pending.promise : Promise.resolve({ items: ['old first'], next_cursor: 'old-next' }));
    const filtered = vi.fn(async () => ({ items: ['filtered result'], next_cursor: null }));
    const { result, rerender } = renderHook(({ loader, key }) => useCursorPagination(loader, key), { initialProps: { loader: original, key: 'all' } });
    await waitFor(() => expect(result.current.hasNext).toBe(true));
    act(() => result.current.setPage(2));
    await waitFor(() => expect(original).toHaveBeenCalledTimes(2));
    rerender({ loader: filtered, key: 'filtered' });
    await waitFor(() => expect(result.current.items).toEqual(['filtered result']));
    await act(async () => pending.resolve({ items: ['stale page'], next_cursor: 'stale-next' }));
    expect(result.current.items).toEqual(['filtered result']);
    expect(result.current.page).toBe(1);
    expect(result.current.hasNext).toBe(false);
  });

  it('keeps current page context on a failed request and retries the same cursor', async () => {
    let fail = true;
    const loader = vi.fn(async (query: Record<string, string>) => {
      if (!query.cursor) return { items: ['first'], next_cursor: 'next' };
      if (fail) throw new Error('暂时离线');
      return { items: ['next result'], next_cursor: null };
    });
    const { result } = renderHook(() => useCursorPagination(loader));
    await waitFor(() => expect(result.current.hasNext).toBe(true));
    act(() => result.current.setPage(2));
    await waitFor(() => expect(result.current.error).toBe('暂时离线'));
    expect(result.current.page).toBe(2);
    fail = false;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.items).toEqual(['next result']));
    expect(loader).toHaveBeenLastCalledWith({ limit: '20', cursor: 'next' });
  });

  it('does not expose a repeated server cursor as another page', async () => {
    const loader = vi.fn(async (query: Record<string, string>) => ({ items: [query.cursor || 'first'], next_cursor: 'repeated' }));
    const { result } = renderHook(() => useCursorPagination(loader));
    await waitFor(() => expect(result.current.hasNext).toBe(true));
    act(() => result.current.setPage(2));
    await waitFor(() => expect(result.current.items).toEqual(['repeated']));
    expect(result.current.hasNext).toBe(false);
  });
});
