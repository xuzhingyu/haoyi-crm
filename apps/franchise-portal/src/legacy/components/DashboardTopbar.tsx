import { FileText, Upload } from 'lucide-react'
import { useState } from 'react'
import { api } from '../services/api'

type Props = { period: string; onPeriodChange: (period: string) => void; onImport: () => void; onAi: () => void; aiOpen: boolean; report: { pdf_url: string; pptx_url: string } | null; onReport: (report: { pdf_url: string; pptx_url: string } | null) => void }
export function DashboardTopbar({ period, onPeriodChange, onImport, onAi, aiOpen, report, onReport }: Props) {
  const [pending, setPending] = useState(false); const [error, setError] = useState('')
  async function createReport() { setPending(true); setError(''); try { onReport(await api.report(period)) } catch { setError('报告生成失败，请稍后重试') } finally { setPending(false) } }
  return <><header className="topbar"><div><h1>经营概览</h1><p>聚焦关键任务，高效推动加盟网络发展</p></div><div className="top-actions"><label>筛选月份<select aria-label="筛选月份" value={period} onChange={(event) => onPeriodChange(event.target.value)}><option>本月</option><option>上月</option><option>本季度</option></select></label><button onClick={onImport}><Upload />导入线索</button><button disabled={pending} onClick={createReport}><FileText />{pending ? '生成中…' : '生成报告'}</button><button id="ai-trigger" aria-controls="ai-assistant-dialog" aria-expanded={aiOpen} aria-label="AI 助手" className="ai-trigger" onClick={onAi}>✦ AI 助手</button></div></header>{error && <p className="action-error" role="alert">{error}</p>}{report && <div className="report-actions" role="status">报告已生成 <a href={report.pdf_url} download aria-label="下载 PDF 报告">下载 PDF 报告</a><a href={report.pptx_url} download aria-label="下载 PPT 报告">下载 PPT 报告</a></div>}</>
}
