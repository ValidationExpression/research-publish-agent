#!/usr/bin/env bash
# Single-target dispatcher for the team-harness adapters.
# Business projects may copy only this file: missing lib/ clones .harness-upstream then continues.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

usage() {
  cat <<'EOF'
Usage: sync-harness.sh --target <target>

Synchronize team-harness content for exactly one target.

Supported targets: cursor, codex, claude-code, codebuddy, opencode, mimo-code, qoder
EOF
}

bootstrap_die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

# Clone or update the harness source next to the current project, then print its path.
ensure_harness_upstream() {
  local project upstream repo branch
  project="$(pwd -P)" || bootstrap_die 'Cannot resolve the current project directory'
  upstream="$project/.harness-upstream"
  repo="${HARNESS_REPO:-https://github.com/ValidationExpression/team-harness.git}"
  branch="${HARNESS_BRANCH:-main}"
  if [ -d "$upstream/.git" ]; then
    (cd "$upstream" && git fetch origin >/dev/null && git reset --hard "origin/$branch" >/dev/null) || bootstrap_die "Failed to update harness source from $repo"
  elif [ -e "$upstream" ]; then
    bootstrap_die "Harness upstream path exists but is not a Git repository: $upstream"
  else
    git clone -b "$branch" "$repo" "$upstream" >/dev/null || bootstrap_die "Failed to clone harness source from $repo"
  fi
  [ -f "$upstream/lib/common.sh" ] && [ -f "$upstream/sync-harness.sh" ] || bootstrap_die "Harness source is incomplete: $upstream"
  printf '%s\n' "$upstream"
}

# A copied script has no lib/: pull upstream and re-exec the full dispatcher from there.
if [ ! -f "$SCRIPT_DIR/lib/common.sh" ]; then
  if [ "${1:-}" = '--help' ] && [ "$#" -le 1 ]; then
    usage
    exit 0
  fi
  [ "${TEAM_HARNESS_BOOTSTRAP_DONE:-}" = '1' ] && bootstrap_die 'Harness upstream is missing lib/common.sh after bootstrap'
  upstream="$(ensure_harness_upstream)"
  export TEAM_HARNESS_BOOTSTRAP_DONE=1
  exec bash "$upstream/sync-harness.sh" "$@"
fi

# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/languages.sh
source "$SCRIPT_DIR/lib/languages.sh"
# shellcheck source=lib/source.sh
source "$SCRIPT_DIR/lib/source.sh"

readonly SUPPORTED_TARGETS="cursor codex claude-code codebuddy opencode mimo-code qoder"

usage_error() {
  [ -n "${1:-}" ] && printf 'Error: %s\n' "$1" >&2
  usage >&2
  exit 2
}

is_supported_target() {
  case "$1" in
    cursor|codex|claude-code|codebuddy|opencode|mimo-code|qoder) return 0 ;;
    *) return 1 ;;
  esac
}

parse_cli() {
  TARGET=''
  local help_count=0
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --help)
        help_count=$((help_count + 1))
        shift
        ;;
      --target)
        [ -z "$TARGET" ] || usage_error '--target may be provided only once'
        [ "$#" -ge 2 ] || usage_error '--target requires a value'
        case "$2" in
          ''|--*|*,*) usage_error '--target requires one supported target name' ;;
        esac
        TARGET="$2"
        shift 2
        ;;
      --*) usage_error "unknown option: $1" ;;
      *) usage_error "unexpected positional argument: $1" ;;
    esac
  done

  if [ "$help_count" -gt 0 ]; then
    [ "$help_count" -eq 1 ] && [ -z "$TARGET" ] || usage_error '--help cannot be combined with other arguments'
    usage
    exit 0
  fi
  [ -n "$TARGET" ] || usage_error '--target is required'
  is_supported_target "$TARGET" || usage_error "unsupported target: $TARGET"
}

main() {
  parse_cli "$@"

  local project_dir source_dir languages adapter
  project_dir="$(pwd -P)"
  source_dir="$(resolve_harness_source "$project_dir")"

  if [ -n "${LANGS:-}" ]; then
    languages="$(validate_languages "$LANGS")" || die "Invalid LANGS value: ${LANGS}"
  else
    languages="$(detect_languages "$project_dir")"
  fi

  adapter="$source_dir/adapters/$TARGET/sync.sh"
  [ -f "$adapter" ] || die "Adapter for target '$TARGET' is unavailable: $adapter"

  # Adapters receive only canonical, validated inputs.
  # shellcheck source=/dev/null
  source "$adapter"
  declare -F adapter_sync >/dev/null || die "Adapter for target '$TARGET' does not define adapter_sync"
  adapter_sync "$source_dir" "$project_dir" "$languages"
}

main "$@"
