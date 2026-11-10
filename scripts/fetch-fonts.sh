#!/usr/bin/env bash
# Download the fonts used by render-tanka.mjs into the given directory.
# Noto Serif JP / Noto Sans JP are licensed under the SIL Open Font License 1.1.
# The fonts are fetched at build time and are not committed to this repository;
# the license text is downloaded next to them.
set -euo pipefail

dir="${1:-.fonts}"
mkdir -p "$dir"

base="https://raw.githubusercontent.com/notofonts/noto-cjk"

fetch() {
  local url="$1" name="$2" sha="$3"
  curl -fsSL --retry 3 -o "$dir/$name" "$url"
  echo "$sha  $dir/$name" | sha256sum -c -
}

fetch "$base/Serif2.003/Serif/SubsetOTF/JP/NotoSerifJP-Medium.otf" NotoSerifJP-Medium.otf \
  f3a906cadd27f812a8b4b18618fa750928e65339fb372bd3f825f24e3271180b
fetch "$base/Sans2.004/Sans/SubsetOTF/JP/NotoSansJP-Regular.otf" NotoSansJP-Regular.otf \
  dff723ba59d57d136764a04b9b2d03205544f7cd785a711442d6d2d085ac5073
fetch "$base/Sans2.004/LICENSE" OFL.txt \
  6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2
