import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReportText } from './ReportText';

describe('research report rendering', () => {
  it('renders aggregate counts as a labelled data table, preserving zero and unavailable values', () => {
    render(<ReportText text={'### 经营计数（内部快照）\n\n| 模块 | 指标 | 数值 |\n| --- | --- | ---: |\n| 原 CRM | 客户 | 6 |\n| 公开线索池 | 可用线索 | 0 |\n| 数据源 | 状态 | 未提供 |\n\n[9] 当前计数，不能推断趋势。'} />);
    const table = screen.getByRole('table', { name: '经营计数（内部快照） · 表 1' });
    expect(within(table).getAllByRole('columnheader')).toHaveLength(3);
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(within(table).getByRole('cell', { name: '0' })).toHaveStyle({ textAlign: 'right' });
    expect(within(table).getByRole('cell', { name: '未提供' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /经营计数.*可横向滚动/ })).toHaveAttribute('tabindex', '0');
    expect(screen.getByText('[9] 当前计数，不能推断趋势。')).toBeInTheDocument();
    expect(screen.queryByText('| --- | --- | ---: |')).not.toBeInTheDocument();
  });
  it('keeps escaped pipes, code pipes and malformed rows without dropping content', () => {
    render(<ReportText text={'名称 | 说明\n--- | ---\n甲\\|乙 | `A|B`\n错位 | 两列 | 不能丢失\n\n结束'} />);
    expect(screen.getByRole('cell', { name: '甲|乙' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'A|B' })).toBeInTheDocument();
    expect(screen.getByText('错位 | 两列 | 不能丢失')).toBeInTheDocument();
  });
  it('uses semantic headings, lists, separators and code while rendering HTML as harmless text', () => {
    const { container } = render(<ReportText text={'## 行动\n\n1. **核实来源**\n2. 查看[公开文件](https://example.org/policy)\n\n---\n\n<script>bad()</script>\n\n[危险链接](javascript:bad)\n\n```html\n<img src=x onerror=bad()>\n```'} />);
    expect(screen.getByRole('heading', { name: '行动', level: 3 })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('核实来源').tagName).toBe('STRONG');
    expect(screen.getByRole('separator')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '公开文件' })).toHaveAttribute('href', 'https://example.org/policy');
    expect(screen.queryByRole('link', { name: '危险链接' })).not.toBeInTheDocument();
    expect(container.querySelector('script, img')).toBeNull();
    expect(container.querySelector('pre code')).toHaveTextContent('<img src=x onerror=bad()>');
  });
});
