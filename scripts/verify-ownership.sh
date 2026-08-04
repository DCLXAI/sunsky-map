#!/usr/bin/env bash
# Proves that one visitor's projects are invisible and untouchable to another.
set -uo pipefail

BASE="${1:-http://localhost:3000}"
JAR_A="$(mktemp)"
JAR_B="$(mktemp)"
ID=""

fail() { echo "FAIL: $*"; exit 1; }

# Best-effort cleanup. Runs on every exit path (pass, fail, or early abort).
# Preserves whatever exit status triggered it, and never lets a cleanup
# failure flip a FAIL into a PASS or vice versa.
cleanup() {
  local code=$?
  if [ -n "$ID" ] && [ "$ID" != "undefined" ] && [ "$ID" != "null" ] && [ "$ID" != "PARSE_ERROR" ]; then
    curl -s -o /dev/null -X DELETE "$BASE/api/projects/$ID" -b "$JAR_A" -c "$JAR_A" >/dev/null 2>&1 || true
  fi
  rm -f "$JAR_A" "$JAR_B"
  exit "$code"
}
trap cleanup EXIT

for bin in node curl; do
  command -v "$bin" >/dev/null 2>&1 || fail "required command '$bin' not found on PATH"
done

json_field() {
  node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(String(JSON.parse(d)$1))}catch{process.stdout.write('PARSE_ERROR')}})"
}

status() { # method url jar [body]
  if [ -n "${4:-}" ]; then
    curl -s -o /dev/null -w '%{http_code}' -X "$1" "$2" -b "$3" -c "$3" \
      -H 'Content-Type: application/json' -d "$4"
  else
    curl -s -o /dev/null -w '%{http_code}' -X "$1" "$2" -b "$3" -c "$3"
  fi
}

echo "Base URL: $BASE"

# Give each jar its owner cookie.
curl -s -o /dev/null -c "$JAR_A" "$BASE/" || fail "A could not reach $BASE"
curl -s -o /dev/null -c "$JAR_B" "$BASE/" || fail "B could not reach $BASE"

# A creates a project.
ID="$(curl -s -X POST "$BASE/api/projects" -b "$JAR_A" -c "$JAR_A" | json_field '.id')"
[ -n "$ID" ] && [ "$ID" != "undefined" ] && [ "$ID" != "null" ] && [ "$ID" != "PARSE_ERROR" ] || fail "A could not create a project (got '$ID')"
echo "A created project $ID"

# A sees it.
A_SEES="$(curl -s "$BASE/api/projects" -b "$JAR_A" -c "$JAR_A" | json_field ".some(p=>p.id==='$ID')")"
[ "$A_SEES" = "true" ] || fail "A cannot see its own project"

# B must not see it in the list.
B_SEES="$(curl -s "$BASE/api/projects" -b "$JAR_B" -c "$JAR_B" | json_field ".some(p=>p.id==='$ID')")"
[ "$B_SEES" = "false" ] || fail "B can see A's project in the list"

# B must not read, write or delete it.
CODE="$(status GET "$BASE/api/projects/$ID" "$JAR_B")"
[ "$CODE" = "404" ] || fail "B GET returned $CODE, expected 404"

BODY='{"title":"hijacked","waypoints":[{"name":"X","lat":0,"lng":0,"transport":"plane","emoji":"X"}]}'
CODE="$(status PUT "$BASE/api/projects/$ID" "$JAR_B" "$BODY")"
[ "$CODE" = "404" ] || fail "B PUT returned $CODE, expected 404"

CODE="$(status DELETE "$BASE/api/projects/$ID" "$JAR_B")"
[ "$CODE" = "404" ] || fail "B DELETE returned $CODE, expected 404"

# A's project survived B's attempts.
CODE="$(status GET "$BASE/api/projects/$ID" "$JAR_A")"
[ "$CODE" = "200" ] || fail "A GET returned $CODE after B's attempts, expected 200"

# A deletes its own project. This is a real assertion about the API (must
# still fail the script if it doesn't return 200) — distinct from the
# best-effort trap cleanup above/below.
CODE="$(status DELETE "$BASE/api/projects/$ID" "$JAR_A")"
[ "$CODE" = "200" ] || fail "A could not delete its own project (got $CODE)"

# Already deleted above; clear ID so the EXIT trap's best-effort cleanup
# doesn't issue a redundant delete against a now-nonexistent project.
ID=""

echo "PASS: projects are isolated per visitor"
