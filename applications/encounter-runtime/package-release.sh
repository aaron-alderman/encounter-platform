#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C

if [[ $# -ne 3 || ! $1 =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo 'usage: package-release.sh VERSION BINARY OUTPUT_DIRECTORY' >&2
  exit 1
fi
version=$1
binary=$(realpath -- "$2")
runtime=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
applications=$(dirname -- "$runtime")
platform=linux-x86_64
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]]
if reported=$("$binary" --version 2>/dev/null); then
  [[ $reported == "encounter $version" ]] || { echo 'binary version differs from release version' >&2; exit 1; }
elif [[ $version != 0.1.0 || $(sha256sum "$binary" | cut -d' ' -f1) != b579cfd6af3ad721efebda41a63f48308d747879ce1bbee4585d7bd588240be6 ]]; then
  echo 'release binary must report its version or match the preserved 0.1.0 baseline' >&2
  exit 1
fi

install -d -m 700 -- "$3"
output=$(realpath -- "$3")
name="encounter-$version-$platform"
archive="$name.tar.gz"
if [[ -e "$output/$archive" || -e "$output/$archive.sha256" ]]; then
  echo 'release output already exists' >&2
  exit 1
fi
work=$(mktemp -d -- "$output/.package.XXXXXX")
trap 'rm -r -- "$work"' EXIT
package="$work/$name"
install -d -m 755 -- "$package" "$package/bin" "$package/images"
install -m 755 -- "$binary" "$package/bin/encounter"
if [[ $version != 0.1.0 && $version != 0.1.1 && $version != 0.1.2 ]]; then
  install -d -m 755 -- "$package/spec"
  for spec in platform application-ports; do
    path="spec/$spec.rel"
    install -m 644 -- "$runtime/$path" "$package/$path"
  done
fi
runtime_pin=$(sha256sum "$package/bin/encounter" | cut -d' ' -f1)
printf '("release", "format", "encounter/release/1")\n("release", "version", "%s")\n("release", "platform", "%s")\n("release", "runtime", "bin/encounter")\n("bin/encounter", "sha256", "%s")\n' \
  "$version" "$platform" "$runtime_pin" > "$package/release.rel"

row_pattern='^\("([a-z0-9-]+)", "([a-z0-9-]+)", "([a-z0-9/.-]+)"\)$'
while IFS= read -r row; do
  if [[ ! $row =~ $row_pattern ]]; then
    echo "invalid application catalog row: $row" >&2
    exit 1
  fi
  app=${BASH_REMATCH[1]}
  source_root="$applications/${BASH_REMATCH[2]}"
  declaration=${BASH_REMATCH[3]}
  image="images/$app.rel"
  pin=$("$package/bin/encounter" build "$source_root" "$declaration" "$package/$image")
  [[ $pin =~ ^[a-f0-9]{64}$ ]]
  printf '("%s", "image", "%s")\n("%s", "sha256", "%s")\n' "$app" "$image" "$app" "$pin" >> "$package/release.rel"
done < "$runtime/release-applications-platform.rel"
if [[ -d "$package/spec" ]]; then
  for path in spec/platform.rel spec/application-ports.rel; do
    pin=$(sha256sum "$package/$path" | cut -d' ' -f1)
    printf '("%s", "sha256", "%s")\n' "$path" "$pin" >> "$package/release.rel"
  done
fi

cat > "$package/README.md" <<'EOF_README'
# Encounter Linux release

This archive contains the Rust executable and compiled application images.
The image names and their SHA-256 pins are listed in release.rel. Image
serving requires a compatible x86-64 Linux host with the system C runtime
and libsqlite3.so.0.

Verify the archive with the separately supplied SHA-256 before extraction.
From the extracted directory, choose an application and an external store:

```bash
app=workgarden
pin=$(awk -F'"' -v app="$app" '$2 == app && $4 == "sha256" { print $6 }' release.rel)
bin/encounter serve --image "images/$app.rel" "$pin" /path/to/workgarden-store 24211
```

Use a separate store and port for each application. Keep stores outside
the release directory. For upgrades, stop the old
server and back up the store. Start the new executable with its matching
compiled image and the copied store. Keep the old release and backup
available while verifying the upgrade.
EOF_README

chmod 644 -- "$package/README.md" "$package/release.rel"
tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner -C "$work" -cf - "$name" |
  gzip -n > "$work/$archive"
digest=$(sha256sum "$work/$archive" | cut -d' ' -f1)
printf '%s  %s\n' "$digest" "$archive" > "$work/$archive.sha256"
chmod 600 -- "$work/$archive" "$work/$archive.sha256"
ln -- "$work/$archive" "$output/$archive"
ln -- "$work/$archive.sha256" "$output/$archive.sha256"
printf '%s\n' "$output/$archive"
