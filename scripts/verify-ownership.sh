#!/usr/bin/env bash
# Proves that one visitor's projects are invisible and untouchable to another.
set -uo pipefail

BASE="${1:-http://localhost:3000}"
JAR_A="$(mktemp)"
JAR_B="$(mktemp)"
trap 'rm -f "$JAR_A" "$JAR_B"' EXIT

fail() { echo "FAIL: $*"; exit 1; }

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
[ -n "$ID" ] && [ "$ID" != "undefined" ] && [ "$ID" != "PARSE_ERROR" ] || fail "A could not create a project (got '$ID')"
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

# Clean up.
CODE="$(status DELETE "$BASE/api/projects/$ID" "$JAR_A")"
[ "$CODE" = "200" ] || fail "A could not delete its own project (got $CODE)"

echo "PASS: projects are isolated per visitor"
