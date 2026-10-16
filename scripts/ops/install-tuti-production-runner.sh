#!/bin/sh

set -eu

PATH="/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin:$PATH"
export PATH

service="actions.runner.noon-maru-Tuti.Tuti-production.service"
unit_file="/etc/systemd/system/$service"
runner_dir="/volume1/homes/Tutiadmin/actions-runner/tuti-production/actions-runner"
dropin_dir="/etc/systemd/system/$service.d"
dropin_file="$dropin_dir/20-tuti-recovery.conf"
source_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
source_config="$source_dir/systemd/tuti-production-runner-recovery.conf"

check() {
  if ! cmp -s "$source_config" "$dropin_file"; then
    echo "러너 자동 복구 설정이 아직 설치되지 않았거나 저장소 설정과 다릅니다." >&2
    return 1
  fi
  systemctl is-enabled "$service"
  systemctl is-active "$service"
  systemctl show "$service" \
    -p Restart -p RestartUSec -p StartLimitInterval \
    -p RequiresMountsFor -p After -p Environment
}

if [ "$#" -eq 1 ] && [ "$1" = "--check" ]; then
  check
  exit 0
fi
if [ "$#" -ne 0 ]; then
  echo "사용법: sudo sh scripts/ops/install-tuti-production-runner.sh 또는 sh scripts/ops/install-tuti-production-runner.sh --check" >&2
  exit 1
fi
if [ "$(id -u)" -ne 0 ]; then
  echo "서비스 설정을 적용하려면 sudo로 실행해주세요." >&2
  exit 1
fi
if [ ! -f "$unit_file" ] || [ ! -x "$runner_dir/runsvc.sh" ]; then
  echo "등록된 Tuti 운영 러너 서비스와 실행 파일을 먼저 확인해주세요." >&2
  exit 1
fi
if [ "$(systemctl show "$service" -p User)" != "User=Tutiadmin" ] || \
  [ "$(systemctl show "$service" -p WorkingDirectory)" != "WorkingDirectory=$runner_dir" ]; then
  echo "기존 러너의 실행 사용자나 작업 경로가 예상 설정과 다릅니다. 자동 변경을 중단합니다." >&2
  exit 1
fi

# 작업 중인 러너를 재시작하거나 수동 러너와 중복 실행하지 않는다.
runner_processes="$(ps -eo user=,args=)"
has_runner_process() {
  printf '%s\n' "$runner_processes" | awk -v process="$1" '
    $1 == "Tutiadmin" && $2 ~ ("/" process "$") { found = 1 }
    END { exit !found }
  '
}
if has_runner_process 'Runner[.]Worker'; then
  echo "배포 러너가 작업 중입니다. 작업 종료 후 설치를 다시 실행해주세요." >&2
  exit 1
fi
if ! systemctl is-active --quiet "$service" && \
  has_runner_process 'Runner[.]Listener'; then
  echo "수동으로 실행한 러너가 있습니다. 해당 러너를 종료한 뒤 설치해주세요." >&2
  exit 1
fi

install -d -o root -g root -m 0755 "$dropin_dir"
if [ -f "$dropin_file" ] && ! cmp -s "$source_config" "$dropin_file"; then
  backup_file="$dropin_file.backup.$(date +%Y%m%d-%H%M%S)"
  install -o root -g root -m 0644 "$dropin_file" "$backup_file"
  echo "이전 자동 복구 설정 보관: $backup_file"
fi
install -o root -g root -m 0644 "$source_config" "$dropin_file"

systemctl daemon-reload
systemctl enable "$service"
systemctl reset-failed "$service"
systemctl restart "$service"

sleep 5
check
echo "Tuti 운영 러너의 부팅 자동 시작·볼륨 대기·15초 재시도 설정을 적용했습니다."
echo "GitHub Settings > Actions > Runners에서도 Tuti-production의 Idle 상태를 확인해주세요."
