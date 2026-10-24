"""Read-only SQL against production through the Supabase Management API.
Every query runs with read_only=true (as supabase_read_only_user, in a read-only
transaction), so nothing here can write. Auth: SUPABASE_ACCESS_TOKEN if set; otherwise
the request goes out bare (e.g. where a gateway injects the token on the wire)."""
import json, os, urllib.request, sys, time
import urllib.error
REF=os.environ.get('SUPABASE_PROJECT_REF','wyjfgrgxmhumyzwcrywj')
A=f'https://api.supabase.com/v1/projects/{REF}/database/query'
def q(sql, retries=3):
    body=json.dumps({'query':sql,'read_only':True}).encode()
    for i in range(retries):
        req=urllib.request.Request(A,data=body,headers={'Content-Type':'application/json', **({'Authorization': 'Bearer ' + os.environ['SUPABASE_ACCESS_TOKEN']} if os.environ.get('SUPABASE_ACCESS_TOKEN') else {})},method='POST')
        try:
            with urllib.request.urlopen(req,timeout=90) as r: return json.loads(r.read())
        except urllib.error.HTTPError as e:
            msg=e.read().decode()
            if e.code in (429,500,502,503,504) and i<retries-1: time.sleep(3); continue
            raise RuntimeError(f'{e.code}: {msg[:500]}')
if __name__=='__main__':
    print(json.dumps(q(sys.argv[1] if len(sys.argv)>1 else sys.stdin.read()),indent=1,default=str))
