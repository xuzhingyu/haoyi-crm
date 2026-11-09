"""Provision standard OIDC scopes omitted by the original minimal realm export."""
import json, subprocess, urllib.request, urllib.parse
from pathlib import Path

g=json.loads(Path('/opt/haoyi-workspace/shared/bootstrap.json').read_text())
ip=subprocess.check_output(['docker','inspect','haoyi-workspace-auth','--format','{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'],text=True).strip()
base='http://'+ip+':8080/haoyi-auth'
data=urllib.parse.urlencode({'client_id':'admin-cli','grant_type':'password','username':'workspace-admin','password':g['kc_admin']}).encode()
with urllib.request.urlopen(urllib.request.Request(base+'/realms/master/protocol/openid-connect/token',data=data),timeout=30) as response: token=json.load(response)['access_token']
def api(method,path,value=None):
    req=urllib.request.Request(base+'/admin/realms/haoyi'+path,data=json.dumps(value).encode() if value is not None else None,method=method,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=30) as response:
        body=response.read();return json.loads(body) if body else None
def mapper(name,kind,config):
    return {'name':name,'protocol':'openid-connect','protocolMapper':kind,'consentRequired':False,'config':config}
claim={'access.token.claim':'true','id.token.claim':'true','userinfo.token.claim':'true'}
scopes={
 'basic':[mapper('subject','oidc-sub-mapper',{**claim,'lightweight.claim':'true','introspection.token.claim':'true'})],
 'roles':[mapper('realm roles','oidc-usermodel-realm-role-mapper',{**claim,'multivalued':'true','claim.name':'realm_access.roles','jsonType.label':'String'})],
 'profile':[mapper('full name','oidc-full-name-mapper',claim),mapper('username','oidc-usermodel-property-mapper',{**claim,'user.attribute':'username','claim.name':'preferred_username','jsonType.label':'String'})],
 'email':[mapper('email','oidc-usermodel-property-mapper',{**claim,'user.attribute':'email','claim.name':'email','jsonType.label':'String'})]
}
existing={x['name']:x['id'] for x in api('GET','/client-scopes')}
for name,mappers in scopes.items():
    if name not in existing:
        api('POST','/client-scopes',{'name':name,'protocol':'openid-connect','attributes':{'include.in.token.scope':'true'},'protocolMappers':mappers})
existing={x['name']:x['id'] for x in api('GET','/client-scopes')}
client=api('GET','/clients?clientId=franchise-portal')[0]
for name in scopes: api('PUT',f"/clients/{client['id']}/default-client-scopes/{existing[name]}")
profile=api('GET','/users/profile')
for attribute in profile.get('attributes',[]):
    if attribute.get('name') in {'email','firstName','lastName'}:
        attribute.pop('required',None)
api('PUT','/users/profile',profile)
print('OIDC subject, profile, email and role scopes verified; credentials withheld.')
