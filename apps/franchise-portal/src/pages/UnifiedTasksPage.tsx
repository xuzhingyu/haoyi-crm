import { Pagination } from '../ui/Pagination';
import { useClientPagination } from '../ui/usePagination';
import { Presence } from '../ui/Presence';
import { lazy, Suspense, useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, Check, Circle, FileText, Plus, UserRound } from 'lucide-react';
import type { PortalApi, WorkTask } from '../api/types';
import { Confirm, Empty, ErrorState, Loading, Modal, PageHeading } from '../components';
import { dateTime, errorText, useLoad, useWorkspace } from '../workspace';
import { TaskModal } from './WorkspacePages';
import { loadBusinessTasks, isOpenTask, type LegacyAction, type TaskItem } from '../taskData';

const BusinessEditor=lazy(()=>import('../legacy/TaskEditor'));
async function loadAllWorkTasks(api: PortalApi, status: string) {
  const tasks = new Map<string, WorkTask>();
  const visited = new Set<string>();
  let cursor: string | null = null;
  do {
    const result = await api.getWorkTasks({ status, limit: '100', ...(cursor ? { cursor } : {}) });
    result.items.forEach(task => tasks.set(task.id, task));
    cursor = result.next_cursor;
    if (cursor && visited.has(cursor)) throw new Error('待办分页未推进，请刷新后重试');
    if (cursor) visited.add(cursor);
  } while (cursor);
  // Merge and sort the complete set once so newly fetched earlier due dates cannot move behind viewed pages.
  return { items: [...tasks.values()] };
}
export function UnifiedTasksPage(){
  const {api,user,notify}=useWorkspace();const canBusinessWrite=user.permissions.includes('crm:write')&&user.is_hq;const [params,setParams]=useSearchParams();const status=['unfinished','open','in_progress','done','cancelled'].includes(params.get('status')??'')?params.get('status')!:'';const setStatus=(value:string)=>setParams(value?{status:value}:{});const queryStatus=status==='unfinished'?'':status;const [source,setSource]=useState('');const [busy,setBusy]=useState(false);const [editing,setEditing]=useState<WorkTask|'new'|null>(null);const [businessEdit,setBusinessEdit]=useState<LegacyAction|'new'|null>(null);const [completing,setCompleting]=useState<LegacyAction|null>(null);const [quick,setQuick]=useState(false);
  const state=useLoad(useCallback(()=>loadAllWorkTasks(api,queryStatus),[api,queryStatus]));
  const members=useLoad(useCallback(()=>api.getMembers(),[api]));
  const legacy=useLoad(useCallback(()=>loadBusinessTasks(api,canBusinessWrite),[api,canBusinessWrite]));
  function reload(){state.reload();legacy.reload();}
  async function update(task:WorkTask,newStatus:string){setBusy(true);try{await api.updateWorkTask(task.id,{status:newStatus});notify('待办状态已更新');reload();}catch(e){notify(errorText(e),true);}finally{setBusy(false);}}
  async function completeBusiness(){if(!completing)return;setBusy(true);try{await api.crm(`/actions/${completing.id}/complete`,{method:'POST'});notify('业务跟进已完成');setCompleting(null);legacy.reload();}catch(e){notify(errorText(e),true);}finally{setBusy(false);}}
  const workspaceItems:TaskItem[]=(state.error?[]:state.data?.items??[]).map(task=>({key:`workspace:${task.id}`,source:'workspace',title:task.title,description:task.description,status:task.status,due:task.due_at,assignee:members.data?.items.find(member=>member.user_id===task.assignee_id)?.display_name??(task.assignee_id===user.user_id?user.display_name:task.assignee_id||'未分配'),href:task.research_id?`/research/${task.research_id}`:undefined,task}));
  const items=[...workspaceItems,...(legacy.error?[]:legacy.data?.items??[])].filter(item=>(!status||(status==='unfinished'?isOpenTask(item):item.status===status))&&(!source||item.source===source)).sort((a,b)=>Number(['done','cancelled'].includes(a.status))-Number(['done','cancelled'].includes(b.status))||(a.due||'9999').localeCompare(b.due||'9999'));
  const pagination=useClientPagination(items,JSON.stringify([status,source]));
  const labels={workspace:'内部待办',crm:'业务跟进',studio:'业务待办'};
  return <div className="page"><PageHeading title="待办" action={<div className="workspace-actions">{canBusinessWrite&&<button className="button secondary" onClick={()=>setQuick(true)}>记录沟通</button>}<button className="button primary" onClick={()=>source==='studio'&&canBusinessWrite?setBusinessEdit('new'):setEditing('new')}><Plus size={17}/>新建待办</button></div>}/><div className="task-filters"><div className="segmented-control">{[['','全部'],['unfinished','未完成'],['open','待办'],['in_progress','进行中'],['done','已完成'],['cancelled','已取消']].map(([key,label])=><button key={key} className={status===key?'selected':''} onClick={()=>setStatus(key)}>{label}</button>)}</div><select aria-label="待办来源" value={source} onChange={e=>setSource(e.target.value)}><option value="">全部来源</option><option value="workspace">内部待办</option>{canBusinessWrite&&<><option value="crm">业务跟进</option><option value="studio">业务待办</option></>}</select></div>
    {state.error&&<ErrorState error={state.error} retry={state.reload}/>} {legacy.error&&<ErrorState error={legacy.error} retry={legacy.reload}/>} {legacy.data?.errors.map(error=><ErrorState key={error} error={error} retry={legacy.reload}/>)}
    {state.loading||legacy.loading?<Loading/>:items.length?<div className="work-task-list">{pagination.items.map(item=><article className={`work-task ${item.status==='done'?'task-done':''}`} key={item.key} data-hy-item-id={`task:${item.key}`}><button className={`task-check ${item.status==='done'?'checked':''}`} disabled={busy||(item.source==='crm'&&!item.legacy?.from_studio&&item.status==='done')} aria-label={`${item.status==='done'?'重新打开':'完成'}：${item.title}`} onClick={()=>item.task?void update(item.task,item.status==='done'?'open':'done'):item.source==='crm'&&!item.legacy?.from_studio?setCompleting(item.legacy!):setBusinessEdit({...item.legacy!,status:item.status==='done'?'待处理':'已完成'})}>{item.status==='done'?<Check size={17}/>:<Circle size={20}/>}</button><div className="work-task-main">{item.source==='crm'?item.href?<Link className="task-title" to={item.href}>{item.title}</Link>:<strong className="task-title">{item.title}</strong>:<button className="task-title" onClick={()=>item.task?setEditing(item.task):setBusinessEdit(item.legacy!)}>{item.title}</button>}{item.description&&<p>{item.description}</p>}<div className="task-meta"><span className="task-source">{labels[item.source]}</span>{item.assignee&&<span><UserRound size={13}/>{item.assignee}</span>}{item.due&&<span className={item.status!=='done'&&new Date(item.due).getTime()<Date.now()?'overdue':''}><CalendarDays size={13}/>{dateTime(item.due)}</span>}{item.href&&<Link to={item.href}><FileText size={13}/>{item.source==='workspace'?'关联研究':'查看业务'}<ArrowUpRight size={12}/></Link>}</div></div>{item.task?<label className="task-status-select"><span className="sr-only">{item.title} 的状态</span><select value={item.status} disabled={busy} onChange={e=>void update(item.task!,e.target.value)}><option value="open">待办</option><option value="in_progress">进行中</option><option value="done">已完成</option><option value="cancelled">已取消</option></select></label>:<span className="muted">{item.status==='done'?'已完成':item.status==='cancelled'?'已取消':'待处理'}</span>}</article>)}</div>:!state.error&&!legacy.error?<Empty title="暂无匹配的待办"/>:null}
    <Pagination label="待办列表分页" page={pagination.page} pageSize={pagination.pageSize} total={state.error||legacy.error||legacy.data?.errors.length?undefined:pagination.total} hasNext={pagination.page*pagination.pageSize<pagination.total} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} busy={busy||state.loading||legacy.loading}/>
    <Presence present={Boolean(editing)}>{editing&&<TaskModal task={editing==='new'?undefined:editing} members={members.data?.items??[{user_id:user.user_id,display_name:user.display_name}]} onClose={()=>setEditing(null)} onSaved={()=>{setEditing(null);reload();}}/>}</Presence>
    <Presence present={Boolean(businessEdit)}>{businessEdit&&<Suspense fallback={<Loading/>}><BusinessEditor row={businessEdit==='new'?undefined:{...businessEdit}} onClose={()=>setBusinessEdit(null)} onSaved={()=>{notify('业务待办已保存');legacy.reload();}}/></Suspense>}</Presence>
    <Presence present={Boolean(quick)}>{quick&&<Modal title="记录沟通" onClose={()=>setQuick(false)} wide><Suspense fallback={<Loading/>}><BusinessEditor quick onClose={()=>setQuick(false)} onSaved={()=>{notify('沟通记录已保存');legacy.reload();}}/></Suspense></Modal>}</Presence>
    <Presence present={Boolean(completing)}>{completing&&<Confirm title="完成这项业务跟进？" busy={busy} onClose={()=>setCompleting(null)} onConfirm={()=>void completeBusiness()}><p>{completing.title}</p><p>{completing.detail}</p></Confirm>}</Presence>
  </div>;
}
