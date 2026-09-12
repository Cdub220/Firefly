#!/usr/bin/env bash
# Resolve which owner this session is acting as.
# Precedence: FIREFLY_ROLE env (dean | chase | both) > git user.name mapping > unknown.
firefly_role() {
  case "${FIREFLY_ROLE:-}" in
    dean|chase|both) echo "$FIREFLY_ROLE"; return ;;
  esac
  local name
  name="$(git config user.name 2>/dev/null | tr '[:upper:]' '[:lower:]')"
  case "$name" in
    deanyao6|dean*) echo dean ;;
    cdub*|chase*)   echo chase ;;
    *)              echo unknown ;;
  esac
}

# Print the owner of a repo-relative path: dean | chase | contract | shared
firefly_owner_of() {
  local p="$1"
  case "$p" in
    src/shared/types.ts|src/loop.ts)                 echo contract ;;
    src/brain/*|src/corruption/*|src/eval/*)         echo dean ;;
    src/world/*|src/ui/*|data/structures/*|src/main.tsx|src/index.css|index.html) echo chase ;;
    *)                                               echo shared ;;
  esac
}

# Files frozen after docs/06-freeze.md exists.
firefly_is_frozen() {
  local p="$1"
  [ -f "docs/06-freeze.md" ] || return 1
  case "$p" in
    src/brain/index.ts|src/brain/consistency.ts|src/brain/hypotheses.ts|src/brain/physics.ts|src/corruption/*) return 0 ;;
    *) return 1 ;;
  esac
}

# Read a JSON field from stdin payload saved in $HOOK_INPUT. Uses node (always present).
firefly_json_field() {
  node -e '
    let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
      try { const j=JSON.parse(s); const v=process.argv[1].split(".").reduce((o,k)=>o?.[k], j);
        process.stdout.write(v===undefined||v===null?"":String(v)); } catch { process.stdout.write(""); }
    });' "$1" <<<"$HOOK_INPUT"
}

firefly_relpath() {
  local abs="$1" root
  root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  case "$abs" in
    "$root"/*) echo "${abs#"$root"/}" ;;
    *) echo "$abs" ;;
  esac
}
