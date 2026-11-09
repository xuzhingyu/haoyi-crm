import { useId } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type PaginationProps = {
  page: number;
  pageSize: number;
  total?: number;
  hasNext?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  busy?: boolean;
  label?: string;
};

function positiveInteger(value: number, fallback = 1) {
  return Number.isFinite(value) && value > 0 ? Math.max(1, Math.floor(value)) : fallback;
}

function pageNumbers(page: number, count: number): (number | 'start-gap' | 'end-gap')[] {
  if (count <= 7) return Array.from({ length: count }, (_, index) => index + 1);
  const start = Math.max(2, Math.min(page - 1, count - 3));
  const end = Math.min(count - 1, Math.max(page + 1, 4));
  return [1, ...(start > 2 ? ['start-gap' as const] : []), ...Array.from({ length: end - start + 1 }, (_, index) => start + index), ...(end < count - 1 ? ['end-gap' as const] : []), count];
}

/** Controlled pagination for either a known total or a server cursor history. */
export function Pagination({ page, pageSize, total, hasNext = false, onPageChange, onPageSizeChange, pageSizeOptions = [10, 20, 50], busy = false, label = '列表分页' }: PaginationProps) {
  const sizeId = useId();
  const size = positiveInteger(pageSize, 10);
  const count = total === undefined ? undefined : Math.max(0, Number.isFinite(total) ? Math.floor(total) : 0);
  const pages = count === undefined ? undefined : Math.max(1, Math.ceil(count / size));
  const current = Math.min(positiveInteger(page), pages ?? Number.MAX_SAFE_INTEGER);
  const canNext = pages === undefined ? hasNext : current < pages;
  const sizes = [...new Set([...pageSizeOptions.filter(value => Number.isInteger(value) && value > 0), size])].sort((a, b) => a - b);
  const go = (next: number) => {
    if (!busy && next !== current && next >= 1 && (pages === undefined || next <= pages)) onPageChange(next);
  };
  return <nav className="hy-pagination" aria-label={label} aria-busy={busy || undefined}>
    <span className="hy-pagination-summary" role="status" aria-atomic="true">
      {count === undefined ? `第 ${current} 页` : count === 0 ? '共 0 条' : `第 ${((current - 1) * size + 1).toLocaleString('zh-CN')}–${Math.min(current * size, count).toLocaleString('zh-CN')} 条，共 ${count.toLocaleString('zh-CN')} 条`}
    </span>
    {onPageSizeChange && <label className="hy-pagination-size" htmlFor={sizeId}>每页条数<select id={sizeId} value={size} disabled={busy} onChange={event => onPageSizeChange(Number(event.target.value))}>{sizes.map(value => <option key={value} value={value}>{value} 条</option>)}</select></label>}
    <div className="hy-pagination-controls">
      <button type="button" className="button secondary small hy-pagination-prev" disabled={busy || current === 1} onClick={() => go(current - 1)}><ChevronLeft size={16} aria-hidden="true" /><span>上一页</span></button>
      {pages === undefined ? <span className="hy-pagination-current" aria-current="page">{current}</span> : <div className="hy-pagination-pages">{pageNumbers(current, pages).map(value => typeof value === 'number' ? <button type="button" className={`button secondary small hy-pagination-number${value === current ? ' selected' : ''}`} key={value} aria-label={`第 ${value} 页`} aria-current={value === current ? 'page' : undefined} disabled={busy} onClick={() => go(value)}>{value}</button> : <span className="hy-pagination-gap" key={value} aria-hidden="true">…</span>)}</div>}
      <button type="button" className="button secondary small hy-pagination-next" disabled={busy || !canNext} onClick={() => go(current + 1)}><span>下一页</span><ChevronRight size={16} aria-hidden="true" /></button>
    </div>
  </nav>;
}
