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
sudo -n /usr/local/sbin/tuti-tourism-data-promote
sudo -n /usr/local/sbin/tuti-place-candidate-refresh
```

`tuti-prod-deploy`는 운영용 ops 이미지를 빌드하고 DB 마이그레이션을 적용한 뒤 앱 컨테이너만 다시 빌드·교체한다. 시드는 실행하지 않는다.

`tuti-dev-refresh`는 개발 DB 마이그레이션을 적용한 뒤 개발 앱을 재시작한다. `tuti-dev-restart`는 마이그레이션 없이 개발 앱만 재시작한다.

`tuti-tourism-sync`는 매 실행마다 한 시도를 순환 선택하고, 관광지·문화시설·여행코스·레포츠를 각각 최대 1,000건(100건 × 10페이지) 동기화한다. 17일 동안 전국을 한 바퀴 돌고, 다음 순환에서는 다음 10페이지 묶음을 수집한다. 이어서 웰니스, 관광사진 메타데이터, 중심 관광지, 집중률, 방문자 수, 지역 지표의 미완료 작업을 최대 동시 요청 4개로 이어받는다. API 일일 호출 한도에 도달한 데이터셋은 다음 실행까지 보류한다. 승인된 장소의 편집 필드는 동기화로 덮어쓰지 않는다.

`tuti-tourism-bootstrap`은 관광지·문화시설·여행코스·레포츠의 전국 전체 페이지를 10페이지 구간으로 나누어 네 구간씩 병렬 동기화한다. 초기 기준 데이터를 구축하거나 전체 누락 여부를 복구할 때만 수동 실행하며, 기존 데이터는 upsert하고 승인된 장소의 편집 필드는 덮어쓰지 않는다.

`tuti-tourism-data-bootstrap`은 TourAPI 장소 수집이 끝난 뒤 실행한다. 웰니스, 관광사진 메타데이터, 기초지자체 중심 관광지, 관광지 집중률, 지역별 방문자 수, 지역 관광 지표를 순서대로 수집한다. 사진 파일은 내려받지 않고 공공데이터가 제공하는 이미지 URL과 메타데이터만 저장한다. 기본 이력 범위는 일별 방문자 수 90일, 월별 중심 관광지·지역 지표 24개월이며, 이미 저장된 일자·월·지역·지표 조합은 다시 실행할 때 건너뛴다.

수집 범위와 동시 요청 수를 줄여 시험할 때는 `tuti-tourism-data-bootstrap dev --months 1 --visitor-days 1 --concurrency 1`처럼 실행한다. 월 이력은 최대 60개월, 일 이력은 최대 365일, 동시 작업은 최대 4개까지 지정할 수 있다.

전수 수집이 중단되거나 API가 HTTP 429를 반환해도 같은 명령을 다시 실행하면 `succeeded` 상태의 작업만 건너뛰고 `failed`, `partial`, 중단된 작업을 다시 시도한다. 타임아웃과 HTTP 502~504는 한 작업 안에서 최대 세 번 재시도한다. 한 시간 넘게 `running`으로 남은 기록은 다음 실행 시작 시 실패 상태로 정리한다. API 호출 한도에 도달한 데이터셋은 즉시 보류하고 별도 키를 사용하는 다음 데이터셋 수집을 계속한다.

`tuti-tourism-data-promote`는 개발 DB에서 수집한 관광지 원천·웰니스·관광사진·중심 관광지·집중률·방문자 수·지역 지표와 동기화 체크포인트를 운영 DB로 이관한다. 관광지 원천의 기존 승인 연결은 초기화하며 운영 사용자·장소·기록 데이터는 변경하지 않는다. 적용 직전에 운영의 동일 테이블을 `.ops-backups/tourism`에 백업하고, 대상 테이블 교체는 단일 트랜잭션으로 실행한다.

`tuti-place-candidate-refresh`는 개발 DB에서 하루 최대 950곳의 공통·소개정보를 한 번만 수집한다. 추천·보강 후보, 판단 보류, 저부담 부적합, 유효성 문제 순서로 처리한다. 개발 DB의 관광지 중 운영에 없는 장소만 증분 생성하고, 기존 운영 장소의 편집·검수·수동 포함/제외 상태는 보존한다. 소개정보도 운영 DB에 증분 반영하되 운영의 지연 수집 이미지·반복정보는 덮어쓰지 않는다. 이후 개발·운영 DB에서 동일한 후보 판정식을 실행해 상태·점수·판정 근거를 각각 저장한다. 중복 실행은 호스트 잠금과 PostgreSQL advisory lock으로 차단한다.

후보 갱신 명령은 일일 작업 중 의존성을 다시 설치하거나 마이그레이션하지 않는다. 최초 실행 전과 후보 관련 코드를 배포한 날에는 `tuti-dev-refresh`, `tuti-prod-deploy`를 먼저 실행해야 한다. 코드나 DB 스키마가 준비되지 않았으면 후보 갱신은 API 호출 전에 중단하고 필요한 명령을 안내한다.

기본값은 장소 950곳, 동시 요청 2개이며 각각 `TUTI_PLACE_CANDIDATE_LIMIT`, `TUTI_PLACE_CANDIDATE_CONCURRENCY`로 조절한다. 한 장소당 TourAPI 요청 2회를 사용하므로 기본 실행은 최대 1,900회를 소비하고, 확인된 일일 한도 2,000회 중 100회를 오류 재시도나 다른 호출을 위해 남긴다. 모든 장소가 최근 30일 안에 보강된 뒤에는 수집 대상이 0건인 안전한 no-op이 된다.

수집이 끝난 뒤 운영 증분 반영 단계에서 중단됐다면 `tuti-place-candidate-refresh --skip-enrichment`로 재개한다. 이 모드는 TourAPI를 추가 호출하지 않고 이미 개발 DB에 저장된 소개정보를 운영 DB로 옮긴 뒤 양쪽 후보 판정만 다시 실행한다.

현재 서비스 키의 정확한 한도를 확인하며 전수 보강하려면 `tuti-place-candidate-refresh --until-quota`를 실행한다. 남은 장소 전체를 대상으로 시작하되 공급자가 한도 초과 응답을 반환하면 즉시 수집을 멈추고, 그때까지 성공한 결과를 개발·운영 DB에 반영한다. 다음 실행에서는 완료된 장소를 건너뛰고 이어받는다.

Synology DSM의 **제어판 → 작업 스케줄러**에서 다음 사용자 정의 스크립트를 매일 오전 3:10에 실행하면 된다.

```sh
/usr/local/sbin/tuti-tourism-sync
```

후보 보강을 우선하는 기간에는 위 정기 동기화 대신 다음 명령을 같은 방식으로 등록한다.

```sh
/usr/local/sbin/tuti-place-candidate-refresh
```

설치 명령은 저장소 안의 스크립트를 `/usr/local/sbin`에 root 소유 파일로 복사한 뒤, 위 고정 경로만 sudoers에 허용한다. 저장소 파일을 수정해도 이미 설치된 root 스크립트는 자동으로 변경되지 않으므로, 운영 명령의 변경 후에는 설치 명령을 다시 실행해야 한다.
