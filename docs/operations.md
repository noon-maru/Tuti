# 운영 명령

Codex가 Docker 전체 권한을 갖지 않도록, Tuti 작업만 허용하는 root 소유 명령을 사용한다.

처음 한 번, NAS 터미널에서 설치한다.

```sh
sudo sh scripts/ops/install-tuti-operations.sh
```

설치 후에는 아래 명령만 비밀번호 없이 사용할 수 있다.

```sh
sudo -n /usr/local/sbin/tuti-prod-deploy
sudo -n /usr/local/sbin/tuti-prod-rollback
sudo -n /usr/local/sbin/tuti-prod-backup
sudo -n /usr/local/sbin/tuti-prod-restore YYYYMMDD-HHMMSS --confirm-production-restore
sudo -n /usr/local/sbin/tuti-prod-health
sudo -n /usr/local/sbin/tuti-dev-refresh
sudo -n /usr/local/sbin/tuti-dev-restart
sudo -n /usr/local/sbin/tuti-docker-status
sudo -n /usr/local/sbin/tuti-android-debug-build
sudo -n /usr/local/sbin/tuti-android-release-setup
sudo -n /usr/local/sbin/tuti-android-release-build
sudo -n /usr/local/sbin/tuti-tourism-bootstrap
sudo -n /usr/local/sbin/tuti-tourism-data-bootstrap dev
sudo -n /usr/local/sbin/tuti-tourism-data-bootstrap prod
sudo -n /usr/local/sbin/tuti-tourism-backup
sudo -n /usr/local/sbin/tuti-place-candidate-refresh
sudo -n /usr/local/sbin/tuti-crowd-forecast-refresh
sudo -n /usr/local/sbin/tuti-crowd-estimate-refresh
sudo -n /usr/local/sbin/tuti-tourism-timeseries-refresh
sudo -n /usr/local/sbin/tuti-llm-profile-refresh
sudo -n /usr/local/sbin/tuti-auth-retention-purge
```

`tuti-prod-deploy`는 현재 Git 커밋으로 `tuti:prod-{커밋}`과
`tuti:ops-{커밋}` 이미지를 만든다. 이미지 안에서 테스트를 실행한 뒤 PostgreSQL
전체와 Garage 객체를 백업하고, DB 마이그레이션과 교통 거점 동기화를 적용한다.
커밋되지 않은 파일이 있으면 이미지 출처가 모호해지므로 배포를 시작하지 않는다.
새 앱의 readiness가 60초 안에 확인되면 배포 상태를 저장하고, 실패하면 이전 앱
이미지로 자동 복귀한다. 시드는 실행하지 않는다. DB 마이그레이션은 데이터 손실을
막기 위해 자동으로 역적용하지 않으므로 모든 운영 마이그레이션은 이전 앱과도
호환되는 expand-contract 방식으로 작성한다.
성공한 앱·ops 커밋 이미지는 각각 최근 5개까지 유지한다.

`tuti-prod-rollback`은 마지막 성공 배포 직전의 앱 이미지로 되돌린다. DB 스키마는
되돌리지 않으며 readiness 확인을 통과해야 성공한다. 롤백 가능한 이미지를 임의로
정리하지 말고 적어도 직전 두 버전은 유지한다.

## 전체 백업과 복구

`tuti-prod-backup`은 운영 PostgreSQL의 스키마와 전체 데이터를 custom dump로
저장하고, Garage 버킷의 객체를 S3 API로 읽어 각 객체의 SHA-256, 콘텐츠 유형,
캐시 정책과 함께 논리 백업한다. 기본 경로는
`/volume1/tuti/backups/full/{YYYYMMDD-HHMMSS}`이고 기본 보존기간은 30일이다.
각 백업에는 전체 파일 체크섬과 Git 리비전이 포함된다. `.env`와 API 비밀키는
백업에 포함하지 않으므로 별도 암호관리 도구에 보관한다.
DB가 가리키는 객체와 실제 객체의 시점을 맞추기 위해 백업 중에는 운영 앱을 잠시
중지하고 완료 또는 실패 시 원래 상태로 다시 시작한다. 새벽 저사용 시간에 실행한다.

```sh
sudo -n /usr/local/sbin/tuti-prod-backup
```

동일 NAS의 백업은 디스크·화재·랜섬웨어 장애를 함께 겪을 수 있다. Synology Hyper
Backup으로 `/volume1/tuti/backups/full`을 외장 장치나 원격 저장소에 한 번 더
복제한다. 기존 관광·혼잡도 정기 작업보다 앞선 매일 오전 00:20 전체 백업,
보관 30일을 권장한다.

복구는 운영 앱을 중지하고 PostgreSQL 객체를 교체한 뒤 백업에 포함된 Garage
객체를 검증·덮어쓴다. 백업에 없던 Garage 객체는 자동 삭제하지 않는다. 운영
데이터를 바꾸는 작업이므로 백업 ID와 확인 인자가 모두 필요하다.

```sh
sudo -n /usr/local/sbin/tuti-prod-restore \
  20260815-022000 \
  --confirm-production-restore
```

분기마다 별도 테스트 환경에서 최근 백업을 복구하고 로그인, 추천, 저널 이미지
조회까지 확인한다. 복구 시험 결과와 소요시간을 운영 기록에 남긴다.

