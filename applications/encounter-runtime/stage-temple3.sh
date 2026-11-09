#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo 'usage: stage-temple3.sh TEMPLE3_SOURCE' >&2
  exit 1
fi
source_root=$(realpath -- "$1")
runtime=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
manifest="$runtime/temple3.sha256"
research="$runtime/../../research"
mkdir -p -- "$research"
destination="$research/temple3"
if [[ -e "$destination" || -L "$destination" ]]; then
  echo 'Temple3 destination already exists. Stage the pinned input in a fresh checkout.' >&2
  exit 1
fi

stage=$(mktemp -d -- "$research/.temple3.XXXXXX")
trap 'if [[ -d "$stage" ]]; then rm -r -- "$stage"; fi' EXIT
while read -r digest relative; do
  [[ $digest == \#* ]] && continue
  [[ $digest =~ ^[0-9a-f]{64}$ && $relative =~ ^[a-zA-Z0-9_./-]+$ && /$relative/ != */../* && $relative != /* ]]
  (cd -- "$source_root" && cp --parents --dereference -- "$relative" "$stage")
done < "$manifest"
(cd -- "$stage" && sha256sum --check --strict --quiet "$manifest")
mv --no-clobber --no-target-directory -- "$stage" "$destination"
[[ ! -e "$stage" ]]
printf 'Staged verified Temple3 input at %s\n' "$destination"
