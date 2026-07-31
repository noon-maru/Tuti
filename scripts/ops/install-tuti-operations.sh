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

for operation in tuti-prod-deploy tuti-dev-refresh tuti-dev-restart tuti-docker-status tuti-tourism-sync tuti-tourism-bootstrap tuti-tourism-data-bootstrap tuti-tourism-data-promote; do
  install -o root -g root -m 0750 \
    "$source_dir/$operation" \
    "/usr/local/sbin/$operation"
done

sudoers_file="$(mktemp /etc/sudoers.d/tuti-operations.XXXXXX)"
trap 'rm -f "$sudoers_file"' EXIT

printf '%s\n' \
  "${admin_user} ALL=(root) NOPASSWD: /usr/local/sbin/tuti-prod-deploy, /usr/local/sbin/tuti-dev-refresh, /usr/local/sbin/tuti-dev-restart, /usr/local/sbin/tuti-docker-status, /usr/local/sbin/tuti-tourism-sync, /usr/local/sbin/tuti-tourism-bootstrap, /usr/local/sbin/tuti-tourism-data-bootstrap, /usr/local/sbin/tuti-tourism-data-promote" \
  > "$sudoers_file"

chmod 0440 "$sudoers_file"
sudoers_target="/etc/sudoers.d/tuti-operations"
install -o root -g root -m 0440 "$sudoers_file" "$sudoers_target"
rm -f /usr/local/sbin/tuti-wellness-bootstrap

if ! sudo -l -U "$admin_user" >/dev/null 2>&1; then
  rm -f "$sudoers_target"
  echo "sudoers 설정을 검증하지 못해 설치를 되돌렸습니다." >&2
  exit 1
fi

echo "Tuti 운영 명령 설치가 완료되었습니다."
