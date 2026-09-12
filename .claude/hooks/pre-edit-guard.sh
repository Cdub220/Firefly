#!/usr/bin/env bash
# PreToolUse on Edit|Write. Enforces directory ownership, the contract-change rule, and the freeze.
#   - frozen file after the freeze         -> deny
#   - other owner's directory               -> deny (override: FIREFLY_ROLE=both)
#   - contract file (types.ts, loop.ts)     -> ask the human
#   - everything else                       -> allow
set -u
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 0
source "$(dirname "$0")/role.sh"
HOOK_INPUT="$(cat)"
file="$(firefly_json_field tool_input.file_path)"
[ -z "$file" ] && exit 0
rel="$(firefly_relpath "$file")"
role="$(firefly_role)"
owner="$(firefly_owner_of "$rel")"

cap() { printf '%s' "$1" | awk '{print toupper(substr($0,1,1)) substr($0,2)}'; }
deny() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":%s}}\n' "$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1")"
  exit 0
}
ask() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":%s}}\n' "$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1")"
  exit 0
}

if firefly_is_frozen "$rel"; then
  deny "FROZEN: $rel is estimator/corruption logic and the method freeze is in effect (docs/06-freeze.md exists). Put new brain code in src/brain/commands.ts or a new file. If this is a bug fix a human must approve: they can delete docs/06-freeze.md temporarily and record the second hash."
fi

case "$owner" in
  contract)
    # Allowed without a prompt (hands-off sessions), but flagged so the human sees it and the agent reports it.
    printf '{"systemMessage":%s,"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"contract file; must be reported to the other owner"}}\n' \
      "$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "CONTRACT FILE EDITED: $rel is shared with the other owner. The agent must list this change in its final report. Additive is fine; breaking changes need the other owner's yes.")"
    exit 0
    ;;
  dean|chase)
    if [ "$role" = "both" ] || [ "$role" = "unknown" ] || [ "$role" = "$owner" ]; then
      exit 0
    fi
    deny "OWNERSHIP: $rel belongs to $(cap "$owner")'s directory and this session is running as $(cap "$role") (from git user.name; override with FIREFLY_ROLE=both). Ask for what you need in terms of the contract, or stub it behind the interface with a TODO($(cap "$owner")). See docs/04-who-does-what.md."
    ;;
esac
exit 0
