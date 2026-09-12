#!/usr/bin/env bash
# Stop hook. The agent may not finish while test, lint, or typecheck are red.
# Gives up to 3 consecutive blocks per session so a pre-existing red suite cannot trap it forever.
set -u
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 0
source "$(dirname "$0")/role.sh"
HOOK_INPUT="$(cat)"
[ -d node_modules ] || exit 0
sid="$(firefly_json_field session_id)"
counter="${TMPDIR:-/tmp}/firefly-stopgate-${sid:-nosession}"
n=0; [ -f "$counter" ] && n="$(cat "$counter")"

# Only gate when something under src/ or data/ differs from the last commit or is untracked.
if git diff --quiet HEAD -- src data 2>/dev/null && [ -z "$(git ls-files --others --exclude-standard src data)" ]; then
  # Also gate if the last commit is from this session and unverified? Keep simple: clean tree passes.
  rm -f "$counter"; exit 0
fi

fail=""
t="$(npx vitest run 2>&1)"  || fail+="=== npm test FAILED ==="$'\n'"$(printf '%s\n' "$t" | grep -vE '^\s*$' | tail -40)"$'\n'
l="$(npx eslint src 2>&1)"  || fail+="=== npm run lint FAILED ==="$'\n'"$(printf '%s\n' "$l" | tail -30)"$'\n'
c="$(npx tsc --noEmit 2>&1)" || fail+="=== npm run typecheck FAILED ==="$'\n'"$(printf '%s\n' "$c" | tail -30)"$'\n'

if [ -z "$fail" ]; then
  rm -f "$counter"
  exit 0
fi

n=$((n+1)); echo "$n" > "$counter"
if [ "$n" -gt 3 ]; then
  rm -f "$counter"
  printf '{"systemMessage":"Stop gate: checks still red after 3 attempts; allowing stop. Report the failures explicitly."}\n'
  exit 0
fi
node -e '
  const reason = process.argv[1] + "\nYou may not stop while checks are red (attempt " + process.argv[2] + " of 3). Fix these, re-run `npm test && npm run lint && npm run typecheck`, then finish. If a failure is not yours (e.g. the other owner broke main), say so explicitly in your final report.";
  process.stdout.write(JSON.stringify({ decision: "block", reason }));
' "$fail" "$n"
exit 0
