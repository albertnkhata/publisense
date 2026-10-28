#!/usr/bin/env bash
set -euo pipefail

# Run against the disposable CI database after all migrations are applied.
# Each worker uses one independent psql session and one transaction per RPC call.
PSQL=(psql -X -q -v ON_ERROR_STOP=1)
WORKERS=32
GATE_NAMESPACE="publisense:analytics:concurrency-test"
RUN_ID=$("${PSQL[@]}" -Atc 'select pg_catalog.gen_random_uuid()')
BASE="/__analytics_rate_limit_test__/${RUN_ID}"

cleanup() {
  "${PSQL[@]}" -c "delete from private.analytics_event where left(path, length('${BASE}/')) = '${BASE}/'" >/dev/null 2>&1 || true
}
trap cleanup EXIT

assert_count() {
  local label=$1 expected=$2 query=$3 actual
  actual=$("${PSQL[@]}" -Atc "$query")
  if [[ "$actual" != "$expected" ]]; then
    echo "FAIL: ${label}: expected ${expected}, got ${actual}" >&2
    exit 1
  fi
  echo "ok: ${label} (${actual})"
}

clear_run_rows() {
  "${PSQL[@]}" -c "delete from private.analytics_event where left(path, length('${BASE}/')) = '${BASE}/'" >/dev/null
}

run_concurrent_calls() {
  local label=$1 call_path=$2 visit_expr=$3
  local key1="pg_catalog.hashtext('${GATE_NAMESPACE}')"
  local key2="pg_catalog.hashtext('${label}')"
  local holder_pid
  local -a worker_pids=()
  local failed=0

  # Hold a separate session-level advisory lock while all worker connections
  # start. Releasing it gives the independent RPC statements a near-simultaneous
  # start at the chosen rate-limit boundary.
  "${PSQL[@]}" \
    -c "select pg_catalog.pg_advisory_lock(${key1}, ${key2})" \
    -c 'select pg_catalog.pg_sleep(2)' \
    -c "select pg_catalog.pg_advisory_unlock(${key1}, ${key2})" \
    >/dev/null &
  holder_pid=$!
  sleep 0.2

  for ((i = 1; i <= WORKERS; i++)); do
    "${PSQL[@]}" \
      -c "select pg_catalog.pg_advisory_lock(${key1}, ${key2})" \
      -c "select pg_catalog.pg_advisory_unlock(${key1}, ${key2})" \
      -c 'set role anon' \
      -c "select public.record_event(${visit_expr}, 'page_view', '${call_path}', null::uuid, null::uuid, null::text, '{}'::jsonb)" \
      >/dev/null &
    worker_pids+=("$!")
  done

  wait "$holder_pid"
  for pid in "${worker_pids[@]}"; do
    if ! wait "$pid"; then
      failed=1
    fi
  done
  if (( failed )); then
    echo "FAIL: one or more PostgreSQL workers failed in ${label}" >&2
    return 1
  fi
}

# The migrations test database should be empty: the existing SQL analytics test
# runs in a transaction and rolls back. Fail instead of masking other recent rows.
initial=$("${PSQL[@]}" -Atc "select count(*) from private.analytics_event where at > pg_catalog.clock_timestamp() - interval '1 minute'")
if [[ "$initial" != 0 ]]; then
  echo "FAIL: expected no recent analytics rows before concurrency test; found ${initial}" >&2
  exit 1
fi

# Per-visit 60/minute: 55 committed events leave exactly five slots.
VISIT_1M=$("${PSQL[@]}" -Atc 'select pg_catalog.gen_random_uuid()')
"${PSQL[@]}" -c "insert into private.analytics_event (visit_id, kind, path, at) select '${VISIT_1M}'::uuid, 'page_view', '${BASE}/minute-seed', pg_catalog.clock_timestamp() - interval '10 seconds' from generate_series(1, 55)" >/dev/null
run_concurrent_calls per_visit_minute "${BASE}/minute-call" "'${VISIT_1M}'::uuid"
assert_count 'per-visit 60/minute cap' 5 "select count(*) from private.analytics_event where visit_id = '${VISIT_1M}'::uuid and path = '${BASE}/minute-call' and at > pg_catalog.clock_timestamp() - interval '1 minute'"
assert_count 'per-visit minute window total' 60 "select count(*) from private.analytics_event where visit_id = '${VISIT_1M}'::uuid and at > pg_catalog.clock_timestamp() - interval '1 minute'"
clear_run_rows

# Per-visit 120/5 minutes: 110 events three minutes old leave ten slots while
# staying outside the one-minute window.
VISIT_5M=$("${PSQL[@]}" -Atc 'select pg_catalog.gen_random_uuid()')
"${PSQL[@]}" -c "insert into private.analytics_event (visit_id, kind, path, at) select '${VISIT_5M}'::uuid, 'page_view', '${BASE}/five-minute-seed', pg_catalog.clock_timestamp() - interval '3 minutes' from generate_series(1, 110)" >/dev/null
run_concurrent_calls per_visit_five_minutes "${BASE}/five-minute-call" "'${VISIT_5M}'::uuid"
assert_count 'per-visit 120/5-minute cap' 10 "select count(*) from private.analytics_event where visit_id = '${VISIT_5M}'::uuid and path = '${BASE}/five-minute-call' and at > pg_catalog.clock_timestamp() - interval '5 minutes'"
assert_count 'per-visit five-minute window total' 120 "select count(*) from private.analytics_event where visit_id = '${VISIT_5M}'::uuid and at > pg_catalog.clock_timestamp() - interval '5 minutes'"
clear_run_rows

# Global 600/minute: 590 events with unique visit tokens leave ten slots. Unique
# tokens ensure the per-visit limits do not constrain these concurrent requests.
"${PSQL[@]}" -c "insert into private.analytics_event (visit_id, kind, path, at) select pg_catalog.gen_random_uuid(), 'page_view', '${BASE}/global-seed', pg_catalog.clock_timestamp() - interval '10 seconds' from generate_series(1, 590)" >/dev/null
run_concurrent_calls global_minute "${BASE}/global-call" 'pg_catalog.gen_random_uuid()'
assert_count 'global 600/minute cap' 10 "select count(*) from private.analytics_event where path = '${BASE}/global-call' and at > pg_catalog.clock_timestamp() - interval '1 minute'"
assert_count 'global minute window total' 600 "select count(*) from private.analytics_event where at > pg_catalog.clock_timestamp() - interval '1 minute'"

echo 'Analytics rate-limit concurrency tests passed.'
