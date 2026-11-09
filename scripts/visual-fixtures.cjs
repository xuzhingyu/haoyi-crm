// Synthetic data for preview-visual.cjs only; never import into the application bundle.
// Responses are stateless: this preview does not persist request bodies or validate permissions.
const user = { user_id:'visual-qa', display_name:'设计验收', org_id:'hq', org_name:'浩宜总部 · 测试数据', roles:['hq_admin'], is_hq:true, permissions:['crm:read','crm:write','research:write','tasks:write','sources:write','proposals:confirm'] };
const budget = {daily_limit:20,spent:3.6,reserved:1.2,remaining:15.2,currency:'CNY'};
const lead = {id:7,shop_name:'示例 · 南京新能源服务中心',province:'江苏省',city:'南京市',district:'江宁区',social_credit_code:null,address:'测试地址',new_energy_lifts:6,monthly_order_count:280,source:'人工录入',status:'待联系',phone:null,contact_name:'示例联系人',follow_ups:[],history:[]};
const leads = [lead,...['苏州汽车服务门店','无锡新能源维修中心','常州综合服务站','南通售后服务中心'].map((name,i)=>({...lead,id:i+8,shop_name:`示例 · ${name}`,city:['苏州市','无锡市','常州市','南通市'][i],monthly_order_count:120+i*45,status:i%2?'跟进中':'待联系'}))];
const articles = [
  {id:'a1',title:'新能源汽车售后服务网络：区域布局与经营观察',summary:'从区域门店分布、服务能力和客户需求出发，整理本周值得关注的行业变化。',topic:'新能源售后',source_name:'行业资料',source_nature:'media',published_at:'2026-11-06T01:30:00Z'},
  {id:'a2',title:'维修门店经营与培训交付的协同实践',summary:'梳理门店经营和交付中的常见问题，为下一步跟进提供参考。',topic:'维修经营',source_name:'行业资料',source_nature:'media',published_at:'2026-11-05T08:00:00Z'},
  {id:'a3',title:'车险服务合作的业务机会与注意事项',summary:'结合当前客户需求，了解服务合作模式与可核实的信息。',topic:'车险',source_name:'行业资料',source_nature:'media',published_at:'2026-11-05T02:00:00Z'},
].map(a=>({...a,nature:'media',url:'https://example.org/',saved:false,analysis_status:'pending',analysis:null,fetched_at:a.published_at}));
const research = [{id:'r1',title:'江苏新能源售后市场分析',question:'江苏新能源售后市场有哪些值得关注的机会？',status:'completed',phase:'研究完成',report:'## 区域服务观察\n这是用于界面验收的测试内容。\n\n建议结合实际业务数据核实门店需求、区域覆盖和交付能力。',citations:[],error:null,created_at:'2026-11-06T01:00:00Z',updated_at:'2026-11-06T01:10:00Z',cost_cny:.08,created_by:user.user_id}, {id:'r2',title:'门店服务能力与培训安排',question:'如何安排门店培训？',status:'running',phase:'正在分析资料',report:null,citations:[],created_at:'2026-11-06T02:00:00Z',updated_at:'2026-11-06T02:01:00Z'}];
const actions = [{id:1,kind:'followup',title:'核对南京门店合作需求',detail:'确认服务范围与后续拜访安排',province:'江苏省',city:'南京市',due_date:'2026-11-06',done:false,href:'#/leads?id=7'},{id:2,kind:'followup',title:'安排苏州门店培训',detail:'与门店确认培训时间',province:'江苏省',city:'苏州市',due_date:'2026-11-07',done:false,href:'#/leads?id=8'}];
const workTasks = [{id:'w1',title:'复核本周经营进展',description:'检查当前跟进与交付情况',status:'open',assignee_id:null,research_id:null,due_at:'2026-11-08T09:00:00Z',created_at:'2026-11-06T01:00:00Z',created_by:user.user_id}];
const pool = [{id:'p1',business_name:'示例 · 常州汽车服务中心',city:'常州市',district:'新北区',categories:['quick_maintenance'],freshness_date:'2026-11-05',completeness_grade:'A',status:'available'}];
const claim = {id:'c1',listing_id:'p1',business_name:'示例 · 无锡汽车服务门店',city:'无锡市',district:'新吴区',category:'beauty_maintenance',full_address:'测试地址',filing_number:'测试备案号',unified_social_credit_code:null,representative:{name:'示例负责人',role:'经营负责人'},business_contacts:[],evidence:[],status:'active',claimed_at:'2026-11-05T08:00:00Z',first_touch_due:'2026-11-09T08:00:00Z',activity_due:'2026-11-12T08:00:00Z',protected_until:'2026-12-05T08:00:00Z'};
const dashboard = {metrics:{lead_total:1286,opportunity_total:86,franchise_total:24,training_total:32,training_completed:26,estimated_pipeline_value:1680000,monthly_order_capacity:8400},funnel:[{stage:'初步沟通',count:86,estimated_value:1680000},{stage:'方案沟通',count:48,estimated_value:960000},{stage:'商务洽谈',count:32,estimated_value:640000},{stage:'已签约',count:24,estimated_value:480000}],regions:['南京市','苏州市','无锡市','常州市','南通市'].map((city,i)=>({province:'江苏省',city,lead_total:70+i*31,monthly_order_capacity:400+i*120,franchise_total:3+i,pending_batches:i,franchise_opportunities:10+i,channel_opportunities:4,delivery_risks:i===0?2:0})),training:{total:32,completed:26,completion_rate:.8125},risks:[{type:'overdue',follow_up_id:1,lead_id:7,shop_name:lead.shop_name,due_date:'2026-11-05',reason:'待确认下一步'}],goals:{period:'本月',qualified_franchise_opportunities:30,signed_franchises:8,qualified_channel_opportunities:12},unknowns:{missing_next_action:6,application_unknown:2},updated_at:'2026-11-06 09:30',actions};
const stamp = '2026-11-09T01:30:00Z';
lead.follow_ups = [{id:1,lead_id:7,status:'待联系',note:'确认培训与服务范围（本地示例）',due_date:'2026-11-10',completed_at:null}];
const sources = [
  {id:'s1',name:'示例行业观察',topic:'新能源售后',nature:'media',status:'active'},
  {id:'s2',name:'示例技术资料',topic:'三电维修',nature:'official',status:'active'},
  {id:'s3',name:'示例保险服务',topic:'车险理赔',nature:'media',status:'paused'},
].map((source,i)=>({...source,url:`https://example.org/visual/source-${i+1}.xml`,last_fetched_at:stamp,last_error:null,article_count:1}));
articles.forEach((article,i)=>Object.assign(article,{source_id:sources[i].id,source_name:sources[i].name,source_nature:sources[i].nature,nature:sources[i].nature,topic:sources[i].topic,saved:i===0,note:i===0?'本地示例批注：待核实区域需求，再安排跟进。':'',content:`${article.title}\n\n${article.summary}\n\n全部内容为本地视觉验收的合成示例，不代表真实行业事件或经营结论。\n\n资料核实\n确认来源及适用范围，再结合实际业务记录判断后续安排。`,content_kind:'rss_excerpt',analysis_status:i===0?'completed':'pending',analysis:i===0?'本地合成分析：先核实服务范围、培训资源与交付条件，再判断后续安排。':null}));
const follows = [{id:'f1',kind:'topic',value:'新能源售后',label:'新能源售后',created_at:stamp}];
Object.assign(research[0],{watch:true,include_business_context:false,report:'## 区域服务观察\n\n这是用于本地界面验收的合成报告，不代表真实经营结论。\n\n### 跟进安排\n\n- 核对门店服务范围。\n- 确认培训与交付资源。\n\n| 方向 | 当前资料 | 下一步 |\n| --- | --- | --- |\n| 区域覆盖 | 示例门店清单 | 核实服务范围 |\n| 培训交付 | 示例排期 | 确认交付条件 |\n\n### 证据与边界\n\n下列引用均为合成示例；缺少实际核验，不能用于业务决策。',citations:articles.slice(0,2).map(a=>({id:`citation-${a.id}`,title:a.title,url:a.url,source_name:a.source_name,nature:a.nature,kind:'article'}))});
Object.assign(research[1],{error:null,cost_cny:0,created_by:user.user_id,watch:false,include_business_context:false});
const row = (kind,id,data)=>({kind,id,version:1,created_at:'2026-11-08T01:00:00Z',updated_at:stamp,...data});
const studioRecords = {
  party:[row('party',101,{name:lead.shop_name,category:'加盟店',province:'江苏省',city:'南京市',contact:'示例联系人',phone:'',origin:'总部直联',status:'合作中',legacy_type:'lead',legacy_id:7,notes:'本地合成合作主体'}),row('party',102,{name:'示例 · 区域培训中心',category:'培训中心',province:'江苏省',city:'苏州市',contact:'示例负责人',phone:'',origin:'机构拓展',status:'跟进中',notes:'本地合成培训主体'})],
  relationship:[row('relationship',111,{from_id:102,to_id:101,relationship:'服务区域',region:'江苏省',headquarters_share:null,partner_share:null,distribution:'待明确',agreement:'本地示例约定'})],
  insurance:[row('insurance',121,{party_id:102,name:'示例 · 区域保险服务合作',region:'南京市',status:'协商',terms:'待核实服务范围',discount_terms:'待明确',store_ids:[101]})],
  contract:[row('contract',131,{party_id:101,name:'示例 · 加盟服务合同 DEMO-001',signed_on:'2026-11-01',fee:26800,free_seats:2,training_price:6800,promise:60000,basis:'到账',due_date:'2027-05-01',evidence:'用于视觉验收的合成合同依据'})],
  payment:[row('payment',141,{contract_id:131,category:'加盟费',direction:'收款',amount:26800,paid_on:'2026-11-02',evidence:'合成收款凭据，仅供界面验收'})],
  enrollment:[row('enrollment',151,{contract_id:131,name:'示例学员',center_id:102,category:'赠送',status:'已报名',scheduled_on:'2026-11-12',completed_on:null,price:0})],
  repair:[row('repair',161,{contract_id:131,name:'示例维修单 DEMO-001',source:'其他',insurance_id:null,dispatched:12000,completed:10000,settled:8000,received:6000,dispatched_on:'2026-11-03',completed_on:'2026-11-05',settled_on:'2026-11-06',received_on:'2026-11-08',status:'进行中',evidence:'各阶段金额独立累计的合成示例',reason:''})],
  note:[row('note',171,{party_id:101,summary:'示例 · 确认培训和服务资料安排',concern:'培训日期待确认',next_action:'核实培训排期',due_date:'2026-11-12',role:'运营协调',result:'已整理待确认事项',evidence:'本地合成沟通记录'})],
  report:[row('report',181,{name:'示例 · 11 月经营进展报告',start:'2026-11-01',end:'2026-11-09',status:'已发布',content:'本地视觉验收报告\n\n一、经营进展\n示例合同已记录加盟费 26,800 元；维修交付到账 6,000 元。各阶段金额独立统计。\n\n二、待推进事项\n确认培训排期，核实下一次回访安排。\n\n三、依据和边界\n此报告及引用记录均为合成示例，不代表真实经营数据。',evidence_ids:[141,171]}),row('report',182,{name:'示例 · 培训交付跟进草稿',start:'2026-11-01',end:'2026-11-09',status:'草稿',content:'本地示例草稿。培训排期仍待确认。',evidence_ids:[]})],
  news_source:[row('news_source',191,{name:'示例历史资讯来源',url:'https://example.org/visual/archive.xml',format:'rss',topic:'新能源维修',nature:'行业',enabled:true})],
  news_preference:[row('news_preference',201,{name:'示例区域关注',regions:'南京,苏州',automatic_regions:true,muted_topics:[]})],
};
const crmOpportunities = [{id:31,lead_id:7,shop_name:lead.shop_name,stage:'方案沟通',estimated_value:26800,opportunity_type:'加盟',next_action:'核实培训安排',next_action_date:'2026-11-12',willingness:'较高',shop_capacity:'待核实',customer_base:'待核实',status:'跟进中',exit_reason:null}];
const trainings = [{id:51,franchise_id:41,shop_name:lead.shop_name,training_name:'示例 · 新能源服务基础培训',status:'进行中',completed_at:null,notes:'本地示例排期'}];
const franchises = [{id:41,franchise_code:'DEMO-NJ-01',status:'交付中',shop_name:lead.shop_name,province:'江苏省',city:'南京市',territories:[{id:1,province:'江苏省',city:'南京市',exclusive:false}],delivery:[{id:1,name:'服务资料准备',kind:'资料',status:'已完成',planned_on:'2026-11-08',evidence:'合成验收记录'},{id:2,name:'培训交付',kind:'培训',status:'进行中',planned_on:'2026-11-12',evidence:''}],support:[{id:1,milestone:'首次回访',due_on:'2026-11-15',completed_on:null,notes:'确认资料与培训安排'}]}];
const batches = [{id:61,target_region:'江苏省 · 南京市',status:'待派发',quality:'已核对',franchise_id:null,franchise_code:null,row_count:2,dispatched_at:null,raw_feedback:'本地示例反馈',confirmed_feedback:null,rows:leads.slice(0,2).map((l,i)=>({id:i+1,lead_id:l.id,source_row:i+1,shop_name:l.shop_name,status:'待派发'})),candidates:[{franchise_id:41,franchise_code:'DEMO-NJ-01',shop_name:lead.shop_name,conflict:false,suggested:true,reason:'示例区域匹配'}]}];
const knowledge = [{id:71,title:'示例 · 门店合作资料核对清单',category:'业务指南',content:'本地验收示例。\n\n1. 核对合作主体与服务范围。\n2. 确认培训、交付与后续跟进安排。\n3. 记录依据与待补充信息。',updated_at:stamp,version:1,status:'已发布',parent_id:null}];
const notifications = [{id:81,kind:'followup',title:'示例跟进事项待处理',detail:'南京门店的后续安排待确认。',href:'#/leads?id=7',read_at:null,created_at:stamp},{id:82,kind:'training',title:'示例培训资料已更新',detail:'请检查培训日期及服务安排。',href:'#/trainings?id=51',read_at:'2026-11-08T03:00:00Z',created_at:'2026-11-08T01:30:00Z'}];
// Larger, deterministic collections exercise real page transitions without using
// customer data. Preserve the original IDs for existing detail and modal checks.
const previewCities = ['南京市','苏州市','无锡市','常州市','南通市'];
const earlierStamp = index => new Date(Date.UTC(2026,10,5,12-index)).toISOString();
for(let index=leads.length;index<25;index++) leads.push({...lead,id:7+index,shop_name:`示例 · ${previewCities[index%5]}服务门店 ${String(index+1).padStart(2,'0')}`,city:previewCities[index%5],status:index%2?'跟进中':'待联系',monthly_order_count:80+index*5,follow_ups:[],history:[]});
for(let index=articles.length;index<25;index++) {
  const seed=articles[index%3], created=earlierStamp(index);
  articles.push({...seed,id:`a${index+1}`,title:`示例资讯 ${String(index+1).padStart(2,'0')} · ${seed.topic}资料核对`,summary:'本地合成资料，仅用于列表分页、筛选及排版检查。',url:`https://example.org/visual/article-${index+1}`,published_at:created,fetched_at:created,saved:index%4===0,note:'',content:'这是本地合成的分页验收资料，不代表真实行业信息。',analysis:null,analysis_status:'pending'});
}
sources.forEach(source=>{source.article_count=articles.filter(article=>article.source_id===source.id).length;});
for(let index=research.length;index<25;index++) {
  const status=['completed','completed','queued','failed','cancelled'][index%5],created=earlierStamp(index);
  research.push({...research[0],id:`r${index+1}`,title:`示例研究 ${String(index+1).padStart(2,'0')} · ${['区域服务安排','门店培训计划','合作资料核对'][index%3]}`,question:'本地合成研究问题，仅用于分页验收。',status,phase:{completed:'研究完成',queued:'等待分析',failed:'示例请求未完成',cancelled:'已停止'}[status],report:status==='completed'?research[0].report:null,error:status==='failed'?'本地合成失败状态，可用于检查反馈。':null,created_at:created,updated_at:created,cost_cny:status==='completed'?.08:0,watch:index%3===0});
}
for(let index=pool.length;index<25;index++) pool.push({...pool[0],id:`p${index+1}`,business_name:`示例 · ${previewCities[index%5]}公开服务门店 ${String(index+1).padStart(2,'0')}`,city:previewCities[index%5],district:index%2?'示例城区':'示例新区',categories:[index%2?'quick_maintenance':'beauty_maintenance'],freshness_date:earlierStamp(index).slice(0,10)});
const claims = [claim,...pool.slice(1).map((item,index)=>({...claim,id:`c${index+2}`,listing_id:item.id,business_name:item.business_name.replace('公开','已领取'),city:item.city,district:item.district,category:item.categories[0],claimed_at:earlierStamp(index+1),activity_due:new Date(Date.UTC(2026,10,10+index,8)).toISOString(),full_address:'本地示例地址，无真实客户资料'}))];
const opportunities = claims.map((item,index)=>({id:`o${index+1}`,claim_id:item.id,business_name:item.business_name,org_id:'hq',stage:['connected','qualified','proposal','won'][index%4],expected_value:String(26800+index*500),updated_at:index===0?stamp:earlierStamp(index)}));
for(let index=workTasks.length;index<25;index++) workTasks.push({...workTasks[0],id:`w${index+1}`,title:`示例待办 ${String(index+1).padStart(2,'0')} · 服务资料复核`,description:'本地合成事项，不会写入真实业务。',status:['open','in_progress','done','cancelled'][index%4],created_at:earlierStamp(index),due_at:new Date(Date.UTC(2026,10,10+index,9)).toISOString()});
for(const kind of ['party','note']) {
  const rows=studioRecords[kind];
  for(let index=rows.length;index<25;index++) rows.push({...rows[0],id:(kind==='party'?1000:2000)+index,...(kind==='party'?{name:`示例 · ${previewCities[index%5]}合作主体 ${String(index+1).padStart(2,'0')}`,city:previewCities[index%5],status:index%2?'合作中':'跟进中',legacy_type:null,legacy_id:null}:{summary:`示例沟通 ${String(index+1).padStart(2,'0')} · 后续服务安排`,next_action:'本地示例：确认后续联系安排'}),created_at:earlierStamp(index),updated_at:earlierStamp(index)});
}
const dateFiltered = (items,url,field)=>items.filter(item=>{const date=String(item[field]||'').slice(0,10),from=url.searchParams.get('date_from')||url.searchParams.get('from'),to=url.searchParams.get('date_to')||url.searchParams.get('to'),day=url.searchParams.get('date');return (!day||date===day)&&(!from||date>=from)&&(!to||date<=to);});
const sortedByDate = (items,field)=>[...items].sort((a,b)=>String(b[field]||'').localeCompare(String(a[field]||''))||String(a.id).localeCompare(String(b.id),undefined,{numeric:true}));
const matchesQuery = (item,url,fields)=>{const q=(url.searchParams.get('q')||url.searchParams.get('search')||'').trim().toLocaleLowerCase();return !q||fields.map(field=>String(item[field]||'')).join(' ').toLocaleLowerCase().includes(q);};
const paginate = (items,url)=>{const offset=Math.max(0,Math.floor(Number(url.searchParams.get('cursor'))||0));const limit=Math.max(1,Math.min(100,Math.floor(Number(url.searchParams.get('limit'))||50)));return {items:items.slice(offset,offset+limit),next_cursor:offset+limit<items.length?String(offset+limit):null};};
// Company examples are entirely synthetic and independent of local data/ seed files.
function companyIntelligencePreview(url) {
  const companies = ['rongda','haoyi','hengbao','other-demo'].map((id,i)=>({id,name:`示例监测企业 ${['A','B','C','D'][i]}`,verification_status:'unverified',relationship_note:'本地合成主体，仅用于视觉验收'}));
  const allRecords = Array.from({length:24},(_,i)=>{const company=companies[i%companies.length];return {id:`company-local-${i+1}`,company_id:company.id,company_name:company.name,title:`${company.name} · ${['服务网络资料','公开业务索引','待核实信息'][i%3]} ${i+1}`,category:['news','business','sentiment'][i%3],summary:'完全合成的本地示例，用于检查筛选、分页、来源与核实状态，不代表真实企业信息。',source_name:'本地合成资料',source_url:`https://example.org/visual/company-${i+1}`,published_at:null,observed_at:i<15?'2026-11-09T00:45:00Z':'2026-11-08T00:45:00Z',verification_status:'unverified'};});
  const localDay = value => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  const filtered = allRecords.filter(item => (!url.searchParams.get('company_id') || item.company_id === url.searchParams.get('company_id')) && (!url.searchParams.get('category') || item.category === url.searchParams.get('category')) && (!url.searchParams.get('date') || localDay(item.observed_at) === url.searchParams.get('date')));
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 20));
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const briefings = [...new Set(allRecords.map(item => localDay(item.observed_at)))].sort().reverse().map(day => {
    const rows = allRecords.filter(item => localDay(item.observed_at) === day);
    return {day, news_count:rows.filter(item=>item.category==='news').length,business_count:rows.filter(item=>item.category==='business').length,sentiment_count:rows.filter(item=>item.category==='sentiment').length,summary:`合成示例 ${rows.length} 条，仅用于本地排版验收。`};
  });
  return {companies,items:filtered.slice((page-1)*limit,page*limit),total:filtered.length,coverage:{message:'全部为本地合成示例，采集按钮仅演示反馈；不代表真实企业信息或真实采集覆盖。',last_run_at:allRecords[0]?.observed_at ?? null,status:'partial',tianyan_status:'not_configured',schedule:'每天 08:45（北京时间；示例）'},briefings,runs:[]};
}
function response(path,method='GET') {
  const u = new URL(path,'http://localhost'); const p=u.pathname.replace(/^\/api\/v1/,'');
  if(p==='/company-intelligence/collect') return {id:'company-preview-run',mode:'daily',status:'partial',created_at:'2026-11-09T00:45:00Z',finished_at:'2026-11-09T00:46:00Z',new_records:0,error:null};
  if(p==='/company-intelligence') return companyIntelligencePreview(u);
  if(p==='/me') return user;
  if(p==='/workspace/overview') return {stats:{available_leads:pool.length,active_claims:claims.length,overdue_followups:3,opportunities:opportunities.length,open_tasks:workTasks.filter(t=>!['done','cancelled'].includes(t.status)).length,articles:articles.length},legacy_crm:{available:true,stats:{leads:1286,followups:248,opportunities:86,franchises:24,training_records:32}},pipeline:dashboard.funnel,recent_articles:sortedByDate(articles,'published_at').slice(0,3),recent_research:sortedByDate(research,'created_at').slice(0,2),budget,integrations:{aihot:true,autoloop:true,model:true}};
  if(p==='/work-tasks') return method==='GET'?paginate(sortedByDate(workTasks.filter(t=>(!u.searchParams.get('status')||t.status===u.searchParams.get('status'))&&matchesQuery(t,u,['title','description'])),'created_at'),u):workTasks[0];
  if(p.startsWith('/work-tasks/')) return workTasks[0];
  if(p==='/workspace/members') return {items:[{user_id:user.user_id,display_name:user.display_name}]};
  if(p==='/workspace/settings') return {budget,integrations:{aihot:true,autoloop:true,model:true},limits:{max_rounds:6,task_timeout_minutes:20,task_budget_cny:2},schedule:{crawl:'每 6 小时',briefing:'工作日 8:30'},sources};
  if(p==='/intelligence/articles') return paginate(sortedByDate(dateFiltered(articles.filter(a=>(!u.searchParams.get('topic')||a.topic===u.searchParams.get('topic'))&&(!u.searchParams.get('source_id')||a.source_id===u.searchParams.get('source_id'))&&matchesQuery(a,u,['title','summary'])&&(u.searchParams.get('saved')!=='true'||a.saved)&&(u.searchParams.get('followed')!=='true'||follows.some(f=>f.kind==='topic'?f.value===a.topic:f.value===a.source_id))),u,'published_at'),'published_at'),u);
  const articleMatch=p.match(/^\/intelligence\/articles\/([^/]+)(?:\/(\w+))?$/);
  if(articleMatch){const article=articles.find(a=>a.id===articleMatch[1])||articles[0];if(articleMatch[2]==='note')return {note:article.note,updated_at:stamp};if(articleMatch[2]==='save')return {saved:!article.saved};if(articleMatch[2]==='analyze')return {...article,analysis_status:'completed',analysis:articles[0].analysis};return article;}
  if(p==='/intelligence/sources') return sources;
  if(p.startsWith('/intelligence/sources/')) return sources.find(s=>p.endsWith(s.id))||sources[0];
  if(p==='/intelligence/source-config/validate') return {valid:true,count:2,items:articles.slice(0,2).map(({title,url,published_at,summary})=>({title,url,published_at,summary})),nature:'media',checked_at:stamp};
  if(p==='/intelligence/source-config'||p.startsWith('/intelligence/source-config/')){const source=sources.find(s=>p.endsWith(s.id))||sources[0];return {id:source.id,name:source.name,url:source.url,kind:'rss',topic:source.topic,interval_minutes:360,enabled:source.status==='active',item_selector:'',link_selector:'',title_selector:'',date_selector:'',version:1};}
  if(p==='/intelligence/overview') return {total:articles.length,saved:articles.filter(a=>a.saved).length,followed:articles.filter(a=>follows.some(f=>f.kind==='topic'?f.value===a.topic:f.value===a.source_id)).length,topics:[...new Set(articles.map(a=>a.topic))].map(topic=>({topic,count:articles.filter(a=>a.topic===topic).length})),sources,latest_sync_at:stamp,sync_error:null};
  if(p==='/intelligence/follows') return {items:follows};
  if(p==='/research') return method==='GET'?paginate(sortedByDate(dateFiltered(research.filter(r=>(!u.searchParams.get('status')||r.status===u.searchParams.get('status'))&&(u.searchParams.get('watch')!=='true'||r.watch)&&matchesQuery(r,u,['title','question'])),u,'created_at'),'created_at'),u):research[0];
  if(p.startsWith('/research/')) return research.find(r=>p.split('/')[2]===r.id)||research[0];
  if(p==='/pool') return paginate(sortedByDate(pool.filter(item=>['city','district','status'].every(key=>!u.searchParams.get(key)||item[key]===u.searchParams.get(key))&&(!u.searchParams.get('category')||item.categories.includes(u.searchParams.get('category')))&&matchesQuery(item,u,['business_name','city','district'])),'freshness_date'),u);
  if(p==='/claims'||p==='/hq/claims') return paginate(sortedByDate(claims.filter(item=>['city','district','status','category'].every(key=>!u.searchParams.get(key)||item[key]===u.searchParams.get(key))&&matchesQuery(item,u,['business_name','city','district'])),'claimed_at'),u);
  if(p.endsWith('/interactions')) return [];
  if(p.startsWith('/claims/')) return claims.find(item=>item.id===p.split('/')[2])||claim;
  if(p==='/hq/franchisees') return {items:[{id:'org1',name:'示例加盟组织',status:'active',member_count:2}]};
  if(p.endsWith('/memberships')) return [{id:'m1',user_id:'member1',role:'franchise_admin',display_name:'示例成员'}];
  if(p==='/opportunities') return paginate(sortedByDate(opportunities.filter(item=>(!u.searchParams.get('stage')||item.stage===u.searchParams.get('stage'))&&matchesQuery(item,u,['business_name'])),'updated_at'),u);
  if(p==='/proposals'||p==='/ai/jobs') return {items:[],next_cursor:null};
  if(p==='/crm/auth/me') return {id:1,username:'visual-qa',display_name:'设计验收',role:'operator'};
  if(p.startsWith('/crm/dashboard/')) return dashboard;
  if(p==='/crm/leads') return method==='GET'?leads.filter(item=>(!u.searchParams.get('status')||item.status===u.searchParams.get('status'))&&matchesQuery(item,u,['shop_name','province','city','district','source'])):lead;
  if(/^\/crm\/leads\/\d+$/.test(p)) return leads.find(l=>l.id===Number(p.split('/').at(-1)))||lead;
  if(p==='/crm/actions') return actions;
  if(p==='/crm/studio/actions') return actions.map(a=>({...a,status:'待处理',next_action:a.detail}));
  if(p==='/crm/studio/summary') return {parties:2,contracts:1,franchise_paid:26800,training_paid:0,training_due:0,dispatched:12000,completed:10000,settled:8000,received:6000,open_actions:actions.length};
  if(p==='/crm/studio/ai/status') return {local_configured:false,news_configured:false};
  const recordMatch=p.match(/^\/crm\/studio\/records\/([^/]+)(?:\/(\d+))?$/);
  if(recordMatch){const rows=studioRecords[recordMatch[1]]||[];return method==='GET'&&!recordMatch[2]?sortedByDate(rows.filter(item=>(!u.searchParams.get('status')||item.status===u.searchParams.get('status'))&&matchesQuery(item,u,['name','summary','city','notes'])),'updated_at'):rows.find(item=>item.id===Number(recordMatch[2]))||rows[0]||{id:999,kind:recordMatch[1],version:1,created_at:stamp};}
  if(/^\/crm\/studio\/contracts\/\d+\/totals$/.test(p)) return {franchise_paid:26800,training_paid:0,training_due:0,dispatched:12000,completed:10000,settled:8000,received:6000,seats_remaining:1,fulfillment:'进行中',overdue:false};
  if(p.startsWith('/crm/studio/evidence/')) return Object.values(studioRecords).flat().find(item=>item.id===Number(p.split('/').at(-1)))||studioRecords.note[0];
  if(p.startsWith('/crm/studio/history/')||/^\/crm\/entities\/.+\/history$/.test(p)) return [{id:1,action:'create',actor:'设计验收',detail:'本地合成记录',created_at:stamp}];
  if(p==='/crm/studio/news'){const archive=articles.map((a,i)=>({...a,id:211+i,published:a.published_at,event_date:'2026-11-06',analysis:a.analysis||'本地合成示例，尚无分析结论。',favorite:a.saved,report_material:i===0,ai_generated:i===0,suggestion:'核实资料及适用范围',party_id:101}));return {edition:{generated_at:stamp},articles:archive,favorites:archive.filter(a=>a.favorite),history:[{id:1,date:'2026-11-06',status:'success',count:archive.length,error:null}]};}
  if(p==='/crm/opportunities') return method==='GET'?crmOpportunities:crmOpportunities[0];
  if(p==='/crm/trainings') return method==='GET'?trainings:trainings[0];
  if(p==='/crm/batches') return batches;
  if(/^\/crm\/batches\/\d+$/.test(p)) return batches[0];
  if(p==='/crm/franchises') return method==='GET'?franchises:franchises[0];
  if(/^\/crm\/franchises\/\d+$/.test(p)) return franchises[0];
  if(p==='/crm/knowledge-documents') return method==='GET'?knowledge:knowledge[0];
  if(p==='/crm/notifications') return notifications;
  if(p==='/crm/reports') return [{id:91,report_name:'示例 · 经营进展摘要',period:'2026-11',pdf_url:null,pptx_url:null,published:true,published_at:stamp,voided:false}];
  if(p==='/crm/snapshots') return [{id:1,period:'2026-11',version:1,frozen_at:stamp}];
  if(/^\/crm\/snapshots\/\d+$/.test(p)) return {id:1,period:'2026-11',version:1,payload:dashboard};
  if(p==='/crm/map/city') return {province:u.searchParams.get('province')||'江苏省',city:u.searchParams.get('city')||'南京市',leads:leads.filter(l=>!u.searchParams.get('city')||l.city===u.searchParams.get('city')),opportunities:crmOpportunities,franchises,actions};
  if(p==='/crm/settings') return {default_period:'本月',reminder_days:3,notify_overdue:true,notify_batches:true};
  if(p==='/crm/assistance') return {guidance:'这是界面验收的测试回复。',citations:[],suggested_actions:[],business_sources:[],provider:'测试',sufficient_evidence:false};
  if(p.startsWith('/crm/') && method==='GET') return [];
  if(method!=='GET') return {id:'test-operation',ok:true};
  return {items:[],next_cursor:null};
}
module.exports={response,user};
