// The Agent can invoke only this fixed, authenticated work endpoint.
const base=process.env.LEAD_CORE_WORKSPACE_API_URL||'http://lead-core:8000';
try {
  const res=await fetch(`${base}/api/v1/internal/research/run-next`,{method:'POST',headers:{Authorization:`Bearer ${process.env.LEAD_CORE_WORKER_TOKEN}`},signal:AbortSignal.timeout(20*60*1000)});
  if(!res.ok) throw new Error(`Workspace HTTP ${res.status}`);
  const result=await res.json();
  // A busy worker must remain a failed attempt so Autoloop can retry it.
  if(result.outcome==='failed') throw new Error(result.error||'研究任务暂不可执行');
  if(!['done','nothing','cancelled'].includes(result.outcome)) throw new Error('研究服务返回未知状态');
  console.log(result.summary||'研究任务处理完成');
  console.log('```agent-autoloop\n'+JSON.stringify({notice:[]})+'\n```');
} catch(error) {
  console.error(error instanceof Error?error.message:'任务执行失败');process.exitCode=1;
}
