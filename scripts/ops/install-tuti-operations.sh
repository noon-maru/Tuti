#!/bin/sh

set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "sudo로 실행해야 합니다." >&2
  exit 1
fi

source_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
admin_user="${SUDO_USER:-Tutiadmin}"

case "$admin_user" in
  *[!A-Za-z0-9_-]* | "")
    echo "허용할 사용자 이름이 올바르지 않습니다." >&2
    exit 1
    ;;
esac

install -d -o root -g root -m 0755 /usr/local/sbin

for operation in tuti-prod-deploy tuti-prod-rollback tuti-prod-backup tuti-prod-restore tuti-prod-health tuti-dev-refresh tuti-dev-restart tuti-docker-status tuti-android-debug-build tuti-android-release-setup tuti-android-release-build tuti-tourism-bootstrap tuti-tourism-data-bootstrap tuti-tourism-backup tuti-seoul-realtime-sync tuti-place-candidate-refresh tuti-crowd-forecast-refresh tuti-crowd-estimate-refresh tuti-tourism-timeseries-refresh tuti-transport-hubs-sync tuti-accommodations-sync tuti-llm-profile-refresh tuti-auth-retention-purge tuti-location-commencement-evidence tuti-location-compliance-purge tuti-location-security-inspection tuti-location-access-change tuti-journal-publication-audit; do
  install -o root -g root -m 0750 \
    "$source_dir/$operation" \
    "/usr/local/sbin/$operation"
done

sudoers_file="$(mktemp /etc/sudoers.d/tuti-operations.XXXXXX)"
trap 'rm -f "$sudoers_file"' EXIT

printf '%s\n' \
  "${admin_user} ALL=(root) NOPASSWD: /usr/local/sbin/tuti-prod-deploy, /usr/local/sbin/tuti-prod-rollback, /usr/local/sbin/tuti-prod-backup, /usr/local/sbin/tuti-prod-restore, /usr/local/sbin/tuti-prod-health, /usr/local/sbin/tuti-dev-refresh, /usr/local/sbin/tuti-dev-restart, /usr/local/sbin/tuti-docker-status, /usr/local/sbin/tuti-android-debug-build, /usr/local/sbin/tuti-android-release-setup, /usr/local/sbin/tuti-android-release-build, /usr/local/sbin/tuti-tourism-bootstrap, /usr/local/sbin/tuti-tourism-data-bootstrap, /usr/local/sbin/tuti-tourism-backup, /usr/local/sbin/tuti-seoul-realtime-sync, /usr/local/sbin/tuti-place-candidate-refresh, /usr/local/sbin/tuti-crowd-forecast-refresh, /usr/local/sbin/tuti-crowd-estimate-refresh, /usr/local/sbin/tuti-tourism-timeseries-refresh, /usr/local/sbin/tuti-transport-hubs-sync, /usr/local/sbin/tuti-accommodations-sync, /usr/local/sbin/tuti-llm-profile-refresh, /usr/local/sbin/tuti-auth-retention-purge, /usr/local/sbin/tuti-location-commencement-evidence, /usr/local/sbin/tuti-location-compliance-purge, /usr/local/sbin/tuti-location-security-inspection, /usr/local/sbin/tuti-location-access-change, /usr/local/sbin/tuti-journal-publication-audit" \
  > "$sudoers_file"

chmod 0440 "$sudoers_file"
sudoers_target="/etc/sudoers.d/tuti-operations"
install -o root -g root -m 0440 "$sudoers_file" "$sudoers_target"
rm -f /usr/local/sbin/tuti-wellness-bootstrap
rm -f /usr/local/sbin/tuti-tourism-data-promote
rm -f /usr/local/sbin/tuti-tourism-sync
rm -f /etc/cron.d/tuti-tourism-backup

if ! sudo -l -U "$admin_user" >/dev/null 2>&1; then
  rm -f "$sudoers_target"
  echo "sudoers 설정을 검증하지 못해 설치를 되돌렸습니다." >&2
  exit 1
fi

echo "Tuti 운영 명령 설치가 완료되었습니다."
