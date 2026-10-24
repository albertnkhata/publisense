#!/bin/bash
# Read-only cutover smoke test: SPA routes, v1 still up (before the switch), anon reads,
# anon writes refused, delete-account refuses without auth. Writes nothing: the only
# write attempts are anon inserts/updates that the API rejects on permissions.
#   scripts/cutover/smoke.sh [v2-origin] [v1-origin]
# Before cutover: smoke.sh https://v2.publisense.app https://publisense.app
# After cutover:  smoke.sh https://publisense.app   (v1 check skipped)
set -uo pipefail
V2=${1:-https://v2.publisense.app}; V1=${2:-}
REF=${SUPABASE_PROJECT_REF:-wyjfgrgxmhumyzwcrywj}
API=https://$REF.supabase.co
KEY=${SUPABASE_PUBLISHABLE_KEY:-sb_publishable_hMOKs9qCsjZqaKp6V9CWZQ_a30skXKi}  # public by design
pass=0; fail=0
ok()  { pass=$((pass+1)); echo "PASS $*"; }
bad() { fail=$((fail+1)); echo "FAIL $*"; }
expect() { [ "$2" = "$3" ] && ok "$1 ($3)" || bad "$1 (expected $2, got $3)"; }

for p in / /explore '/search?q=figma' /b/figma /b/cursor /h/figma /u/albertnkhata /settings /auth/reset \
         '/unsubscribe?token=x' /privacy /terms /admin/reports /admin/disputes /admin/team /notifications; do
  code=$(curl -s -o /tmp/smoke.html -w '%{http_code}' "$V2$p")
  if [ "$code" = 200 ] && grep -q 'id="root"' /tmp/smoke.html; then ok "GET $V2$p (200, SPA shell)"; else bad "GET $V2$p ($code)"; fi
done
if [ -n "$V1" ]; then expect "v1 still serves $V1/" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$V1/")"; fi

H=(-H "apikey: $KEY")
n=$(curl -s "${H[@]}" "$API/rest/v1/board?select=slug" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')
expect "anon reads boards" 14 "$n"
n=$(curl -s "${H[@]}" "$API/rest/v1/hub?select=slug" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')
expect "anon reads hubs" 1 "$n"
expect "anon reads posts" 200 "$(curl -s -o /dev/null -w '%{http_code}' "${H[@]}" "$API/rest/v1/post?select=id&limit=1")"
for t in platform_admin email_token verified_domain membership notification report; do
  expect "anon cannot read $t" 401 "$(curl -s -o /dev/null -w '%{http_code}' "${H[@]}" "$API/rest/v1/$t?select=*&limit=1")"
done
expect "anon insert post refused" 401 "$(curl -s -o /dev/null -w '%{http_code}' "${H[@]}" -H 'Content-Type: application/json' -H 'Prefer: return=minimal' -X POST -d '{"board_id":"00000000-0000-0000-0000-000000000000","type":"bug","title":"smoke must fail"}' "$API/rest/v1/post")"
expect "anon insert board refused" 401 "$(curl -s -o /dev/null -w '%{http_code}' "${H[@]}" -H 'Content-Type: application/json' -H 'Prefer: return=minimal' -X POST -d '{"slug":"zz-smoke","name":"x"}' "$API/rest/v1/board")"
expect "anon update board refused" 401 "$(curl -s -o /dev/null -w '%{http_code}' "${H[@]}" -H 'Content-Type: application/json' -X PATCH -d '{"name":"x"}' "$API/rest/v1/board?slug=eq.zz-no-such-board")"
expect "delete-account without auth" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/functions/v1/delete-account")"
expect "delete-account with anon key only" 401 "$(curl -s -o /dev/null -w '%{http_code}' "${H[@]}" -H "Authorization: Bearer $KEY" -X POST "$API/functions/v1/delete-account")"

echo "$pass passed, $fail failed"; [ "$fail" = 0 ]
