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
sudo -n /usr/local/sbin/tuti-tourism-sync
sudo -n /usr/local/sbin/tuti-tourism-bootstrap
sudo -n /usr/local/sbin/tuti-tourism-data-bootstrap dev
sudo -n /usr/local/sbin/tuti-tourism-data-bootstrap prod
```

`tuti-prod-deploy`는 운영용 ops 이미지를 빌드하고 DB 마이그레이션을 적용한 뒤 앱 컨테이너만 다시 빌드·교체한다. 시드는 실행하지 않는다.

`tuti-dev-refresh`는 개발 DB 마이그레이션을 적용한 뒤 개발 앱을 재시작한다. `tuti-dev-restart`는 마이그레이션 없이 개발 앱만 재시작한다.

`tuti-tourism-sync`는 매 실행마다 한 시도를 순환 선택하고, 관광지·문화시설·여행코스·레포츠를 각각 최대 1,000건(100건 × 10페이지) 동기화한다. 17일 동안 전국을 한 바퀴 돌고, 다음 순환에서는 다음 10페이지 묶음을 수집한다. 이어서 웰니스, 관광사진 메타데이터, 중심 관광지, 집중률, 방문자 수, 지역 지표의 미완료 작업을 최대 동시 요청 4개로 이어받는다. API 일일 호출 한도에 도달한 데이터셋은 다음 실행까지 보류한다. 승인된 장소의 편집 필드는 동기화로 덮어쓰지 않는다.

`tuti-tourism-bootstrap`은 관광지·문화시설·여행코스·레포츠의 전국 전체 페이지를 10페이지 구간으로 나누어 네 구간씩 병렬 동기화한다. 초기 기준 데이터를 구축하거나 전체 누락 여부를 복구할 때만 수동 실행하며, 기존 데이터는 upsert하고 승인된 장소의 편집 필드는 덮어쓰지 않는다.

`tuti-tourism-data-bootstrap`은 TourAPI 장소 수집이 끝난 뒤 실행한다. 웰니스, 관광사진 메타데이터, 기초지자체 중심 관광지, 관광지 집중률, 지역별 방문자 수, 지역 관광 지표를 순서대로 수집한다. 사진 파일은 내려받지 않고 공공데이터가 제공하는 이미지 URL과 메타데이터만 저장한다. 기본 이력 범위는 일별 방문자 수 90일, 월별 중심 관광지·지역 지표 24개월이며, 이미 저장된 일자·월·지역·지표 조합은 다시 실행할 때 건너뛴다.

수집 범위와 동시 요청 수를 줄여 시험할 때는 `tuti-tourism-data-bootstrap dev --months 1 --visitor-days 1 --concurrency 1`처럼 실행한다. 월 이력은 최대 60개월, 일 이력은 최대 365일, 동시 작업은 최대 4개까지 지정할 수 있다.

전수 수집이 중단되거나 API가 HTTP 429를 반환해도 같은 명령을 다시 실행하면 `succeeded` 상태의 작업만 건너뛰고 `failed`, `partial`, 중단된 작업을 다시 시도한다. 타임아웃과 HTTP 502~504는 한 작업 안에서 최대 세 번 재시도한다. 한 시간 넘게 `running`으로 남은 기록은 다음 실행 시작 시 실패 상태로 정리한다. API 호출 한도에 도달한 데이터셋은 즉시 보류하고 별도 키를 사용하는 다음 데이터셋 수집을 계속한다.

Synology DSM의 **제어판 → 작업 스케줄러**에서 다음 사용자 정의 스크립트를 매일 오전 3:10에 실행하면 된다.

```sh
/usr/local/sbin/tuti-tourism-sync
```

설치 명령은 저장소 안의 스크립트를 `/usr/local/sbin`에 root 소유 파일로 복사한 뒤, 위 고정 경로만 sudoers에 허용한다. 저장소 파일을 수정해도 이미 설치된 root 스크립트는 자동으로 변경되지 않으므로, 운영 명령의 변경 후에는 설치 명령을 다시 실행해야 한다.
