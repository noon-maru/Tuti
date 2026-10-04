#!/bin/sh

set -eu

aab_file="${1:-android/app/build/outputs/bundle/release/app-release.aab}"
mapping_file="${2:-android/app/build/outputs/mapping/release/mapping.txt}"
metadata_entry="BUNDLE-METADATA/com.android.tools/r8.json"

if [ ! -s "$aab_file" ]; then
  echo "Release AAB가 없거나 비어 있습니다: $aab_file" >&2
  exit 1
fi

"$(dirname "$0")/verify-android-r8-mapping.sh" "$mapping_file" >/dev/null

if command -v unzip >/dev/null 2>&1; then
  r8_metadata="$(unzip -p "$aab_file" "$metadata_entry")"
elif command -v 7z >/dev/null 2>&1; then
  r8_metadata="$(7z x -so "$aab_file" "$metadata_entry" 2>/dev/null)"
else
  echo "AAB의 R8 메타데이터를 읽을 unzip 또는 7z가 없습니다." >&2
  exit 1
fi

if [ -z "$r8_metadata" ]; then
  echo "AAB에 R8 메타데이터가 없습니다: $metadata_entry" >&2
  exit 1
fi

compact_metadata="$(printf '%s' "$r8_metadata" | tr -d '[:space:]')"

for option_name in \
  isObfuscationEnabled \
  isOptimizationsEnabled \
  isShrinkingEnabled
do
  if ! printf '%s' "$compact_metadata" | grep -Fq "\"$option_name\":true"; then
    echo "R8 옵션이 활성화되지 않았습니다: $option_name" >&2
    exit 1
  fi
done

extract_percentage() {
  key="$1"
  printf '%s' "$compact_metadata" |
    sed -n "s/.*\"$key\":\([0-9][0-9.]*\).*/\1/p"
}

no_obfuscation="$(extract_percentage noObfuscationPercentage)"
no_optimization="$(extract_percentage noOptimizationPercentage)"
no_shrinking="$(extract_percentage noShrinkingPercentage)"

for metric in "$no_obfuscation" "$no_optimization" "$no_shrinking"
do
  if ! awk -v value="$metric" 'BEGIN { exit !(value ~ /^[0-9]+([.][0-9]+)?$/ && value >= 0 && value <= 75) }'; then
    echo "Play 기준점 25%를 보장할 수 없는 R8 비적용 비율입니다: ${metric:-읽기 실패}" >&2
    exit 1
  fi
done

obfuscation="$(awk -v value="$no_obfuscation" 'BEGIN { printf "%.2f", 100 - value }')"
optimization="$(awk -v value="$no_optimization" 'BEGIN { printf "%.2f", 100 - value }')"
shrinking="$(awk -v value="$no_shrinking" 'BEGIN { printf "%.2f", 100 - value }')"

echo "R8 검증 완료: 난독화 ${obfuscation}%, DEX 최적화 ${optimization}%, 축소 ${shrinking}%"
