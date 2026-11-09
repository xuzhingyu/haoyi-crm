import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from './Pagination';
import { useClientPagination } from './usePagination';

describe('Pagination', () => {
  it('shows the real range, bounds the page buttons and exposes current page semantics', () => {
    const change = vi.fn();
    render(<Pagination label="客户分页" page={50} pageSize={20} total={2013} onPageChange={change} />);
    const nav = screen.getByRole('navigation', { name: '客户分页' });
    expect(within(nav).getByRole('status')).toHaveTextContent('第 981–1,000 条，共 2,013 条');
    expect(within(nav).getByRole('button', { name: '第 50 页' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getAllByRole('button')).toHaveLength(7);
    fireEvent.click(within(nav).getByRole('button', { name: '第 101 页' }));
    expect(change).toHaveBeenCalledWith(101);
  });

  it('disables previous/next at empty and last-page boundaries', () => {
    const change = vi.fn();
    const { rerender } = render(<Pagination page={1} pageSize={10} total={0} onPageChange={change} />);
    expect(screen.getByRole('status')).toHaveTextContent('共 0 条');
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled();
    rerender(<Pagination page={3} pageSize={10} total={23} onPageChange={change} />);
    expect(screen.getByRole('status')).toHaveTextContent('第 21–23 条，共 23 条');
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '上一页' }));
    expect(change).toHaveBeenCalledWith(2);
  });

  it('does not invent totals for cursor pages and respects next-page availability', () => {
    const change = vi.fn();
    const { rerender } = render(<Pagination page={2} pageSize={10} hasNext onPageChange={change} />);
    expect(screen.getByRole('status')).toHaveTextContent('第 2 页');
    expect(screen.queryByText(/共 .* 条/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(change).toHaveBeenCalledWith(3);
    rerender(<Pagination page={3} pageSize={10} hasNext={false} onPageChange={change} />);
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '上一页' })).toBeEnabled();
  });

  it('supports native keyboard controls and locks navigation while a page is loading', async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    const resize = vi.fn();
    const { rerender } = render(<Pagination page={1} pageSize={10} total={42} onPageChange={change} onPageSizeChange={resize} />);
    const next = screen.getByRole('button', { name: '下一页' });
    next.focus();
    await user.keyboard('{Enter}');
    expect(change).toHaveBeenCalledWith(2);
    await user.selectOptions(screen.getByRole('combobox', { name: '每页条数' }), '20');
    expect(resize).toHaveBeenCalledWith(20);
    rerender(<Pagination page={2} pageSize={20} total={42} busy onPageChange={change} onPageSizeChange={resize} />);
    expect(screen.getByRole('navigation')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getAllByRole('button').every(button => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByRole('combobox')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '上一页' }));
    expect(change).toHaveBeenCalledTimes(1);
  });
});

describe('useClientPagination', () => {
  const all = Array.from({ length: 25 }, (_, index) => index + 1);

  it('paginates after filtering and resets on query changes without losing page size', () => {
    const { result, rerender } = renderHook(({ rows, query }) => useClientPagination(rows, query), { initialProps: { rows: all, query: '' } });
    act(() => result.current.setPage(2));
    expect(result.current.items).toEqual(all.slice(10, 20));
    act(() => result.current.setPageSize(20));
    expect(result.current.page).toBe(1);
    act(() => result.current.setPage(2));
    rerender({ rows: all.filter(value => value % 2 === 0), query: 'even' });
    expect(result.current.page).toBe(1);
    expect(result.current.pageSize).toBe(20);
    expect(result.current.total).toBe(12);
    expect(result.current.items).toEqual(all.filter(value => value % 2 === 0));
  });

  it('clamps after deleting the last page and does not resurrect it when rows grow again', () => {
    const { result, rerender } = renderHook(({ rows }) => useClientPagination(rows), { initialProps: { rows: all } });
    act(() => result.current.setPage(3));
    expect(result.current.items).toEqual([21, 22, 23, 24, 25]);
    rerender({ rows: all.slice(0, 20) });
    expect(result.current.page).toBe(2);
    expect(result.current.items).toEqual(all.slice(10, 20));
    rerender({ rows: all });
    expect(result.current.page).toBe(2);
    rerender({ rows: [] });
    expect(result.current.page).toBe(1);
    expect(result.current.items).toEqual([]);
  });

  it('keeps out-of-range requests within the actual collection', () => {
    const { result } = renderHook(() => useClientPagination(all));
    act(() => result.current.setPage(999));
    expect(result.current.page).toBe(3);
    act(() => result.current.setPage(-1));
    expect(result.current.page).toBe(1);
    act(() => result.current.setPageSize(0));
    expect(result.current.pageSize).toBe(10);
    act(() => result.current.setPageSize(50));
    expect(result.current.items).toHaveLength(25);
  });
});
