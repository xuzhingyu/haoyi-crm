/** Deterministic, fictional preview records. These never enter a production API. */
export type Role = 'operator' | 'leader' | 'franchise';
export type PageId = 'overview' | 'leads' | 'detail' | 'studio' | 'research' | 'tasks';
export type LeadStage = '初步接触' | '需求确认' | '方案沟通' | '已签约';
export type ContactState = '可领取' | '已领取' | '冷却中' | '禁止联系';
export interface Lead {
  id: string; name: string; city: string; district: string; stage: LeadStage;
  owner: string; amount: number | null; updated: string; contact: ContactState;
  lifecycle: '有效' | '已归档'; category: string; next: string;
}
export const leads: Lead[] = [
  { id:'HY-26001', name:'苏州星途新能源汽车服务中心', city:'苏州', district:'工业园区', stage:'方案沟通', owner:'陈宁', amount:128000, updated:'2026-11-05 09:30', contact:'已领取', lifecycle:'有效', category:'新能源维修', next:'确认合作方案' },
  { id:'HY-26002', name:'南京远帆汽车养护中心', city:'南京', district:'建邺区', stage:'需求确认', owner:'陈宁', amount:86000, updated:'2026-11-05 08:45', contact:'可领取', lifecycle:'有效', category:'综合养护', next:'安排首次沟通' },
  { id:'HY-26003', name:'无锡云驰汽车技术服务站', city:'无锡', district:'新吴区', stage:'初步接触', owner:'林悦', amount:null, updated:'2026-11-04 16:20', contact:'可领取', lifecycle:'有效', category:'新能源维修', next:'了解门店需求' },
  { id:'HY-26004', name:'常州沐光汽车服务有限公司', city:'常州', district:'武进区', stage:'已签约', owner:'林悦', amount:120000, updated:'2026-11-04 14:10', contact:'已领取', lifecycle:'有效', category:'综合养护', next:'安排技术培训' },
  { id:'HY-26005', name:'南通海岸汽车养护服务中心', city:'南通', district:'崇川区', stage:'初步接触', owner:'周泽', amount:null, updated:'2026-11-04 10:15', contact:'冷却中', lifecycle:'有效', category:'钣喷美容', next:'冷却结束后复核' },
  { id:'HY-26006', name:'苏州青禾汽车电子服务站', city:'苏州', district:'吴中区', stage:'方案沟通', owner:'陈宁', amount:68000, updated:'2026-11-03 17:40', contact:'可领取', lifecycle:'有效', category:'汽车电子', next:'核对设备清单' },
  { id:'HY-26007', name:'南京至行新能源车辆维修技术服务有限公司江宁分公司', city:'南京', district:'江宁区', stage:'初步接触', owner:'周泽', amount:0, updated:'2026-11-03 15:30', contact:'禁止联系', lifecycle:'有效', category:'新能源维修', next:'全局禁止联系' },
  { id:'HY-26008', name:'无锡知行汽车养护中心', city:'无锡', district:'滨湖区', stage:'需求确认', owner:'林悦', amount:45000, updated:'2026-11-03 11:20', contact:'可领取', lifecycle:'有效', category:'综合养护', next:'补充场地信息' },
  { id:'HY-26009', name:'苏州合悦汽车服务站', city:'苏州', district:'相城区', stage:'需求确认', owner:'陈宁', amount:33000, updated:'2026-11-02 16:00', contact:'可领取', lifecycle:'有效', category:'综合养护', next:'确认培训需求' },
  { id:'HY-26010', name:'常州新程新能源汽车服务中心', city:'常州', district:'天宁区', stage:'方案沟通', owner:'周泽', amount:null, updated:'2026-11-02 10:30', contact:'可领取', lifecycle:'有效', category:'新能源维修', next:'补充服务范围' },
  { id:'HY-26011', name:'南京嘉航汽车服务中心', city:'南京', district:'浦口区', stage:'已签约', owner:'林悦', amount:200000, updated:'2026-11-01 14:40', contact:'已领取', lifecycle:'有效', category:'综合养护', next:'确认首批交付' },
  { id:'HY-26012', name:'苏州望川汽车维修服务站', city:'苏州', district:'吴江区', stage:'初步接触', owner:'周泽', amount:null, updated:'2026-11-01 09:10', contact:'可领取', lifecycle:'有效', category:'钣喷美容', next:'安排首次沟通' },
];
export const stages: LeadStage[] = ['初步接触','需求确认','方案沟通','已签约'];
export const stageRows = stages.map(label => ({ label, value:leads.filter(row => row.stage===label).length }));
export const regionRows = ['苏州','南京','无锡','常州','南通'].map(label=>({ label, value:leads.filter(row=>row.city===label).length }));
export const money = (value:number|null) => value===null ? '—' : new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY',minimumFractionDigits:2}).format(value);
export interface Task { id:string; title:string; source:'客户跟进'|'经营工作室'|'AI 研究'|'公开线索'; due:string; owner:string; done:boolean; overdue:boolean; target:PageId; }
export const initialTasks:Task[] = [
  {id:'task-1',title:'确认星途门店合作方案',source:'客户跟进',due:'2026-11-05 14:00',owner:'陈宁',done:false,overdue:false,target:'detail'},
  {id:'task-2',title:'补齐沐光门店培训名单',source:'经营工作室',due:'2026-11-04 17:00',owner:'林悦',done:false,overdue:true,target:'studio'},
  {id:'task-3',title:'复核新能源维修需求研究',source:'AI 研究',due:'2026-11-06 10:00',owner:'陈宁',done:false,overdue:false,target:'research'},
  {id:'task-4',title:'完成云驰门店首次联系',source:'公开线索',due:'2026-11-06 17:00',owner:'陈宁',done:false,overdue:false,target:'detail'},
  {id:'task-5',title:'核对嘉航合同付款计划',source:'经营工作室',due:'2026-11-03 15:00',owner:'林悦',done:true,overdue:false,target:'studio'},
];
