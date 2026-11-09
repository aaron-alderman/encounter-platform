#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo 'usage: release-workflows.sh RELEASE_ARCHIVE FAULT_TEST_BINARY' >&2
  exit 1
fi

archive=$(realpath -- "$1")
ENCOUNTER_RUST_FAULT_HOST=$(realpath -- "$2")
[[ -x $ENCOUNTER_RUST_FAULT_HOST ]]
export ENCOUNTER_RUST_FAULT_HOST
applications=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
scratch=$(mktemp -d /tmp/encounter-install.XXXXXX)
trap 'rm -r -- "$scratch"' EXIT
export ENCOUNTER_RUST_RELEASE="$scratch/release"
export ENCOUNTER_RUST_HOST="$ENCOUNTER_RUST_RELEASE/bin/encounter"
export ENCOUNTER_RUST_IMAGE=1
export TMPDIR="$scratch/stores"
export ENCOUNTER_TEST_OUTPUT="$TMPDIR"

(cd -- "$(dirname -- "$archive")" && sha256sum -c -- "$(basename -- "$archive").sha256")
mkdir -- "$ENCOUNTER_RUST_RELEASE" "$TMPDIR"
tar -xzf "$archive" --strip-components=1 -C "$ENCOUNTER_RUST_RELEASE"
"${ENCOUNTER_RUST_HOST}" --version

status=0
run() {
  local app=$1
  shift
  printf '\n== %s · %s ==\n' "$app" "$*"
  (cd -- "$applications/$app" && "$@") || status=1
}
run encounter-portfolio node test/run.cjs
run encounter-claimipedia node test/run.cjs
run encounter-work-boards node --test test/work-boards.test.cjs
run encounter node test/ui-only.cjs
run encounter node test/second-domain.cjs
printf '\n== Fault-injection companion check with the separate test executable ==\n'
run encounter node test/reconciliation.cjs
exit "$status"
