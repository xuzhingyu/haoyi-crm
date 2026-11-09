import { lazy, Suspense, useCallback, type MouseEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api as legacyApi, downloadReport } from './services/api'
import { WorkspaceScope } from './hooks/workspaceStorage'
import { routePath, type Route as BusinessRoute } from './hooks/useHashRoute'
import { useLoad, useWorkspace, errorText } from '../workspace'
import { ErrorState, Loading } from '../components'
import { legacyHashTarget } from '../routing'
import { BatchesView, FranchisesView, KnowledgeView, LeadsView, NotificationsView, OpportunitiesView, ReportsView, SettingsView, TrainingsView } from './components/SupportingViews'
import { LedgerPage, NewsPage, TodayPage } from './components/Studio'
import { ExecutiveDashboard } from './components/ExecutiveDashboard'
import './scoped.css'
import './unified.css'

const BusinessOverview = lazy(() => import('./components/PersonalDashboard').then(module => ({ default: module.PersonalDashboard })))

export default function LegacyPage({ section: suppliedSection }: { section?: string }) {
  const { section: routeSection } = useParams()
  const section = suppliedSection ?? routeSection ?? 'leads'
  const { user, notify } = useWorkspace()
  const identity = useLoad(useCallback(() => legacyApi.me(), []))
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const selected = Number(params.get('id'))
  const selectedId = Number.isSafeInteger(selected) && selected > 0 ? selected : null
  const franchise = Number(params.get('franchiseId'))
  const franchiseId = Number.isSafeInteger(franchise) && franchise > 0 ? franchise : null
  const open = (target: string) => (id: number | null) => {
    const query = new URLSearchParams(target === section ? params : undefined)
    if (id) query.set('id', String(id)); else query.delete('id')
    navigate(`/crm/${target}${query.size ? `?${query}` : ''}`)
  }
  const businessNavigate = (target: BusinessRoute, id?: number | null, extra?: Record<string,string>) => {
    const query = new URLSearchParams(extra)
    if (id) query.set('id', String(id))
    if (target === 'personal') query.set('view', 'business')
    const path = target === 'personal' ? '/tasks' : routePath(target)
    navigate(`${path}${query.size ? `?${query}` : ''}`)
  }
  const handleDownload = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a')
    if (!anchor || anchor.href.startsWith('blob:')) return
    const href = anchor.getAttribute('href') ?? ''
    const target = legacyHashTarget(href)
    if (target) {
      event.preventDefault()
      navigate(target)
      return
    }
    if (!anchor.hasAttribute('download')) return
    event.preventDefault()
    void downloadReport(href).catch(error => notify(errorText(error), true))
  }
  if (identity.loading) return <div className="page"><Loading text="正在读取业务账号…" /></div>
  if (identity.error || !identity.data) return <div className="page"><ErrorState error={identity.error || '业务账号尚未关联'} retry={identity.reload} /></div>
  const account = identity.data
  const executive = account.role === 'executive'
  const allowedForExecutive = ['executive', 'reports', 'knowledge', 'notifications', 'settings']
  if (executive && !allowedForExecutive.includes(section)) return <div className="page"><h1>经营查看</h1><p className="access-note">当前账号可查看经营汇总与已发布报告。</p><Link className="button primary" to="/crm/executive">查看经营概览</Link></div>
  const pages: Record<string, ReactNode> = {
    personal: <TodayPage onOpen={businessNavigate} />,
    executive: <ExecutiveDashboard />,
    overview: <Suspense fallback={<Loading />}><BusinessOverview onOpen={businessNavigate} /></Suspense>,
    leads: <LeadsView selectedId={selectedId} onOpen={open('leads')} user={account} />,
    batches: <BatchesView selectedId={selectedId} onOpen={open('batches')} user={account} />,
    opportunities: <OpportunitiesView selectedId={selectedId} onOpen={open('opportunities')} user={account} />,
    franchises: <FranchisesView selectedId={selectedId} onOpen={open('franchises')} user={account} onCreateTraining={id => businessNavigate('trainings', null, { franchiseId: String(id), from: 'franchises' })} />,
    trainings: <TrainingsView selectedId={selectedId} onOpen={open('trainings')} user={account} franchiseId={franchiseId} onReturnToFranchise={params.get('from') === 'franchises' && franchiseId ? () => businessNavigate('franchises', franchiseId) : undefined} />,
    partners: <LedgerPage key="partners" title="合作机构" kinds={['party', 'relationship', 'insurance']} />,
    delivery: <LedgerPage key="delivery" title="合同与履约" kinds={['contract', 'payment', 'enrollment', 'repair']} />,
    contributions: <LedgerPage key="contributions" title="沟通记录" kinds={['note']} />,
    reports: <LedgerPage key="reports" title="经营报告" kinds={['report']} readOnly={executive} legacyLabel="汇总与导出" legacy={<ReportsView user={account} />} />,
    news: <NewsPage />,
    knowledge: <KnowledgeView user={account} />,
    notifications: <NotificationsView />,
    settings: <SettingsView user={account} />,
  }
  return <WorkspaceScope.Provider value={`${user.org_id}:${user.user_id}:${account.role}`}><div className="legacy-crm legacy-page" onClickCapture={handleDownload}>{pages[section] ?? <ErrorState error="这个业务页面不存在" />}</div></WorkspaceScope.Provider>
}
