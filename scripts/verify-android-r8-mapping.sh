#!/bin/sh

set -eu

mapping_file="${1:-android/app/build/outputs/mapping/release/mapping.txt}"

if [ ! -s "$mapping_file" ]; then
  echo "R8 mapping.txt가 없거나 비어 있습니다: $mapping_file" >&2
  exit 1
fi

# 위치 권한 회귀를 막기 위해 이름과 구현을 그대로 보존해야 하는 네이티브 경계다.
for class_name in \
  com.getcapacitor.Bridge \
  com.getcapacitor.BridgeActivity \
  com.getcapacitor.Plugin \
  com.getcapacitor.PluginCall \
  com.capacitorjs.plugins.geolocation.GeolocationPlugin \
  io.ionic.libs.iongeolocationlib.controller.IONGLOCController
do
  if ! grep -Fq "$class_name -> $class_name:" "$mapping_file"; then
    echo "R8 보존 규칙이 적용되지 않았습니다: $class_name" >&2
    exit 1
  fi
done

renamed_class_count="$(
  awk -F ' -> ' '
    /^[^[:space:]#]/ && NF == 2 {
      original = $1
      renamed = $2
      sub(/:$/, "", renamed)
      if (original != renamed) count += 1
    }
    END { print count + 0 }
  ' "$mapping_file"
)"

case "$renamed_class_count" in
  '' | *[!0-9]*)
    echo "R8 이름 변경 클래스 수를 계산하지 못했습니다." >&2
    exit 1
    ;;
esac

if [ "$renamed_class_count" -lt 100 ]; then
  echo "R8 난독화 결과가 예상보다 적습니다: ${renamed_class_count}개 클래스" >&2
  exit 1
fi

echo "R8 검증 완료: 위치 브리지 보존, ${renamed_class_count}개 클래스 이름 변경"