## 상태 점검과 알림

`/api/health?scope=liveness`는 Next.js 프로세스만 확인하고 `/api/health`는
PostgreSQL과 활성화된 Garage 버킷까지 확인한다. 비밀값이나 DB 상세 오류는
응답하지 않는다. 운영 앱 컨테이너도 liveness를 30초마다 확인한다.

`tuti-prod-health`는 앱 liveness/readiness, PostgreSQL, Garage Compose와 백업·
스토리지 볼륨 사용률을 점검하고 `.ops-state/health`에 30일간 로그를 남긴다.
오류 시 0이 아닌 종료코드를 반환하므로 DSM 작업 스케줄러의 실패 이메일 알림을
활성화한다. 매 5분 실행을 권장한다.
각 단계의 실패를 즉시 최종 종료코드에 반영하므로 뒤이어 성공한 점검이 앞선 장애를
정상으로 덮어쓰지 않는다.
백업·배포·복구 프로세스가 실행 중이면 유지보수 상태로 기록하고 정상 종료하므로
계획된 앱 중지로 인한 거짓 장애 알림은 발생하지 않는다. 종료된 프로세스가 남긴
표식은 다음 점검에서 자동으로 제거한다.

```sh
/usr/local/sbin/tuti-prod-health
```

디스크 경고 기본값은 85%다. 작업 스케줄러 명령 앞에 환경변수를 지정해 바꿀 수
있다. JSON `{ "text": "..." }`를 받는 Slack/Discord 호환 프록시가 있다면 실패
알림 웹훅도 설정할 수 있다.

```sh
TUTI_DISK_WARNING_PERCENT=80 \
TUTI_OPERATIONS_ALERT_WEBHOOK_URL='https://example.invalid/webhook' \
/usr/local/sbin/tuti-prod-health
```

## API 요청 제한

`src/proxy.ts`는 `/api` 요청을 IP와 세션 토큰의 단방향 축약값 조합으로 구분해
고정 시간창 요청 제한을 적용한다. 인증코드, OAuth, 추천, 경로 계산, 이미지 변경,
문의·신고에는 일반 조회보다 낮은 별도 한도가 적용된다. 제한 응답은 HTTP 429,
`Retry-After`와 `X-RateLimit-*` 헤더를 제공하고 Capacitor 출처에도 CORS를
유지한다. 토큰 원문은 카운터 키에 저장하지 않는다.

현재 운영은 단일 Next.js 인스턴스이므로 프로세스 메모리 카운터를 사용한다.
인스턴스가 여러 개가 되면 Redis 등 공용 저장소 또는 Cloudflare Rate Limiting으로
카운터를 이전해야 한다. Cloudflare에서도 `/api/auth`, 이미지 업로드와 추천 API에
IP 기반 1차 제한을 두면 우회·분산 요청 방어가 강화된다.

`tuti-dev-refresh`는 개발 DB 마이그레이션을 적용한 뒤 개발 앱을 재시작한다. `tuti-dev-restart`는 마이그레이션 없이 개발 앱만 재시작한다.

`tuti-android-debug-build`는 JDK와 Android SDK를 격리한 전용 Docker 이미지에서
Capacitor 정적 앱을 동기화하고 Debug APK를 생성한다. 자세한 빌드 환경과 산출물
경로는 [Android 빌드](./android-build.md)를 따른다.

`tuti-android-release-setup`은 저장소 밖에 Play 업로드 키와 임의 비밀번호를 최초
한 번 생성한다. 기존 키는 절대로 덮어쓰지 않는다. `tuti-android-release-build`는
해당 비밀값을 환경변수로만 Gradle에 전달해 운영 정적 앱을 서명된 AAB로 만들고,
서명과 SHA-256을 검증한다. 키스토어와 비밀번호 파일은 NAS 외부에도 암호화해
백업한다. 자세한 절차는 [Android 빌드](./android-build.md)를 따른다.

로컬 macOS에서 iOS Simulator용 앱을 빌드하는 절차는
[iOS 빌드](./ios-build.md)를 따른다. App Store 배포용 서명과 Archive 자동화는
Apple Developer Team 및 프로비저닝 정책이 확정된 뒤 구성한다.

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

장소 상세정보가 갱신된 뒤 장소 의미 프로필만 증분 생성한다. 사용자 답변과 행동은
외부 LLM로 전송하지 않으며 추천 요청 중에도 외부 LLM을 호출하지 않는다. 장소
후보 보강 뒤인 매일 오전 5시 30분 실행을 권장한다.

```sh
/usr/local/sbin/tuti-llm-profile-refresh
```

만료된 이메일 인증코드, 로그인 세션과 OAuth 임시자료는 서비스 요청 중 한 시간
간격으로 정리하며, 아래 명령도 매일 한 차례 실행한다.

```sh
/usr/local/sbin/tuti-auth-retention-purge
```

설치 명령은 저장소 안의 스크립트를 `/usr/local/sbin`에 root 소유 파일로 복사한 뒤, 위 고정 경로만 sudoers에 허용한다. 저장소 파일을 수정해도 이미 설치된 root 스크립트는 자동으로 변경되지 않으므로, 운영 명령의 변경 후에는 설치 명령을 다시 실행해야 한다.
