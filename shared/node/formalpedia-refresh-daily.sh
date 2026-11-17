#!/usr/bin/env bash
set -euo pipefail

workspace=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../../.." && pwd)
cd "$workspace"
export TZ=Australia/Perth
log_dir="$workspace/logs/formalpedia-refresh"
mkdir -p "$log_dir"
log_file="$log_dir/$(date +%Y%m%dT%H%M%S%z)-$$.log"
exec >>"$log_file" 2>&1
trap 'status=$?; printf "finished %s exit=%s\n" "$(date --iso-8601=seconds)" "$status"' EXIT
printf 'started %s\n' "$(date --iso-8601=seconds)"
source environment.sh
node projects/encounter-platform/shared/node/formalpedia-refresh.cjs
