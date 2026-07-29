# 운영 명령

Codex가 Docker 전체 권한을 갖지 않도록, Tuti 작업만 허용하는 root 소유 명령을 사용한다.

처음 한 번, NAS 터미널에서 설치한다.

```sh
sudo sh scripts/ops/install-tuti-operations.sh
```

설치 후에는 아래 명령만 비밀번호 없이 사용할 수 있다.

```sh
sudo -n /usr/local/sbin/tuti-prod-deploy
sudo -n /usr/local/sbin/tuti-dev-refresh
sudo -n /usr/local/sbin/tuti-dev-restart
sudo -n /usr/local/sbin/tuti-docker-status
```

`tuti-prod-deploy`는 운영용 ops 이미지를 빌드하고 DB 마이그레이션을 적용한 뒤 앱 컨테이너만 다시 빌드·교체한다. 시드는 실행하지 않는다.

`tuti-dev-refresh`는 개발 DB 마이그레이션을 적용한 뒤 개발 앱을 재시작한다. `tuti-dev-restart`는 마이그레이션 없이 개발 앱만 재시작한다.

설치 명령은 저장소 안의 스크립트를 `/usr/local/sbin`에 root 소유 파일로 복사한 뒤, 그 네 개의 고정 경로만 sudoers에 허용한다. 저장소 파일을 수정해도 이미 설치된 root 스크립트는 자동으로 변경되지 않으므로, 운영 명령의 변경 후에는 설치 명령을 다시 실행해야 한다.
