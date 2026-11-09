import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SpecPage, type PageId, type Role } from './pages';
import { Catalog } from './catalog';

const notify = vi.fn();
function Preview({initial='leads',role='operator'}:{initial?:PageId;role?:Role}) {
  const [page,setPage]=useState<PageId>(initial);
  return <div className="hy-spec"><nav><button onClick={()=>setPage('leads')}>测试导航客户</button><button onClick={()=>setPage('research')}>测试导航研究</button><button onClick={()=>setPage('tasks')}>测试导航待办</button></nav><SpecPage page={page} role={role} onNavigate={setPage} notify={notify}/></div>;
}
beforeEach(()=>{
  notify.mockReset();localStorage.clear();
  Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value(){this.setAttribute('open','');}});
  Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value(){this.removeAttribute('open');}});
});

describe('UI specification business specimens',()=>{
  it('loads cursor records, clears selection when filters change, and persists density',async()=>{
    const user=userEvent.setup();render(<Preview/>);
    const table=screen.getByRole('table',{name:'客户记录'});
    expect(within(table).getAllByRole('row')).toHaveLength(9);
    await user.click(within(table).getByRole('checkbox',{name:'选择记录 HY-26001'}));
    expect(screen.getByText('已选 1 条已加载记录')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox',{name:'搜索客户'}),'南京');
    expect(screen.queryByText('已选 1 条已加载记录')).not.toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    await user.click(screen.getByRole('button',{name:'清空筛选'}));
    await user.click(screen.getByRole('button',{name:'加载更多'}));
    expect(within(table).getAllByRole('row')).toHaveLength(13);
    expect(screen.queryByRole('button',{name:'加载更多'})).not.toBeInTheDocument();
    await user.click(within(screen.getByRole('radiogroup',{name:'列表密度'})).getByRole('radio',{name:'紧凑'}));
    expect(localStorage.getItem('hy-spec-density')).toBe('compact');
  });

  it('validates new records and keeps them when returning from their detail',async()=>{
    const user=userEvent.setup();render(<Preview/>);
    await user.click(screen.getByRole('button',{name:'新建客户'}));
    await user.click(screen.getByRole('button',{name:'创建客户'}));
    expect(screen.getByText('请输入客户名称')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox',{name:'客户名称'}),'示例新客户');
    await user.dblClick(screen.getByRole('button',{name:'创建客户'}));
    await waitFor(()=>expect(screen.queryByRole('dialog',{name:'新建客户'})).not.toBeInTheDocument());
    await user.click(within(screen.getByRole('table',{name:'客户记录'})).getByRole('button',{name:'示例新客户'}));
    expect(screen.getByRole('heading',{name:'客户详情'})).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'返回列表'}));
    expect(within(screen.getByRole('table',{name:'客户记录'})).getByRole('button',{name:'示例新客户'})).toBeInTheDocument();
    expect(notify.mock.calls.filter(call=>call[0]==='客户已添加到本地样板')).toHaveLength(1);
  });

  it('routes dirty footer cancellation through draft protection',async()=>{
    const user=userEvent.setup();render(<Preview/>);
    await user.click(screen.getByRole('button',{name:'新建客户'}));
    await user.type(screen.getByRole('textbox',{name:'客户名称'}),'未保存的客户');
    await user.click(within(screen.getByRole('dialog',{name:'新建客户'})).getByRole('button',{name:'取消'}));
    expect(screen.getByRole('dialog',{name:'放弃未保存的修改？'})).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'继续编辑'}));
    expect(screen.getByRole('textbox',{name:'客户名称'})).toHaveValue('未保存的客户');
  });

  it('preserves follow-up drafts through a conflict and saves the chosen next date',async()=>{
    const user=userEvent.setup();render(<Preview initial="detail"/>);
    await user.click(screen.getByRole('button',{name:'添加跟进'}));
    await user.click(screen.getByRole('button',{name:'保存跟进'}));
    expect(screen.getByText('请填写本次沟通记录')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox',{name:'沟通记录'}),'已确认培训安排');
    fireEvent.change(screen.getByLabelText('下一次跟进日期'),{target:{value:'2026-11-12'}});
    await user.click(screen.getByRole('checkbox',{name:'演示版本冲突'}));
    await user.click(screen.getByRole('button',{name:'保存跟进'}));
    expect(screen.getByRole('alert')).toHaveTextContent('记录已由其他人更新');
    await user.click(screen.getByRole('button',{name:'刷新并保留草稿'}));
    expect(screen.getByRole('textbox',{name:'沟通记录'})).toHaveValue('已确认培训安排');
    await user.click(screen.getByRole('button',{name:'保存跟进'}));
    await waitFor(()=>expect(screen.queryByRole('dialog',{name:'添加跟进'})).not.toBeInTheDocument());
    expect(screen.getByText('已确认培训安排')).toBeInTheDocument();
    expect(screen.getByText('2026-11-12 14:00')).toBeInTheDocument();
  });

  it('keeps the leader read-only for business records but allows research tasks',async()=>{
    const user=userEvent.setup();render(<Preview role="leader"/>);
    expect(screen.queryByRole('button',{name:'新建客户'})).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox',{name:'全选当前列表'})).not.toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'测试导航研究'}));
    expect(screen.queryByRole('button',{name:'查看并确认'})).not.toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'创建复核待办'}));
    await user.click(screen.getByRole('button',{name:'测试导航待办'}));
    expect(screen.getByRole('button',{name:'完成：复核维修能力建设研究'})).toBeInTheDocument();
  });

  it('keeps franchise public data separate and a claimed record survives navigation',async()=>{
    const user=userEvent.setup();render(<Preview role="franchise"/>);
    let table=screen.getByRole('table',{name:'公开门店线索'});
    expect(within(table).queryByRole('columnheader',{name:'预计金额'})).not.toBeInTheDocument();
    const row=within(table).getByRole('button',{name:'南京远帆汽车养护中心'}).closest('tr')!;
    await user.click(within(row).getByRole('button',{name:'查看'}));
    expect(screen.getByRole('heading',{name:'公开线索详情'})).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'添加跟进'})).not.toBeInTheDocument();
    expect(screen.queryByText('预计合作金额')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'返回列表'}));
    table=screen.getByRole('table',{name:'公开门店线索'});
    const available=within(table).getByRole('button',{name:'南京远帆汽车养护中心'}).closest('tr')!;
    await user.click(within(available).getByRole('button',{name:'领取'}));
    await user.click(within(available).getByRole('button',{name:'查看'}));
    expect(screen.getByRole('heading',{name:'已领取线索'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'添加跟进'})).toBeInTheDocument();
    expect(screen.queryByText('完成合作需求沟通')).not.toBeInTheDocument();
  });

  it('completes tasks, restores them, and withholds incomplete totals',async()=>{
    const user=userEvent.setup();render(<Preview initial="tasks"/>);
    await user.click(screen.getByRole('button',{name:'完成：确认星途门店合作方案'}));
    expect(screen.queryByRole('button',{name:'完成：确认星途门店合作方案'})).not.toBeInTheDocument();
    await user.click(within(screen.getByRole('group',{name:'待办状态'})).getByRole('button',{name:'已完成'}));
    await user.click(screen.getByRole('button',{name:'恢复：确认星途门店合作方案'}));
    await user.click(within(screen.getByRole('group',{name:'待办状态'})).getByRole('button',{name:'未完成'}));
    expect(screen.getByRole('button',{name:'完成：确认星途门店合作方案'})).toBeInTheDocument();
    await user.click(screen.getByText('状态演示'));
    await user.click(screen.getByRole('button',{name:'演示来源失败'}));
    expect(screen.getByRole('alert')).toHaveTextContent('暂不显示完整总数');
    expect(screen.getAllByText('—')).toHaveLength(3);
  });

  it('changes research phases without fabricated percentages and separates budget reserves',async()=>{
    const user=userEvent.setup();render(<Preview initial="research"/>);
    await user.click(screen.getByRole('button',{name:'开始研究'}));
    expect(screen.getByRole('status')).toHaveTextContent('等待研究任务开始');
    expect(screen.getByRole('img',{name:'已使用3.60元，预留2.00元，剩余14.40元'})).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'推进到运行'}));
    expect(screen.getByRole('status')).toHaveTextContent('正在核对公开资料');
    await user.click(screen.getByRole('button',{name:'停止任务'}));
    expect(screen.getByRole('img',{name:'已使用3.60元，预留0.00元，剩余16.40元'})).toBeInTheDocument();
  });

  it('filters through the shared Select and clears selected records',async()=>{
    const user=userEvent.setup();render(<Preview/>);
    const table=screen.getByRole('table',{name:'客户记录'});
    await user.click(within(table).getByRole('checkbox',{name:'选择记录 HY-26001'}));
    await user.click(screen.getByRole('combobox',{name:'城市'}));
    await user.click(screen.getByRole('option',{name:'南京'}));
    expect(screen.queryByText('已选 1 条已加载记录')).not.toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(screen.getByRole('combobox',{name:'城市'})).toHaveFocus();
  });

  it('lets the task search be cleared without changing task completion',async()=>{
    const user=userEvent.setup();render(<Preview initial="tasks"/>);
    await user.type(screen.getByRole('textbox',{name:'搜索待办'}),'星途');
    expect(screen.getAllByRole('button',{name:/^完成：/})).toHaveLength(1);
    await user.click(screen.getByRole('button',{name:'清除待办搜索'}));
    expect(screen.getByRole('textbox',{name:'搜索待办'})).toHaveValue('');
    expect(screen.getAllByRole('button',{name:/^完成：/})).toHaveLength(4);
  });
});

