import { Fragment, type ReactNode } from 'react';
import { safeUrl } from '../workspace';

// Reports are untrusted model output. Render a small Markdown subset as React
// elements so HTML stays text and links only use the approved HTTP(S) schemes.
function inline(text: string): ReactNode[] {
  const tokens: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\[([^\]]+)\]\(([^\s)]+)\)|\*([^*\n]+)\*/g;
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (start > end) tokens.push(text.slice(end, start));
    if (match[1] || match[2]) tokens.push(<strong key={start}>{match[1] || match[2]}</strong>);
    else if (match[3]) tokens.push(<code key={start}>{match[3]}</code>);
    else if (match[4]) { const href = safeUrl(match[5]); tokens.push(href ? <a key={start} href={href} target="_blank" rel="noopener noreferrer">{match[4]}</a> : <Fragment key={start}>{match[4]}</Fragment>); }
    else tokens.push(<em key={start}>{match[6]}</em>);
    end = start + match[0].length;
  }
  if (end < text.length) tokens.push(text.slice(end));
  return tokens;
}

function tableCells(line: string): string[] {
  const source = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  const result: string[] = []; let cell = ''; let inCode = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '\\' && source[i + 1] === '|') { cell += '|'; i += 1; }
    else if (char === '`') { inCode = !inCode; cell += char; }
    else if (char === '|' && !inCode) { result.push(cell.trim()); cell = ''; }
    else cell += char;
  }
  result.push(cell.trim());
  return result;
}

function tableSeparator(header: string, separator: string | undefined): string[] | null {
  if (!separator || !header.includes('|')) return null;
  const cells = tableCells(separator);
  return cells.length === tableCells(header).length && cells.every(cell => /^:?-{3,}:?$/.test(cell)) ? cells : null;
}

const listItem = (line: string) => line.match(/^\s*(?:(\d+)[.)]|([-+*]))\s+(.+)$/);
const heading = (line: string) => line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
const divider = (line: string) => /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);

export function ReportText({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = []; let index = 0; let tableLabel = '研究数据表'; let tableIndex = 0;
  while (index < lines.length) {
    const line = lines[index]; const key = index;
    if (!line.trim()) { index += 1; continue; }
    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      const contents: string[] = []; index += 1;
      while (index < lines.length && !lines[index].trim().startsWith(fence[1])) contents.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(<pre key={key}><code>{contents.join('\n')}</code></pre>); continue;
    }
    const separator = tableSeparator(line, lines[index + 1]);
    if (separator) {
      const headers = tableCells(line); const rows: string[][] = []; index += 2; tableIndex += 1;
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
        const cells = tableCells(lines[index]);
        // Keep malformed rows visible as text rather than discarding extra data.
        if (cells.length !== headers.length) break;
        rows.push(cells); index += 1;
      }
      const numeric = (value: string) => /^[+-]?\d[\d,.]*%?$/.test(value);
      const alignment = separator.map((value, column) => value.startsWith(':') && value.endsWith(':') ? 'center' : value.endsWith(':') || (!value.startsWith(':') && rows.filter(row => numeric(row[column])).length > rows.length / 2) ? 'right' : 'left') as ('left' | 'center' | 'right')[];
      const label = `${tableLabel} · 表 ${tableIndex}`;
      blocks.push(<Fragment key={key}><small className="report-table-hint">左右滑动查看完整表格</small><div className="report-table-scroll" role="region" aria-label={`${label}，可横向滚动`} tabIndex={0}><table aria-label={label}><thead><tr>{headers.map((cell, column) => <th key={column} scope="col" style={{ textAlign: alignment[column] }}>{inline(cell)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, column) => <td key={column} style={{ textAlign: alignment[column] }} className={numeric(cell) ? 'report-number' : undefined}>{inline(cell)}</td>)}</tr>)}</tbody></table></div></Fragment>); continue;
    }
    const title = heading(line);
    if (title) {
      const content = inline(title[2]); tableLabel = title[2].replace(/\*\*|__/g, '');
      const level = Math.min(6, title[1].length + 1);
      blocks.push(level === 2 ? <h2 key={key}>{content}</h2> : level === 3 ? <h3 key={key}>{content}</h3> : level === 4 ? <h4 key={key}>{content}</h4> : level === 5 ? <h5 key={key}>{content}</h5> : <h6 key={key}>{content}</h6>); index += 1; continue;
    }
    if (divider(line)) { blocks.push(<hr key={key} />); index += 1; continue; }
    const firstItem = listItem(line);
    if (firstItem) {
      const ordered = !!firstItem[1]; const items: ReactNode[] = [];
      while (index < lines.length) {
        const item = listItem(lines[index]); if (!item || !!item[1] !== ordered) break;
        items.push(<li key={index}>{inline(item[3])}</li>); index += 1;
      }
      blocks.push(ordered ? <ol key={key} start={Number(firstItem[1])}>{items}</ol> : <ul key={key}>{items}</ul>); continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) quoted.push(lines[index++].replace(/^\s*>\s?/, ''));
      blocks.push(<blockquote key={key}>{inline(quoted.join('\n'))}</blockquote>); continue;
    }
    const paragraph = [line]; index += 1;
    while (index < lines.length && lines[index].trim() && !heading(lines[index]) && !divider(lines[index]) && !listItem(lines[index]) && !/^\s*(?:>|`{3,}|~{3,})/.test(lines[index]) && !tableSeparator(lines[index], lines[index + 1])) paragraph.push(lines[index++]);
    blocks.push(<p key={key}>{inline(paragraph.join('\n'))}</p>);
  }
  return <div className="report-text">{blocks}</div>;
}
