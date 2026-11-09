import { Pagination } from '../ui/Pagination';
import { useClientPagination } from '../ui/usePagination';
import { Presence } from '../ui/Presence';
import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Check } from 'lucide-react';
import { Confirm, Empty, ErrorState, Loading, PageHeading } from '../components';
import { dateTime, errorText, useLoad, useWorkspace } from '../workspace';

type FollowUp = { id:number; lead_id:number; shop_name:string; note?:string; status:string; due_date:string|null; completed_at:string|null };
export function FollowupsPage() {
  const {api,user,notify}=useWorkspace(); const [params,setParams]=useSearchParams(); const filter=['all','done'].includes(params.get('status')??'')?params.get('status')!:'pending'; const setFilter=(value:string)=>setParams({status:value}); const [confirm,setConfirm]=useState<FollowUp|null>(null); const [busy,setBusy]=useState(false);
  const state=useLoad(useCallback(()=>api.crm<FollowUp[]>('/follow-ups'),[api]));
  const items=(state.data??[]).filter(item=>filter==='all'||(filter==='done'?!!item.completed_at:!item.completed_at)).sort((a,b)=>(a.due_date||'9999').localeCompare(b.due_date||'9999'));
  const pagination = useClientPagination(items, filter);
  async function complete(){if(!confirm)return;setBusy(true);try{await api.crm(`/follow-ups/${confirm.id}/complete`,{method:'POST'});notify('跟进已完成');setConfirm(null);state.reload();}catch(e){notify(errorText(e),true);}finally{setBusy(false);}}
  return <div className="page"><PageHeading title="跟进"/><div className="task-filters"><div className="segmented-control">{[['pending','待跟进'],['done','已完成'],['all','全部记录']].map(([key,label])=><button key={key} className={filter===key?'selected':''} onClick={()=>setFilter(key)}>{label}</button>)}</div><span className="muted">{items.length} 条</span></div>{state.error?<ErrorState error={state.error} retry={state.reload}/>:state.loading?<Loading/>:items.length?<div className="work-task-list">{pagination.items.map(item=><article className="work-task" key={item.id} data-hy-item-id={`task:followup:${item.id}`}><div className="work-task-main"><Link className="task-title" to={`/crm/leads?id=${item.lead_id}`}>{item.shop_name}<ArrowUpRight size={14}/></Link>{item.note&&<p>{item.note}</p>}<div className="task-meta"><span>{item.status}</span>{item.due_date&&<span className={!item.completed_at&&new Date(item.due_date).getTime()<Date.now()?'overdue':''}>截止 {dateTime(item.due_date)}</span>}{item.completed_at&&<span>完成于 {dateTime(item.completed_at,true)}</span>}</div></div>{!item.completed_at&&user.permissions.includes('crm:write')&&<button className="button secondary small" onClick={()=>setConfirm(item)}><Check size={14}/>完成</button>}</article>)}</div>:<Empty title={filter==='pending'?'暂无待跟进事项':'暂无跟进记录'} text="在客户档案里记录沟通与下一步。"/>}<Pagination label="跟进记录分页" page={pagination.page} pageSize={pagination.pageSize} total={pagination.total} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} busy={state.loading || busy} /><Presence present={Boolean(confirm)}>{confirm&&<Confirm title="完成这项跟进？" busy={busy} onClose={()=>setConfirm(null)} onConfirm={()=>void complete()}><p>{confirm.shop_name}</p><p>{confirm.note}</p></Confirm>}</Presence></div>;
}
