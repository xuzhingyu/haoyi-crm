import { useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, CircleDollarSign, ClipboardCheck, Compass, Search, Sparkles, Workflow } from "lucide-react";
import { dateTime, sourceNatureLabel, money, stages, topics, useLoad, useWorkspace } from "../workspace";
import { Empty, ErrorState, Loading, SectionHeading, Status } from "../components";

import { countUnifiedOpenTasks } from "../taskData";
import { IntelligenceMetrics } from './IntelligenceHub';

export function HomePage() {
  const { api, user } = useWorkspace();
  const state = useLoad(useCallback(() => api.getOverview(), [api]));
  const intelligence = useLoad(useCallback(() => user.is_hq ? api.getIntelligenceOverview() : Promise.resolve(null), [api, user.is_hq]));
  const overview = state.data;
  const tasks = useLoad(useCallback(() => countUnifiedOpenTasks(api,user), [api,user]));
  const taskCount = tasks.data != null && !tasks.error ? tasks.data : null;
  const taskLabel = taskCount == null ? "查看待办" : `${taskCount} 项未完成待办`;
  return <div className="page home-page">
    <header className="workspace-welcome"><div><h1>工作台</h1><p>{user.display_name}，欢迎回来</p></div><div className="workspace-actions"><Link className="button secondary" to={user.is_hq ? "/tasks" : "/development/claims"}><ClipboardCheck size={17} />查看待办</Link><Link className="button primary" to={user.is_hq ? "/research" : "/development/pool"}>{user.is_hq ? <Sparkles size={17} /> : <Search size={17} />}{user.is_hq ? "新建研究" : "查看公开线索"}</Link></div></header>
    {state.error && <ErrorState error={state.error} retry={state.reload} />}
    {intelligence.data && <section className="home-intelligence-summary"><IntelligenceMetrics data={intelligence.data} /><div className="home-topic-links">{intelligence.data.topics.filter(item => item.count > 0).map(item => <Link key={item.topic} to={`/intelligence?topic=${encodeURIComponent(item.topic)}`}>{topics[item.topic] ?? item.topic}<span>{item.count}</span></Link>)}<Link to="/intelligence">浏览情报 <ArrowUpRight size={15} /></Link></div></section>}
    {state.loading && !overview ? <Loading text="正在读取业务概况…" /> : overview && <>
      {user.is_hq ? <div className="home-overview-group">{overview.legacy_crm?.available && overview.legacy_crm.stats ? <section className="business-metrics" aria-label="业务概况">{([
        ["leads", "客户线索", "/crm/leads?q=&status=&mode=表格"], ["followups", "跟进记录", "/crm/followups?status=all"], ["opportunities", "商机", "/crm/opportunities?kind=all&q=&stage=&mode=列表"], ["franchises", "加盟档案", "/crm/franchises?q=&status=&revisit="], ["training_records", "培训记录", "/crm/trainings"],
      ] as const).map(([key,label,to], index) => {
        const className = `business-metric${index === 0 ? " business-metric-featured" : ""}`;
        const content = <span className="hy-card-visual business-metric-visual"><span>{label}</span><strong>{overview.legacy_crm!.stats![key].toLocaleString("zh-CN")}</strong></span>;
        return user.roles.includes("hq_executive")
          ? <div key={key} className={className}>{content}</div>
          : <Link key={key} className={`${className} hy-card-interactive`} to={to}>{content}</Link>;
      })}</section> : <ErrorState error="暂时无法读取业务概况" retry={state.reload} />}
        <Link to="/tasks?status=unfinished" className="task-summary home-priority-task hy-card-interactive hy-glow-card" aria-label={taskLabel}>
          <span className="hy-card-visual task-summary-visual">
            <ClipboardCheck className="task-summary-icon" size={24} aria-hidden="true" />
            <span className="task-summary-copy"><strong>{taskCount == null ? "查看待办" : taskCount.toLocaleString("zh-CN")}</strong>{taskCount != null && <span>项未完成待办</span>}</span>
            <ArrowRight className="task-summary-arrow" size={20} aria-hidden="true" />
          </span>
        </Link>
      </div> : <div className="metrics-strip">{[
        { label: "可领取线索", value: overview.stats.available_leads, to: "/development/pool", icon: Search },
        { label: "维护中的线索", value: overview.stats.active_claims, to: "/development/claims", icon: ClipboardCheck },
        { label: "逾期跟进", value: overview.stats.overdue_followups, to: "/development/followups", icon: Workflow },
        { label: "商机", value: overview.stats.opportunities, to: "/development/opportunities", icon: CircleDollarSign },
      ].map(({ label, value, to, icon: Icon }, index) => <Link to={to} key={label} className={`metric hy-card-interactive${index === 0 ? " hy-glow-card" : ""}`}><div><Icon size={17} /><span>{label}</span></div><strong>{value.toLocaleString("zh-CN")}</strong><ArrowUpRight className="metric-arrow" size={18} /></Link>)}</div>}
      {user.is_hq ? <div className="home-columns"><section className="home-panel intelligence-panel"><SectionHeading title="值得关注"><Link to="/intelligence">全部情报 <ArrowUpRight size={16} /></Link></SectionHeading>{overview.recent_articles.length ? overview.recent_articles.slice(0, 5).map((article) => <Link className="brief-row" to={`/intelligence?article=${encodeURIComponent(article.id)}`} key={article.id}><div className="brief-meta"><span>{topics[article.topic] ?? article.topic}</span><time>{dateTime(article.published_at)}</time></div><h3>{article.title}</h3><p>{article.summary || "打开查看原文与分析"}</p><div className="brief-source"><span>{article.source_name} · {sourceNatureLabel(article.source_nature ?? article.nature)}</span><ArrowUpRight size={16} /></div></Link>) : <Empty title="第一份情报还在路上" text="启用信源并完成采集后，这里会显示最新内容。" action={<Link className="quiet-link" to="/settings">查看信源状态 <ArrowRight size={16} /></Link>} />}</section><div className="home-side"><section className="home-panel"><SectionHeading title="最近研究"><Link to="/research"><ArrowUpRight size={17} /><span className="sr-only">全部研究</span></Link></SectionHeading>{overview.recent_research.length ? overview.recent_research.slice(0, 4).map((research) => <Link to={`/research/${research.id}`} className="research-mini" key={research.id}><span className="research-mini-icon"><Sparkles size={17} /></span><div><h3>{research.title || research.question}</h3><small>{dateTime(research.created_at, true)}</small></div><Status value={research.status} /></Link>) : <Empty title="还没有研究任务" text="从一个具体的业务问题开始。" />}</section><section className="budget-panel"><div><span className="budget-icon"><Compass size={22} /></span><h3>今日 AI 额度</h3><Link to="/settings"><ArrowUpRight size={18} /><span className="sr-only">查看费用</span></Link></div><p><strong>{money(overview.budget.remaining)}</strong><span> / {money(overview.budget.daily_limit)}</span></p><div className="budget-track"><span style={{ width: `${Math.min(100, Math.max(0, (Number(overview.budget.spent) + Number(overview.budget.reserved)) / Math.max(Number(overview.budget.daily_limit), 1) * 100))}%` }} /></div><small>已使用 {money(overview.budget.spent)} · 处理中预留 {money(overview.budget.reserved)}</small></section></div></div> : <section className="home-panel"><SectionHeading title="商机进展"><Link to="/development/opportunities">查看商机 <ArrowUpRight size={16} /></Link></SectionHeading><div className="pipeline-summary">{overview.pipeline.map((item) => <div key={item.stage}><span>{stages[item.stage] ?? item.stage}</span><strong>{item.count}</strong></div>)}</div></section>}
    </>}
  </div>;
}
