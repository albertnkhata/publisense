"""Push the Supabase Auth email templates to production (Management API).

    python3 scripts/auth-templates/apply.py            # apply supabase/templates/auth/*
    python3 scripts/auth-templates/apply.py --rollback # restore the saved stock copy
    python3 scripts/auth-templates/apply.py --dry-run  # print the keys it would set

Only the subject + HTML of confirmation, magic_link, recovery, email_change and
invite are sent; no other auth setting is touched. The rollback copy of what
production had before (Oct 27, 2026) is supabase/rollback/auth-templates-2026-10-27/original.json.

Auth: SUPABASE_ACCESS_TOKEN if set; otherwise the request goes out bare (for a
gateway that injects the token on the wire). Never prints the token.
"""
import json, os, pathlib, sys, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
REF = os.environ.get('SUPABASE_PROJECT_REF', 'wyjfgrgxmhumyzwcrywj')
URL = f'https://api.supabase.com/v1/projects/{REF}/config/auth'
NAMES = ['confirmation', 'magic_link', 'recovery', 'email_change', 'invite']
TPL = ROOT / 'supabase' / 'templates' / 'auth'
ROLLBACK = ROOT / 'supabase' / 'rollback' / 'auth-templates-2026-10-27' / 'original.json'


def payload(rollback):
    body = {}
    if rollback:
        orig = json.loads(ROLLBACK.read_text(encoding='utf-8'))
        for n in NAMES:
            body[f'mailer_subjects_{n}'] = orig[f'mailer_subjects_{n}']
            body[f'mailer_templates_{n}_content'] = orig[f'mailer_templates_{n}_content']
    else:
        subjects = json.loads((TPL / 'subjects.json').read_text(encoding='utf-8'))
        for n in NAMES:
            body[f'mailer_subjects_{n}'] = subjects[n]
            body[f'mailer_templates_{n}_content'] = (TPL / f'{n}.html').read_text(encoding='utf-8')
    return body


def main():
    rollback = '--rollback' in sys.argv
    body = payload(rollback)
    if '--dry-run' in sys.argv:
        for k, v in body.items():
            print(k, len(v), 'chars')
        return
    headers = {'Content-Type': 'application/json'}
    if os.environ.get('SUPABASE_ACCESS_TOKEN'):
        headers['Authorization'] = 'Bearer ' + os.environ['SUPABASE_ACCESS_TOKEN']
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers=headers, method='PATCH')
    with urllib.request.urlopen(req, timeout=60) as r:
        res = json.loads(r.read())
    bad = [k for k, v in body.items() if res.get(k) != v]
    print('rolled back' if rollback else 'applied', len(body) - len(bad), 'of', len(body), 'keys')
    if bad:
        print('mismatch:', bad)
        sys.exit(1)


if __name__ == '__main__':
    main()
