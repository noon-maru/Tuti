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
sudo -n /usr/local/sbin/tuti-tourism-bootstrap
sudo -n /usr/local/sbin/tuti-tourism-data-bootstrap dev
sudo -n /usr/local/sbin/tuti-tourism-data-bootstrap prod
sudo -n /usr/local/sbin/tuti-tourism-backup
sudo -n /usr/local/sbin/tuti-place-candidate-refresh
sudo -n /usr/local/sbin/tuti-crowd-forecast-refresh
sudo -n /usr/local/sbin/tuti-crowd-estimate-refresh
sudo -n /usr/local/sbin/tuti-tourism-timeseries-refresh
```

`tuti-prod-deploy`는 운영용 ops 이미지를 빌드하고 DB 마이그레이션을 적용한 뒤 앱 컨테이너만 다시 빌드·교체한다. 시드는 실행하지 않는다.

`tuti-dev-refresh`는 개발 DB 마이그레이션을 적용한 뒤 개발 앱을 재시작한다. `tuti-dev-restart`는 마이그레이션 없이 개발 앱만 재시작한다.

`tuti-tourism-bootstrap`은 관광지·문화시설·여행코스·레포츠의 전국 전체 페이지를 10페이지 구간으로 나누어 네 구간씩 병렬 동기화한다. 초기 기준 데이터를 구축하거나 전체 누락 여부를 복구할 때만 수동 실행하며, 기존 데이터는 upsert하고 승인된 장소의 편집 필드는 덮어쓰지 않는다.

`tuti-tourism-data-bootstrap`은 TourAPI 장소 수집이 끝난 뒤 실행한다. 웰니스, 관광사진 메타데이터, 기초지자체 중심 관광지, 관광지 집중률, 지역별 방문자 수, 지역 관광 지표를 순서대로 수집한다. 사진 파일은 내려받지 않고 공공데이터가 제공하는 이미지 URL과 메타데이터만 저장한다. 기본 이력 범위는 일별 방문자 수 90일, 월별 중심 관광지·지역 지표 24개월이며, 이미 저장된 일자·월·지역·지표 조합은 다시 실행할 때 건너뛴다.

수집 범위와 동시 요청 수를 줄여 시험할 때는 `tuti-tourism-data-bootstrap dev --months 1 --visitor-days 1 --concurrency 1`처럼 실행한다. 월 이력은 최대 60개월, 일 이력은 최대 365일, 동시 작업은 최대 4개까지 지정할 수 있다.

전수 수집이 중단되거나 API가 HTTP 429를 반환해도 같은 명령을 다시 실행하면 `external_data_sync_checkpoints`에 완료된 작업만 건너뛰고 실패·부분 완료·중단된 작업을 다시 시도한다. 타임아웃과 HTTP 502~504는 한 작업 안에서 최대 세 번 재시도한다. 한 시간 넘게 `running`으로 남은 기록은 다음 실행 시작 시 실패 상태로 정리한다. API 호출 한도에 도달한 데이터셋은 즉시 보류하고 별도 키를 사용하는 다음 데이터셋 수집을 계속한다.

개발 DB 전체를 운영 DB로 이관하는 명령은 제공하지 않는다. 정기 시계열 작업은 개발 DB에서 외부 API를 한 번 호출한 뒤 실행 중 변경된 레코드만 자연 키 기준으로 운영 DB에 upsert한다. 복구가 필요할 때는 검증된 백업을 별도 스키마에 적재한 뒤 병합한다.

`tuti-tourism-backup`은 개발·운영 DB의 관광 원천 테이블과 `external_data_sync_checkpoints`만 `.ops-backups/tourism-periodic`에 각각 백업한다. 수집 실행 로그, 사용자, 인증, 기록 및 애플리케이션 로그는 포함하지 않는다. 기본 보관 기간은 30일이다. 실행 일정은 Synology DSM 작업 스케줄러에서 `root` 사용자로 관리하며, 매일 오전 4시 30분 실행을 권장한다. 즉시 백업은 다음 명령으로 실행한다.

```sh
sudo -n /usr/local/sbin/tuti-tourism-backup
```

`tuti-place-candidate-refresh`는 개발 DB에서 하루 최대 950곳의 공통·소개정보를 한 번만 수집한다. 추천·보강 후보, 판단 보류, 저부담 부적합, 유효성 문제 순서로 처리한다. 개발 DB의 관광지 중 운영에 없는 장소만 증분 생성하고, 기존 운영 장소의 편집·검수·수동 포함/제외 상태는 보존한다. 소개정보도 운영 DB에 증분 반영하되 운영의 지연 수집 이미지·반복정보는 덮어쓰지 않는다. 이후 개발·운영 DB에서 동일한 후보 판정식을 실행해 상태·점수·판정 근거를 각각 저장한다. 중복 실행은 호스트 잠금과 PostgreSQL advisory lock으로 차단한다.

후보 갱신 명령은 일일 작업 중 의존성을 다시 설치하거나 마이그레이션하지 않는다. 최초 실행 전과 후보 관련 코드를 배포한 날에는 `tuti-dev-refresh`, `tuti-prod-deploy`를 먼저 실행해야 한다. 코드나 DB 스키마가 준비되지 않았으면 후보 갱신은 API 호출 전에 중단하고 필요한 명령을 안내한다.

기본값은 장소 950곳, 동시 요청 2개이며 각각 `TUTI_PLACE_CANDIDATE_LIMIT`, `TUTI_PLACE_CANDIDATE_CONCURRENCY`로 조절한다. 한 장소당 TourAPI 요청 2회를 사용하므로 기본 실행은 최대 1,900회를 소비하고, 확인된 일일 한도 2,000회 중 100회를 오류 재시도나 다른 호출을 위해 남긴다. 모든 장소가 최근 30일 안에 보강된 뒤에는 수집 대상이 0건인 안전한 no-op이 된다.

수집이 끝난 뒤 운영 증분 반영 단계에서 중단됐다면 `tuti-place-candidate-refresh --skip-enrichment`로 재개한다. 이 모드는 TourAPI를 추가 호출하지 않고 이미 개발 DB에 저장된 소개정보를 운영 DB로 옮긴 뒤 양쪽 후보 판정만 다시 실행한다.

현재 서비스 키의 정확한 한도를 확인하며 전수 보강하려면 `tuti-place-candidate-refresh --until-quota`를 실행한다. 남은 장소 전체를 대상으로 시작하되 공급자가 한도 초과 응답을 반환하면 즉시 수집을 멈추고, 그때까지 성공한 결과를 개발·운영 DB에 반영한다. 다음 실행에서는 완료된 장소를 건너뛰고 이어받는다.

원천 장소 전수수집은 완료됐으므로 `tuti-tourism-sync`는 제거했다. 초기 전수수집 명령은 장애 복구를 위한 수동 명령으로만 남긴다.

`tuti-crowd-forecast-refresh`는 중심 관광지 지역을 일곱 묶음으로 나눠 그날의 한 묶음에 해당하는 관광지 집중률 30일 예측을 개발 DB에서 갱신하고 운영 DB에 증분 반영한다. 매일 오전 3시에 실행하면 일주일에 전국을 한 번 갱신한다.

`tuti-tourism-timeseries-refresh`는 최근 14일 지역 방문자 수를 다시 upsert한다. 매주 월요일 오전 2시에 실행한다. `--monthly`를 붙이면 최신 기준월의 중심 관광지와 지역 수요·체류·소비 지표도 다시 수집하므로 매월 5일 오전 1시에 별도 실행한다. 두 모드 모두 개발 DB 수집 후 운영 DB에 증분 반영한다.

`tuti-crowd-estimate-refresh`는 개발·운영 DB 각각의 추천풀을 대상으로 지역 방문량 55%, 장소 중심성 25%, 지역 수요 20%를 가용한 항목끼리 재정규화해 오늘부터 8일치 예상 혼잡도를 계산한다. 외부 API를 호출하지 않는다. 관광 시계열·집중률 및 후보 재판정 작업이 모두 끝난 뒤 매일 한 번 실행한다.

Synology DSM의 **제어판 → 작업 스케줄러**에는 아래 작업을 등록한다.

```sh
/usr/local/sbin/tuti-crowd-forecast-refresh
```

```sh
/usr/local/sbin/tuti-crowd-estimate-refresh
```

```sh
/usr/local/sbin/tuti-tourism-timeseries-refresh
```

```sh
/usr/local/sbin/tuti-tourism-timeseries-refresh --monthly
```

상세·소개정보 보강과 추천 후보 재판정은 다음 명령을 별도 일정으로 실행한다.

```sh
/usr/local/sbin/tuti-place-candidate-refresh
```

설치 명령은 저장소 안의 스크립트를 `/usr/local/sbin`에 root 소유 파일로 복사한 뒤, 위 고정 경로만 sudoers에 허용한다. 저장소 파일을 수정해도 이미 설치된 root 스크립트는 자동으로 변경되지 않으므로, 운영 명령의 변경 후에는 설치 명령을 다시 실행해야 한다.
