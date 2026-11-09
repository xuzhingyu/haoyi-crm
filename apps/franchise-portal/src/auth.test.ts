import { afterEach, expect, it, vi } from 'vitest';
const redirect=vi.hoisted(()=>vi.fn().mockResolvedValue(undefined));
vi.mock('oidc-client-ts',()=>({UserManager:class{signinRedirect=redirect;},WebStorageStateStore:class{}}));
afterEach(()=>{vi.unstubAllEnvs();vi.resetModules();window.history.replaceState({},'','/');});
it('preserves a legacy deep link through the first OIDC login',async()=>{
 vi.stubEnv('VITE_OIDC_AUTHORITY','https://login.example');vi.stubEnv('VITE_OIDC_CLIENT_ID','unit-test-client');
 window.history.replaceState({},'','/haoyi/#/leads?id=7');
 const {signIn}=await import('./auth');await signIn();
 expect(redirect).toHaveBeenCalledWith({state:{returnTo:'/haoyi/#/leads?id=7'}});
});
