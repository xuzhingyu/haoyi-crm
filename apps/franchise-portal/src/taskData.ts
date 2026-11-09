import type { CurrentUser, PortalApi, WorkTask } from './api/types';
import { errorText } from './workspace';
export type LegacyAction={id:number;kind?:string;title:string;detail?:string;due_date?:string|null;done?:boolean;status?:string;href?:string;source_type?:string;source_id?:number|null;result?:string;reason?:string;from_studio?:boolean};
export type TaskItem={key:string;source:'workspace'|'crm'|'studio';title:string;description:string;status:string;due:string|null;assignee?:string;href?:string;task?:WorkTask;legacy?:LegacyAction};
export const isOpenTask=(task:{status:string})=>task.status==='open'||task.status==='in_progress';
const normalizeLegacy=(item:LegacyAction,source:'crm'|'studio'):TaskItem=>({key:`legacy:${item.id}`,source,title:item.title,description:item.detail??'',status:item.status==='已取消'?'cancelled':item.status==='已完成'||(!item.status&&item.done)?'done':'open',due:item.due_date??null,legacy:item,href:/^#\/(leads|opportunities|batches|franchises)(\?|$)/.test(item.href??'')?`/crm/${item.href!.slice(2)}`:undefined});
export async function loadBusinessTasks(api:PortalApi,canRead:boolean):Promise<{items:TaskItem[];errors:string[]}>{
 if(!canRead)return {items:[],errors:[]};
 const [actions,studio]=await Promise.allSettled([api.crm<LegacyAction[]>('/actions?include_done=true'),api.crm<LegacyAction[]>('/studio/actions')]);
 const errors=[actions,studio].flatMap((result,index)=>result.status==='rejected'?[`${index===0?'业务跟进':'业务待办'}：${errorText(result.reason)}`]:[]);
 const actionRows=actions.status==='fulfilled'?actions.value:[];
 // Both endpoints expose the same ActionItem IDs. Studio supplies per-user state and excludes archived rows.
 if(studio.status==='fulfilled'){
   const original=new Map(actionRows.map(item=>[item.id,item]));
   return {items:[...new Map(studio.value.map(item=>[item.id,item])).values()].map(item=>{const context=original.get(item.id);return normalizeLegacy({...context,...item,from_studio:true},context&&context.kind!=='studio'?'crm':'studio');}),errors};
 }
 return {items:[...new Map(actionRows.map(item=>[item.id,item])).values()].map(item=>normalizeLegacy(item,'crm')),errors};
}
async function openWorkTasks(api:PortalApi){
 const groups=await Promise.all(['open','in_progress'].map(async status=>{
  const items:WorkTask[]=[];let cursor:string|undefined;const visited=new Set<string>();
  do {const page=await api.getWorkTasks({status,limit:'100',...(cursor?{cursor}:{})});items.push(...page.items);cursor=page.next_cursor??undefined;if(cursor&&visited.has(cursor))throw new Error('待办分页未推进');if(cursor)visited.add(cursor);}while(cursor);
  return items;
 }));return [...new Map(groups.flat().filter(isOpenTask).map(task=>[task.id,task])).values()];
}
export async function countUnifiedOpenTasks(api:PortalApi,user:CurrentUser){
 if(!user.is_hq)return null;
 const [work,business]=await Promise.all([openWorkTasks(api),loadBusinessTasks(api,user.permissions.includes('crm:write'))]);
 if(business.errors.length)throw new Error(business.errors.join('；'));
 return work.length+business.items.filter(isOpenTask).length;
}