describe('glass and solid component specimens',()=>{
  it('keeps the two material examples interactive and independent',async()=>{
    const user=userEvent.setup();render(<div className="hy-spec"><Catalog notify={notify}/></div>);
    await user.click(screen.getByRole('combobox',{name:'玻璃样例统计周期'}));
    await user.click(screen.getByRole('option',{name:'上月'}));
    expect(screen.getByRole('combobox',{name:'玻璃样例统计周期'})).toHaveTextContent('上月');
    expect(screen.getByRole('combobox',{name:'实色样例统计周期'})).toHaveTextContent('本月');
  });

  it('demonstrates mixed, disabled and live switch states with labelled validation',async()=>{
    const user=userEvent.setup();render(<div className="hy-spec"><Catalog notify={notify}/></div>);
    await user.click(screen.getByRole('tab',{name:'按钮与表单'}));
    const mixed=screen.getByRole('checkbox',{name:'当前列表部分已选'});
    expect(mixed).toBePartiallyChecked();
    await user.click(mixed);expect(mixed).toBeChecked();
    await user.click(screen.getByRole('button',{name:'恢复部分选择'}));expect(mixed).toBePartiallyChecked();
    expect(screen.getByRole('checkbox',{name:'系统保留项'})).toBeDisabled();
    expect(screen.getByRole('checkbox',{name:'系统保留项'})).toBeChecked();
    const preference=screen.getByRole('switch',{name:'邮件通知'});
    expect(preference).not.toBeChecked();await user.click(preference);expect(preference).toBeChecked();
    expect(screen.getByRole('switch',{name:'系统审计'})).toBeDisabled();
    const failedSwitch=screen.getByRole('switch',{name:'预算告警'});
    expect(failedSwitch).toHaveAccessibleDescription('设置保存失败，请重新开启。');
    await user.click(failedSwitch);expect(failedSwitch).toHaveAttribute('aria-invalid','false');
    const radioGroup=screen.getByRole('group',{name:'通知范围'});
    expect(radioGroup).toHaveAttribute('aria-invalid','true');
    await user.click(within(radioGroup).getByRole('radio',{name:'当前团队'}));
    expect(radioGroup).toHaveAttribute('aria-invalid','false');
    await user.click(screen.getByRole('button',{name:'检查必填'}));
    const city=screen.getByRole('combobox',{name:'服务城市'});
    expect(city).toHaveAttribute('aria-invalid','true');expect(city).toHaveFocus();
    expect(city).toHaveAccessibleDescription('请选择服务城市');
    await user.click(city);await user.click(screen.getByRole('option',{name:'苏州'}));
    expect(city).toHaveAttribute('aria-invalid','false');
  });
});
