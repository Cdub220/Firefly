#!/usr/bin/env bash
# PostToolUse on Edit|Write. After a .ts/.tsx edit under src/, run eslint on that file and
# tsc on the project. Exit 2 with the errors so the agent fixes them immediately.
set -u
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 0
source "$(dirname "$0")/role.sh"
HOOK_INPUT="$(cat)"
file="$(firefly_json_field tool_input.file_path)"
[ -z "$file" ] && exit 0
rel="$(firefly_relpath "$file")"
case "$rel" in
  src/*.ts|src/*.tsx) ;;
  *) exit 0 ;;
esac
[ -f "$rel" ] || exit 0
[ -d node_modules ] || exit 0

out=""
if ! lint="$(npx eslint "$rel" 2>&1)"; then
  out+="ESLINT ($rel):"$'\n'"$lint"$'\n'
fi
if ! tc="$(npx tsc --noEmit 2>&1)"; then
  out+="TSC:"$'\n'"$(printf '%s\n' "$tc" | head -40)"$'\n'
fi
if [ -n "$out" ]; then
  printf '%s' "$out" >&2
  exit 2
fi
exit 0
