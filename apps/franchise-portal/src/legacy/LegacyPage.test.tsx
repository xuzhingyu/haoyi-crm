import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { WorkspaceContext } from '../workspace';
import type { CurrentUser, PortalApi } from '../api/types';
import LegacyPage from './LegacyPage';
import { api } from './services/api';
import { studio } from './services/studio';

vi.mock('./services/api', () => ({ api: { me:vi.fn(), notifications:vi.fn(), archiveNotification:vi.fn(), leads:vi.fn(), lead:vi.fn(), history:vi.fn() }, downloadReport:vi.fn() }));
const user:CurrentUser={user_id:'operator',display_name:'业务账号',org_id:'hq',org_name:'总部',is_hq:true,roles:['hq_admin'],permissions:['crm:write']};
const businessLead={id:7,shop_name:'维修门店',province:'江苏省',city:'南京市',district:null,social_credit_code:null,address:null,new_energy_lifts:null,monthly_order_count:null,source:'人工录入',follow_ups:[],history:[]};
function mount(path:string){window.history.replaceState({},'',path);return render(<BrowserRouter><WorkspaceContext.Provider value={{api:{} as PortalApi,user,notify:vi.fn()}}><div id="legacy-portals" className="legacy-crm"/><div className="app-shell"><Link to="/crm/delivery">切换合同</Link><Routes><Route path="/crm/:section" element={<LegacyPage/>}/></Routes></div></WorkspaceContext.Provider></BrowserRouter>);}
beforeEach(()=>{vi.resetAllMocks();sessionStorage.clear();vi.stubGlobal('scrollTo',vi.fn());vi.mocked(api.me).mockResolvedValue({id:1,username:'operator',display_name:'业务账号',role:'operator'});vi.mocked(api.leads).mockResolvedValue([businessLead]);vi.mocked(api.lead).mockResolvedValue(businessLead);vi.mocked(api.history).mockResolvedValue([]);});
describe('native business integration',()=>{
 it('pages filtered leads while preserving the full detail sequence and the active list page',async()=>{
  const leads=Array.from({length:24},(_,index)=>({...businessLead,id:index+1,shop_name:`分页门店 ${String(index+1).padStart(2,'0')}`}));
  vi.mocked(api.leads).mockResolvedValue(leads);vi.mocked(api.lead).mockImplementation(async id=>leads.find(lead=>lead.id===id)!);
  mount('/crm/leads');await screen.findByRole('button',{name:'分页门店 01'});
  expect(screen.queryByRole('button',{name:'分页门店 11'})).not.toBeInTheDocument();
  const pager=within(screen.getByRole('navigation',{name:'客户线索分页'}));
  await userEvent.click(pager.getByRole('button',{name:'下一页'}));
  expect(screen.queryByRole('button',{name:'分页门店 01'})).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button',{name:'分页门店 20'}));
  const detail=await screen.findByRole('dialog',{name:'分页门店 20'});
  expect(within(detail).getByText('第 20 条 / 共 24 条')).toBeInTheDocument();
  await userEvent.click(within(detail).getByRole('button',{name:'下一条'}));
  const nextDetail=await screen.findByRole('dialog',{name:'分页门店 21'});
  await userEvent.click(within(nextDetail).getByRole('button',{name:'关闭'}));
  await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(pager.getByRole('button',{name:'第 2 页'})).toHaveAttribute('aria-current','page');
  await userEvent.type(screen.getByRole('textbox',{name:'搜索线索'}),'24');
  expect(screen.getByRole('button',{name:'分页门店 24'})).toBeInTheDocument();
  expect(pager.getByRole('button',{name:'上一页'})).toBeDisabled();
  expect(screen.queryByRole('button',{name:'分页门店 11'})).not.toBeInTheDocument();
 });
 it('paginates the filtered studio ledger and resets the page when searching',async()=>{
  const rows=Array.from({length:13},(_,index)=>({id:index+1,kind:'party',version:1,created_at:'2026-11-09',name:`分页机构 ${String(index+1).padStart(2,'0')}`,category:'维修门店',city:'南京市',status:'合作中'}));
  vi.spyOn(studio,'list').mockImplementation(async kind=>kind==='party'?rows:[]);
  mount('/crm/partners');await screen.findByRole('button',{name:'分页机构 01'});
  expect(screen.queryByRole('button',{name:'分页机构 11'})).not.toBeInTheDocument();
  const pager=within(screen.getByRole('navigation',{name:'机构与门店分页'}));
  await userEvent.click(pager.getByRole('button',{name:'下一页'}));
  expect(screen.getByRole('button',{name:'分页机构 11'})).toBeInTheDocument();
  await userEvent.type(screen.getByRole('textbox',{name:'搜索机构与门店'}),'13');
  expect(screen.getByRole('button',{name:'分页机构 13'})).toBeInTheDocument();
  expect(pager.getByRole('button',{name:'上一页'})).toBeDisabled();
  expect(screen.queryByRole('button',{name:'分页机构 11'})).not.toBeInTheDocument();
 });
 it('returns to the preceding valid page after archiving the last notification on a page',async()=>{
  const notifications=Array.from({length:11},(_,index)=>({id:index+1,kind:'followup',title:`分页通知 ${index+1}`,detail:'核对需求',href:'',read_at:null,created_at:'2026-11-09'}));
  vi.mocked(api.notifications).mockResolvedValue(notifications);
  vi.mocked(api.archiveNotification).mockImplementation(async()=>{vi.mocked(api.notifications).mockResolvedValue(notifications.slice(0,10));return notifications[10];});
  mount('/crm/notifications');await screen.findByText('分页通知 1');
  const pager=within(screen.getByRole('navigation',{name:'通知分页'}));
  await userEvent.click(pager.getByRole('button',{name:'下一页'}));
  expect(screen.getByText('分页通知 11')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button',{name:'归档'}));
  await screen.findByText('分页通知 1');
  expect(pager.getByRole('button',{name:'上一页'})).toBeDisabled();
  expect(screen.queryByText('分页通知 11')).not.toBeInTheDocument();
  expect(api.archiveNotification).toHaveBeenCalledWith(11);
 });
 it('keeps historical news useful without exposing inactive collection controls',async()=>{
  const article={id:9,kind:'article',version:1,created_at:'2026-10-01',title:'历史资讯案例',url:'https://example.org/history',published:'2026-10-01',source_name:'行业来源',nature:'行业',topic:'新能源维修',summary:'已归档内容',favorite:false,report_material:false};
  vi.spyOn(studio,'news').mockResolvedValue({status:'pending',articles:[article],favorites:[],history:[]});
  vi.spyOn(studio,'list').mockImplementation(async kind=>kind==='news_source'?[{id:2,kind,version:1,created_at:'2026-10-01',name:'历史来源配置',url:'https://example.org/rss',format:'rss',topic:'新能源维修',nature:'行业',enabled:true}]:[]);
  const collect=vi.spyOn(studio,'refreshNews');const articleWrite=vi.spyOn(studio,'article').mockResolvedValue({});const createAction=vi.spyOn(studio,'articleAction').mockResolvedValue({});
  mount('/crm/news');expect(await screen.findByText('历史资讯案例')).toBeInTheDocument();
  expect(screen.getByRole('link',{name:'查看最新情报'})).toHaveAttribute('href','/intelligence');expect(screen.getByRole('link',{name:'信源管理'})).toHaveAttribute('href','/settings');
  expect(screen.queryByRole('button',{name:'刷新晨报'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'减少此类推荐'})).not.toBeInTheDocument();expect(screen.queryByText(/每天08:00|北京时间08:00/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button',{name:'收藏'}));expect(articleWrite).toHaveBeenCalledWith(9,{favorite:true});
  await userEvent.click(screen.getByRole('button',{name:'加入报告素材'}));expect(articleWrite).toHaveBeenCalledWith(9,{report_material:true});
  await userEvent.click(screen.getByRole('button',{name:'关联业务 / 转待办'}));await userEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'确认创建待办'}));expect(createAction).toHaveBeenCalledWith(9,expect.objectContaining({next_action:'核实资讯及合作适用条件'}),expect.any(String));
  await waitFor(()=>expect(screen.queryByRole('dialog',{name:'确认资讯跟进事项'})).not.toBeInTheDocument());
  await userEvent.click(screen.getByRole('button',{name:'历史来源'}));await userEvent.click(await screen.findByRole('button',{name:'查看详情'}));expect(screen.queryByRole('button',{name:'编辑记录'})).not.toBeInTheDocument();await userEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'关闭'}));
  expect(screen.queryByRole('button',{name:'新增资讯来源'})).not.toBeInTheDocument();await userEvent.click(screen.getByRole('button',{name:'历史偏好'}));expect(screen.queryByRole('button',{name:'新增关注偏好'})).not.toBeInTheDocument();expect(collect).not.toHaveBeenCalled();
 });
 it('labels the original studio news preview as history and links to the current briefing',async()=>{
  vi.spyOn(studio,'news').mockResolvedValue({articles:[]});vi.spyOn(studio,'actions').mockResolvedValue([]);vi.spyOn(studio,'summary').mockResolvedValue({});vi.spyOn(studio,'list').mockResolvedValue([]);vi.spyOn(studio,'aiStatus').mockResolvedValue({local_configured:false,news_configured:false});
  mount('/crm/personal');expect(await screen.findByText('历史行业资讯')).toBeInTheDocument();expect(screen.getByRole('link',{name:'行业情报'})).toHaveAttribute('href','/intelligence');expect(screen.getByText(/工作日08:30更新/)).toBeInTheDocument();expect(screen.queryByText(/每天08:00|北京时间08:00/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button',{name:'查看历史'}));expect(await screen.findByRole('heading',{name:'历史资讯与收藏'})).toBeInTheDocument();expect(window.location.pathname).toBe('/crm/news');
 });
 it('resets native ledger selection when switching business sections without a page reload',async()=>{
  vi.spyOn(studio,'list').mockResolvedValue([]);mount('/crm/partners');
  expect(await screen.findByRole('button',{name:'新增机构与门店'})).toBeInTheDocument();
  await userEvent.click(screen.getByRole('link',{name:'切换合同'}));
  expect(await screen.findByRole('button',{name:'新增加盟合同'})).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'新增机构与门店'})).not.toBeInTheDocument();
 });

 it('opens an original notification source in the React route without a hash or iframe',async()=>{
  vi.mocked(api.notifications).mockResolvedValue([{id:1,kind:'followup',title:'跟进提醒',detail:'核对需求',href:'#/leads?id=7',read_at:null,created_at:'2026-11-05'}]);
  mount('/crm/notifications');await userEvent.click(await screen.findByRole('link',{name:'查看来源'}));
  expect(window.location.pathname).toBe('/crm/leads');expect(window.location.search).toContain('id=7');expect(window.location.hash).toBe('');
  const dialog=await screen.findByRole('dialog',{name:'维修门店'});expect(dialog.closest('[inert]')).toBeNull();expect(document.querySelector('.app-shell')).toHaveAttribute('inert');expect(document.querySelector('iframe')).toBeNull();
  await userEvent.click(within(dialog).getByRole('button',{name:'关闭'}));await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());expect(document.querySelector('.app-shell')).not.toHaveAttribute('inert');
 });
 it('keeps executive users outside private original business detail',async()=>{
  vi.mocked(api.me).mockResolvedValue({id:2,username:'executive',display_name:'经营查看',role:'executive'});mount('/crm/partners');
  expect(await screen.findByText('当前账号可查看经营汇总与已发布报告。')).toBeInTheDocument();expect(api.leads).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:/新增机构/})).not.toBeInTheDocument();
 });
});
