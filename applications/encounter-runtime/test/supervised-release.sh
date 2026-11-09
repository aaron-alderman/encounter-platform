#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo 'usage: supervised-release.sh RELEASE_ARCHIVE' >&2
  exit 1
fi
archive=$(realpath -- "$1")
scratch=$(mktemp -d /tmp/encounter-supervised.XXXXXX)
unit="encounter-release-test-${scratch##*.}.service"
cleanup() {
  systemctl --user stop "$unit" >/dev/null 2>&1 || true
  rm -r -- "$scratch"
}
trap cleanup EXIT

(cd -- "$(dirname -- "$archive")" && sha256sum -c -- "$(basename -- "$archive").sha256")
mkdir -- "$scratch/release"
tar -xzf "$archive" --strip-components=1 -C "$scratch/release"
pin=$(awk -F'"' '$2=="workgarden" && $4=="sha256"{print $6}' "$scratch/release/release.rel")
[[ $pin =~ ^[0-9a-f]{64}$ ]]
cat > "$scratch/launch.rel" <<EOF_CONFIG
("launch", "version", "encounter/launch/1")
("launch", "mode", "image")
("launch", "image", "release/images/workgarden.rel")
("launch", "sha256", "$pin")
("launch", "store", "store")
("launch", "port", "0")
EOF_CONFIG

start() {
  rm -f -- "$scratch/stdout" "$scratch/stderr"
  systemd-run --user --quiet --unit="$unit"     --property=Type=exec --property=TimeoutStopSec=8     --property="WorkingDirectory=$scratch"     --property="StandardOutput=file:$scratch/stdout"     --property="StandardError=file:$scratch/stderr"     --property="ExecStopPost=/bin/sh -c 'echo \$\$EXIT_CODE:\$\$EXIT_STATUS >> $scratch/stops'"     "$scratch/release/bin/encounter" --config launch.rel serve
  for ((attempt=0; attempt<100; attempt++)); do
    origin=$(sed -n 's/^Encounter \(http:\/\/127\.0\.0\.1:[0-9]\+\)$/\1/p' "$scratch/stdout" 2>/dev/null || true)
    if [[ -n $origin ]]; then return; fi
    sleep 0.05
  done
  cat "$scratch/stderr" >&2
  return 1
}

start
curl --fail --silent --show-error "$origin/" | grep -F 'Workgarden' >/dev/null
node - "$origin" <<'EOF_BROWSER'
const assert = require('node:assert/strict');
const { chromium } = require(process.env.ENCOUNTER_PLAYWRIGHT);
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    assert.equal((await page.goto(process.argv[2])).status(), 200);
    await page.getByLabel('New work item', { exact: true }).fill('Survived supervisor stop');
    const [saved] = await Promise.all([
      page.waitForNavigation(), page.getByRole('button', { name: 'Add work item', exact: true }).click()
    ]);
    assert.equal(saved.status(), 200);
    assert.equal(await page.getByRole('status').innerText(), 'Work item added.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
EOF_BROWSER
systemctl --user stop "$unit"
[[ $(cat "$scratch/stops") == exited:0 ]]
start
curl --fail --silent --show-error "$origin/" | grep -F 'Survived supervisor stop' >/dev/null
systemctl --user stop "$unit"
[[ $(cat "$scratch/stops") == $'exited:0\nexited:0' ]]
echo 'ok - systemd started and stopped the packaged server twice; both SIGTERM stops exited 0 and the browser save survived'
