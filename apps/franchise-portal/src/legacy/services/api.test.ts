import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request, downloadReport, withApiPrefix } from './api';

vi.mock('../../auth',()=>({accessToken:vi.fn().mockResolvedValue('unit-test-oidc-token'),developmentHeaders:()=>undefined}));
beforeEach(()=>vi.restoreAllMocks());

describe('merged business API',()=>{
  it('uses the shared OIDC credential and merged prefix for an existing lifecycle operation',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({id:12,status:'已签约'}),{status:200,headers:{'Content-Type':'application/json'}}));
    vi.stubGlobal('fetch',fetcher);
    await request('/api/opportunities/12/sign',{method:'POST'});
    expect(fetcher).toHaveBeenCalledWith('/api/v1/crm/opportunities/12/sign',expect.objectContaining({method:'POST'}));
    expect((fetcher.mock.calls[0][1].headers as Headers).get('Authorization')).toBe('Bearer unit-test-oidc-token');
    expect(sessionStorage.getItem('workbench_token')).toBeNull();
  });
  it('reports an unauthorized business request without redirecting',async()=>{
    const expired=vi.fn(); window.addEventListener('haoyi:session-expired',expired);
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({detail:'expired'}),{status:401})));
    await expect(request('/api/leads')).rejects.toThrow('expired'); expect(expired).toHaveBeenCalledTimes(1);
    window.removeEventListener('haoyi:session-expired',expired);
  });
  it('does not send credentials to an external report address',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    await expect(downloadReport('https://example.org/report.pdf')).rejects.toThrow('报告下载地址无效');expect(fetcher).not.toHaveBeenCalled();
    expect(withApiPrefix('/api/reports/9.pdf')).toBe('/api/v1/crm/reports/9.pdf');
  });
});
