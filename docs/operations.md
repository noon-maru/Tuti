# 운영 명령

## env 예제의 역할과 편집 경계

실제 env는 운영자가 직접 편집한다. 예제는 신규 설정의 안내이며 현재 운영값의 사본이 아니다.

| 예제 | 역할 |
| --- | --- |
| `.env.example` | 공통 서버 설정·연동 자격증명·보호 플래그 |
| `.env.development.example` | 개발 웹·DB의 별도 설정 |
| `.env.production.example` | 운영 재정의·스토어 업데이트 정책·운영 DB |
| `.env.storage.example` | Garage 경로·키·버킷 |

앱 공개 설정은 Android·iOS Actions, 웹 공개 빌드 설정은 웹 배포 Actions에서 관리한다.
로컬 앱 빌드 예제 2개는 제거했다. 일반 push만으로 배포되지는 않으며 수동 실행을 유지한다.
공통 파일보다 환경별 파일이 뒤에 적용되며 **빈 값도 앞선 값을 덮어쓴다**.
기존 서명·암호화·원장 키와 시행 시각·활성 플래그는 예제로 초기화하거나 임의 교체하지 않는다.
스토어의 실제 공개 버전과 최소 지원 버전은 운영자가 확인해 입력한다. 최소 버전을 비워두면
최신 버전이 최소 지원 버전이 되므로 단순 업데이트 권고와 혼동하지 않는다.

마디 환경변수는 `MADI_SHARE_TRACE_SECRET`, `NEXT_PUBLIC_MADI_PUBLICATION_ENABLED`,
`NEXT_PUBLIC_MADI_PUBLICATION_AUDIENCE`, `SENSITIVE_MADI_WORKFLOW_ENABLED`를 사용한다.
서버·빌드 도구는 전환 동안 이전 JOURNAL 이름도 호환한다. 새 플래그가 명시되면 false·빈 값도
우선하며, 공유 서명키는 이름만 바꾸고 값·서명 입력은 유지한다.

## 운영 도구 설치

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
sudo -n /usr/local/sbin/tuti-dev-verify
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
sudo -n /usr/local/sbin/tuti-journal-publication-audit
sudo -n /usr/local/sbin/tuti-journal-moderation-purge
```

`tuti-prod-deploy`는 현재 Git 커밋으로 `tuti:prod-{커밋}`과
`tuti:ops-{커밋}` 이미지를 만든다. 이미지 안에서 테스트와 `pnpm db:derived:check`를
실행한 뒤 PostgreSQL
전체와 Garage 객체를 백업하고, DB 마이그레이션과 교통 거점 동기화를 적용한다.
커밋되지 않은 파일이 있으면 이미지 출처가 모호해지므로 배포를 시작하지 않는다.
새 앱의 readiness가 60초 안에 확인되면 배포 상태를 저장하고, 실패하면 이전 앱
이미지로 호환 조건이 맞을 때 자동 복귀한다. 시드는 실행하지 않는다. DB 마이그레이션은 데이터 손실을
막기 위해 자동으로 역적용하지 않으므로 모든 운영 마이그레이션은 이전 앱과도
호환되는 expand-contract 방식으로 작성한다.
성공한 앱·ops 커밋 이미지는 각각 최근 5개까지 유지한다.

**중단·롤백 경계:** 전체 DB와 객체의 일관된 백업 동안 앱을 잠시 멈출 수 있으므로
이 절차를 무중단 배포라고 안내하지 않는다. 마이그레이션을 자동 역적용하지 않는다.
하루마디 속지 열 삭제 이후에는 `com.tuti.harumadi-layout=automatic` 라벨을 가진 이미지인지
배포·롤백 보호 장치가 검사한다. 호환되지 않는 이전 이미지를 강제로 실행하거나 과거 DB·
삭제 원장으로 되돌려 우회하지 않는다. 새 설치는 `scripts/ops/install-harumadi-deploy-guards`의
검토·설치 절차를 확인한다.

파생 데이터 사전 검사는 현재 추천 대상과 후보 재평가 후 추천 대상을 함께 확인하며,
요약·행동 문구 누락, 원문/요약 상태 불일치, 체류시간 구조화 누락과 원문 변경을
한 번에 보고한다. DB 쓰기와 외부 API 호출 없이 전체 백업·마이그레이션·앱 교체
전에 실패시킨다. 현재 체류시간 원문이 비어 있으면 과거 구조화 결과는 무시하고
기본 추정값을 사용하도록 주의만 표시한다. 신규 스키마 변경 시 사전 검사 조회는
마이그레이션 전 운영 스키마와도 호환되게 유지해야 한다.

저장된 원본 응답에는 소개문이 있지만 가공 필드가 빈 경우도 사전 검사에서
중단한다. `pnpm exec tsx scripts/repair-place-editorial-fields.ts --ids ID1,ID2`로
복원 대상을 먼저 확인하고, 같은 명령에 `--apply`를 붙여 빈 필드만 복원한다.
외부 API는 호출하지 않으며 기존 편집값은 덮어쓰지 않는다. 개발 DB의 원문을
운영으로 동기화하므로 두 환경에서 같은 대상의 상태를 확인해야 한다.

2026-10-16에는 운영 누락 11곳과 개발에서만 누락된 쌍봉사 1곳의 요약·행동 문구를
저장 원문을 읽어 직접 보완했다. 소개가 빈 기존 8곳은 저장 원문으로 복원하고,
그중 요약 입력이 없거나 `null`이던 7곳도 보완했다(운영 누락 11곳 중 2곳과 중복).
체류시간 원문이 비어 있는 6곳은 과거 구조화 수치를 확정값으로 재사용하지 않고
현재 장소 정보 기반 추정 프로필을 사용한다. 이 경우는 경고이며 배포 오류는 아니다.
원문이 존재하면서 내용이 달라진 경우에는 계속 검사를 실패시킨다.

운영 명령 스크립트를 변경한 뒤에는 위 설치 명령으로 root 소유 명령도 갱신해야
새로운 배포 사전 검사가 실제 운영 명령에 적용된다.

## GitHub Actions 원격 운영 배포

`.github/workflows/web-production-deploy.yml`은 수동 실행 전용이다. GitHub-hosted
Linux runner가 `linux/amd64` 앱 이미지와 운영 작업 이미지를 만들고, 커밋 전체 SHA를
태그로 사용해 GHCR의 `noon-maru/tuti-web`, `noon-maru/tuti-ops` 패키지에 저장한다.
NAS에서는 빌드하지 않는다.

`deploy_to_production`을 선택하지 않으면 이미지만 만들고 운영 서비스는 바꾸지 않는다.
선택하면 `self-hosted`, `linux`, `x64`, `tuti-production` 라벨을 모두 가진 NAS
runner가 정확히 같은 `main` 커밋으로 운영 체크아웃을 fast-forward한 뒤
`tuti-prod-deploy-remote`를 호출한다. 이 명령은 임시 Docker 인증 폴더에서 GHCR
이미지를 내려받고 기존 `tuti-prod-deploy`에 넘긴다. 따라서 이미지 내부 테스트,
전체 백업, DB 마이그레이션, 교통 거점 동기화, 앱 교체, readiness 확인과 실패 시
이전 앱 이미지 복귀 절차는 로컬 배포와 동일하다.

최초 한 번 다음 준비가 필요하다.

1. 저장소 `Settings → Actions → Runners → New self-hosted runner`에서 Linux x64
   안내를 열고 NAS의 `Tutiadmin` 계정으로 전용 runner를 설치한다.
2. runner 등록 시 이름은 `Tuti-production`, 사용자 지정 라벨은
   `tuti-production`으로 지정한다. runner는 재부팅 후에도 시작되도록 서비스로
   설치한다.
3. 저장소 `Settings → Environments`에 `production` 환경을 만들고 배포 브랜치를
   `main`으로 제한한다. 필요하면 승인 규칙도 여기에서 설정한다.
4. 최신 운영 스크립트를 root 소유 명령으로 다시 설치한다.

```sh
sudo sh scripts/ops/install-tuti-operations.sh
```

GHCR 인증에는 실행마다 발급되는 저장소 `GITHUB_TOKEN`을 사용하므로 장기 PAT를 NAS나
GitHub Secret에 추가하지 않는다. 인증 정보는 표준입력으로만 전달되고 배포가 끝나면
임시 Docker 인증 폴더와 함께 제거된다. runner가 오프라인이면 이미지 빌드는 끝나도
배포 job은 대기 상태로 남는다.

이 저장소는 공개 저장소이므로 NAS runner를 일반 CI나 `pull_request` workflow에
절대 배정하지 않는다. 운영 배포 job은 `workflow_dispatch`, `main`, `production`
environment와 전용 `tuti-production` 라벨을 함께 유지한다. GitHub도 공개 저장소의
self-hosted runner는 신뢰하지 않은 pull request가 호스트를 침해할 수 있어 주의를
요구한다. 저장소를 비공개로 전환할 수 있다면 그 구성이 더 안전하다.

실행 경로는 `Actions → Web Production Deploy → Run workflow`다. 반드시 `main`을
선택하고 실제 운영 반영이 필요할 때만 `빌드한 이미지를 Tuti 운영 서버에 배포`를
체크한다.

### NAS 재부팅 후 배포 러너 자동 복구

운영 러너 서비스가 `enabled`여도 부팅 시 `/volume1`이나 공유 폴더가 준비되기
전에 시작되면 `200/CHDIR`로 실패할 수 있다. 다음 명령은 기존 등록·자격증명을
유지하고 systemd drop-in만 설치한다. NAS의 비밀번호를 입력할 수 있는 터미널에서
한 번 실행한다. 진행 중인 배포 작업이나 수동 실행 러너가 있으면 변경 전에 중단한다.

```sh
sudo sh scripts/ops/install-tuti-production-runner.sh
```

볼륨 마운트, Synology 볼륨 후처리와 네트워크 준비 뒤 시작하며, 프로세스가
종료되거나 작업 폴더 접근에 실패하면 15초마다 재시도한다. 관리자가 명시적으로
`systemctl stop`한 경우에는 재시작하지 않는다. DSM의 systemd 219에 맞춰
`StartLimitInterval=0`을 `[Service]`에 두고, 기존 .NET 호환 실행 옵션도 유지한다.
기존 설정 파일과 자격증명은 변경하지 않는다. 이전에 설치한 같은 drop-in이
달라졌으면 `.backup.날짜-시간` 파일로 보관한다.

적용 상태는 재부팅 없이 다음 명령으로 확인할 수 있다. 실제 재부팅 검증은
다음 계획된 재부팅 후 서비스 `active`, GitHub 러너 `Idle` 상태로 확인한다.

```sh
sh scripts/ops/install-tuti-production-runner.sh --check
```

설정 파일: `scripts/ops/systemd/tuti-production-runner-recovery.conf`.
호환성 근거는 [systemd 219 서비스 설정](https://github.com/systemd/systemd/blob/v219/man/systemd.service.xml)과
[마운트 의존성 설정](https://github.com/systemd/systemd/blob/v219/man/systemd.unit.xml)을 참고한다.

`tuti-prod-rollback`은 마지막 성공 배포 직전의 앱 이미지로 되돌린다. DB 스키마는
되돌리지 않으며 readiness 확인을 통과해야 성공한다. 롤백 가능한 이미지를 임의로
정리하지 말고 적어도 직전 두 버전은 유지한다.

## 전체 백업과 복구

`tuti-prod-backup`은 운영 PostgreSQL의 스키마와 전체 데이터를 custom dump로
저장하고, Garage 버킷의 객체를 S3 API로 읽어 각 객체의 SHA-256, 콘텐츠 유형,
캐시 정책과 함께 논리 백업한다. 기본 경로는
`/volume1/tuti/backups/full/{YYYYMMDD-HHMMSS}`이고 코드 기본값·운영 목표 보관기간은 30일이다.
실제 설치본·잔존 파일·정기 파기 일정 확인은 별도로 필요하다.
각 백업에는 전체 파일 체크섬과 Git 리비전이 포함된다. `.env`와 API 비밀키는
백업에 포함하지 않으므로 별도 암호관리 도구에 보관한다.
DB가 가리키는 객체와 실제 객체의 시점을 맞추기 위해 백업 중에는 운영 앱을 잠시
중지하고 완료 또는 실패 시 원래 상태로 다시 시작한다. 새벽 저사용 시간에 실행한다.

```sh
sudo -n /usr/local/sbin/tuti-prod-backup
```

### 2026-10-20 객체 백업 누락 발견 및 수정

`20261020-224729` 사본 검사에서 `objects.manifest.json` 누락을 확인했다.
기존 명령의 `pnpm ops:objects:backup -- /backup`에서 `--`가 스크립트의 첫 인자로
전달되는 동작을 설치된 pnpm 11.2.2로 재현했다. 객체 백업 스크립트는 첫 인자를
대상 경로로 사용하므로, 마운트된 `/backup` 대신 임시 컨테이너 안의 `/app/--`에
객체 목록과 파일을 기록할 수 있었다. 컨테이너 종료·삭제 뒤에는 호스트 사본에 남지 않는다.
이는 운영 DB·Garage 원본 삭제를 뜻하지 않지만, 해당 사본은 완전한 복구 자료가 아니다.
다른 과거 사본의 완전성도 개별 검사 없이 보장하지 않는다.

백업·복원은 `node_modules/.bin/tsx scripts/backup-object-storage.ts /backup` 및
`restore-object-storage.ts /backup`으로 직접 실행하도록 수정했다. 새 백업은 지정 경로에
객체 목록·객체 디렉터리가 없으면 완료로 확정하지 않는다. 설치된 root 도구는 자동으로
갱신되지 않으므로 커밋 후 재설치하고, 새 동일 시점 전체 백업을 생성해 오프라인 검사한다.

```sh
sudo sh scripts/ops/install-legal-compliance-tools --apply
sudo /usr/local/sbin/tuti-prod-backup
sudo sh scripts/ops/tuti-prod-backup-verify
```

백업 생성 중에는 앱을 잠시 중지하므로 운영 중단 시간을 고려한다. 기존 불완전 사본에
현재 객체 목록만 덧붙여 과거 동일 시점 백업인 것처럼 만들지 않는다. 이번 수정은 기존
사본을 삭제·수정하거나 운영 복원을 수행하지 않는다. 새 사본 검증 성공도 실제 복원 시험과는 다르다.

운영자가 수정 도구 설치 후 새로 생성한 `20261020-233213` 사본은 오프라인 검사를 통과했다.
파일 28개·객체 24개(3,011,665바이트)의 무결성과 PostgreSQL 덤프 헤더·목록 해독을 확인했다.
네트워크 접근·운영 DB/객체 변경·실제 복원은 수행하지 않았다. 실제 복원 시험은 별도다.

### 실제 운영 사본의 격리 복원 시험

2026-10-21 구현한 아래 명령은 운영 복원 명령과 다르다. 관리자 권한으로 로컬에서 실행하며,
운영 서비스를 정지하거나 운영 DB·Garage에 연결하지 않는다. 실제 실행 성공 출력 전에는
복원 시험 완료로 기록하지 않는다.

```sh
sudo sh scripts/ops/tuti-prod-backup-restore-test 20261020-233213
```

복원 시간 초과를 조사할 때는 아래 조회 모드를 먼저 사용한다. DB·Garage를 생성하지 않고
읽기 전용·네트워크 차단 컨테이너에서 압축 아카이브 바이트 크기와 TOC의 TABLE DATA·INDEX·
FK CONSTRAINT 항목 수만 집계한다. 식별자·내용은 출력하지 않는다. 압축 크기를 실제 복원 DB
크기나 예상 복원 시간과 동일하게 해석하지 않는다. 최대 240초 후 중단한다.

```sh
sudo sh scripts/ops/tuti-prod-backup-restore-test 20261020-233213 --profile
```

- 지정 사본의 무결성 검사를 먼저 통과해야 한다. 소스가 커밋되어 있고 수정되지 않은 경우만 실행한다.
- 캐시된 PostgreSQL 17·PostGIS, Garage 2.3.0, ops 이미지만 사용한다. 이미지 다운로드나 빌드는 하지 않는다.
- PostgreSQL·Garage는 각각 `--network none`으로 생성한다. 검사 프로세스만 격리 Garage의
  네트워크 네임스페이스를 공유하며, 고정 localhost로 접근한다. 호스트 포트·운영 네트워크·Docker 소켓을 연결하지 않는다.
- 운영 환경변수·푸시·메일·원장 키를 전달하지 않는다. 고정 시험 자격증명은 외부에서 접근 불가능한
  일회성 Garage에서만 사용한다. 실제 백업을 GitHub나 외부 서버로 올리지 않는다.
- 백업은 읽기 전용이다. DB만 root 전용 `/volume1/tuti/restore-tests/run.XXXXXXXX/data`에
  임시 복원하며, 운영 DB·백업 경로와 분리한다. 상위 시험 폴더는 root 소유 0700이어야 한다.
  객체 저장소·서버 로그·관측자료는 tmpfs에 만든다. 예상 밖의 이미지 볼륨 선언은 거절한다.
  시험 후 임시 DB 디렉터리를 삭제하지만 물리적 보안 삭제는 아니다. NAS 스냅샷·전체 볼륨
  백업 등이 임시 폴더를 별도로 복제할 가능성까지 이 도구가 통제하지 않는다.
- 사용 가능 메모리 4GiB 이상이 필요하다. DB 1536MiB·Garage 384MiB·검사 프로세스 384MiB로
  제한하며 CPU quota·PID 제한은 커널 지원 시 적용한다. 객체별 32MiB·전체 128MiB 이내 사본만 허용한다.
  디스크는 사전 여유 공간 64GiB가 필요하고, 시험 데이터가 32GiB를 넘거나 여유 공간이
  4GiB 미만이면 감시 작업이 자기 시험 DB만 종료한다. 2초 주기의 감시 임계값이지 강제 quota가
  아니며 순간 초과가 가능하다. DB 복원 시간 제한은 세 단계 합계 1800초, DB 공유메모리는 256MiB다.
  별도 잠금으로 동시 복원 시험을 거절한다.
- 실제 `pg_restore --exit-on-error` 후 마이그레이션·FK 상태·기록 참조를 검사한다.
  검증된 아카이브 파일을 DB 컨테이너에 읽기 전용으로 직접 연결한다.
  원본이 root 전용이어도 읽을 수 있도록 `pg_restore` 클라이언트만 `docker exec --user 0:0`으로
  실행한다. PostgreSQL 서버 OS 사용자는 postgres이며 DB 접속 역할도 postgres다.
  원본 백업의 권한을 풀거나 별도 복사하지 않고 컨테이너의 cap-drop ALL도 유지한다.
  실행 전 서버 사용자·root 클라이언트의 파일 읽기 가능 여부를 검사하고 불리언만 출력한다.
  복원 순서는 스키마(pre-data),
  데이터(data), 인덱스·제약조건(post-data)을 순서대로 모두 복원하며 테이블 제외는 하지 않는다.
  스키마는 작업 1개, 데이터·후처리는 최대 2개로 제한한다. 단계 실패 시 다음 단계로 넘어가지 않는다.
  shared_buffers 128MiB, maintenance_work_mem 128MiB, max_wal_size 1GiB로 시험 DB만 조정한다.
  fsync·제약 검사를 끄지 않는다. 병렬 복원은 regular file이 필요하다는
  [PostgreSQL 17 공식 문서](https://www.postgresql.org/docs/17/app-pgrestore.html)에 따라 stdin 대신 파일을 사용한다.
  각 단계 시작·완료·소요시간과 약 30초 간격의 DB 크기·COPY/인덱스 작업·Lock/IO 대기 집계를 출력한다.
  진행 SQL은 집계만 반환하며 행 내용·SQL 원문·사용자 ID·테이블명은 출력하지 않는다.
  COPY 바이트·인덱스 블록 수는 현재 작업의 수치라 작업이 바뀌면 줄어들 수 있고 전체 진행률은 아니다.
  모든 객체를 별도 Garage에 저장·재조회해 크기·SHA-256을 대조하고, DB가 가리키는 저장 이미지의
  해독과 PDF 페이지 수 일치를 확인한다. 외부 이미지 URL은 호출하지 않으며 별도 개수로 표시한다.
- Docker 로그를 비활성화하고 DB 복원 오류·관측자료는 root 전용 tmpfs 안에서만 처리한다.
  채팅·일반 로그에는 본문·파일 키·계정 식별자 대신 집계와 고정 실패 단계만 출력한다.
- 성공·실패 모두 고유 이름과 소유 라벨을 확인한 시험 컨테이너·볼륨 및 시험 임시 자료만 정리한다.
  종료 코드가 0이고 `sandboxResourcesRemoved=true`인 결과까지 확인해야 완료다.
- 운영 로그인·웹 화면·실제 서비스 재개 시험은 아니다. 실사용 삭제·철회 원장을 시험 환경에
  복사하거나 재반영하지 않으므로, 복원 후 운영 재개에 필요한 원장 절차를 대체하지 않는다.

최초 실제 실행은 무결성 검사 후 `isolated-postgres-restore`에서 실패했고 시험 자원 정리는
성공했다. 당시 상세 오류는 출력·보존하지 않았으므로 실패 원인은 아직 확정하지 않았다.
후속 수정은 PostgreSQL 이미지의 임시 초기화 서버가 아니라 최종 PID 1 서버의 기동까지
기다린 뒤 `template0`으로 별도 빈 DB를 생성한다. 자동 PostGIS 초기화 대상 DB에 덮어쓰지 않는다.
복원 실패 시에는 중복 객체·공간/메모리 부족·연결 중단·권한·확장·형식·설정·시간 초과 등
고정 분류와 종료 코드만 출력한다. 분류를 위해 읽은 오류 원문은 시험 tmpfs와 함께 정리한다.

두 번째 실행도 무결성 검사는 통과했으나 `DATABASE_CONNECTION_INTERRUPTED`로 실패했다.
이 분류는 연결 자체의 실패와 서버 종료를 구분하지 못하므로 근본 원인을 확정하지 않았다.
후속 도구는 고정 Unix 소켓·포트를 사용하고, 실패 시 시험 컨테이너의 실행 상태·OOM 여부·
종료 코드를 출력한다. 격리 PostgreSQL 서버 로그도 전용 tmpfs에 제한적으로 수집하여
메모리·공간·인증·DB 부재·소켓 오류를 구분한다. 서버 로그를 채팅이나 Docker 로그로 내보내지
않으며, 조사가 끝난 뒤 시험 자원과 함께 정리한다. PostgreSQL의 로그 바인드 마운트 대상은
새로 만든 시험용 `/dev/shm/.../pglogs`이며 운영 경로에 쓰지 않는다.

후속 실행에서 `running=true`, `oomKilled=false`와 `SANDBOX_SPACE_EXHAUSTED`를 확인했다.
백업 손상이 아니라 시험 환경의 공간 부족이 관측됐으나 당시 분류는 DB 데이터 영역과
공유메모리 부족을 구분하지 않았다. 시험 데이터 영역을 512MiB에서 2GiB로, 공유메모리를
256MiB로 조정하고 DB 메모리 상한 3GiB·사전 여유 메모리 6GiB·동시 시험 잠금을 적용했다.
다시 실패하면 두 영역의 사용·잔여 용량을 숫자로만 표시하고 공유메모리 오류를 별도로 분류한다.
한도 조정만으로 실제 복원 성공을 확정하지 않으며 운영 DB·스토리지 설정은 변경하지 않았다.

그다음 실행에서 DB 영역 2,097,152KiB 중 2,096,888KiB 사용, 잔여 264KiB를 확인했다.
공유메모리는 262,144KiB 중 1,036KiB 사용으로 충분했다. RAM 기반 DB 영역의 부족으로 좁혀져
메모리 한도를 더 늘리지 않고 위의 NAS 로컬 임시 DB 방식으로 변경했다. 시험 자원의
성공·실패 정리와 원문 비노출은 대역 테스트했으며 실제 사본의 복원 성공은 재실행 결과로 확인한다.

로컬 임시 DB 방식의 다음 실행은 컨테이너 실행 중·OOM 없음·충분한 디스크/공유메모리 상태에서
600초 제한에 도달했다. 당시 출력의 storageIndex 1은 NAS 파일시스템 전체 용량이며 개별 시험
DB 사용량이 아니다. 실제 진행량·병목을 측정하지 않은 상태에서 정상 진행이나 교착으로 단정하지
않는다. 구조 조회 모드를 추가했고 실제 복원 성공은 계속 미확인으로 유지한다.

구조 조회 결과 압축 아카이브 314,224,688바이트, TABLE DATA 57개·INDEX 153개·FK 31개를 확인했다.
운영자가 별도 제공한 현재 테이블 용량은 상위 12개 합계 약 3.4GiB이며 관광 원천·시계열 자료가
대부분이다. 이 현재 용량을 과거 백업 시점의 정확한 용량이나 행 수와 같다고 취급하지 않는다.

2026-10-21 작업 순서는 **전체 복원 시험 성공 확인 → 사용자 핵심 백업 범위·의존 관계 정의 →
핵심 백업 생성·복원 시험**으로 확정했다. 전체 DB의 세 단계·24개 객체 복원/재조회·내용 검사·
정리 성공을 확인하기 전에는 핵심 백업으로 범위를 줄여 전체 복구 성공을 대신하지 않는다.

단계별 복원 첫 실행은 pre-data에서 `DATABASE_PERMISSION_ERROR`로 실패했고 시험 자원은
정상 정리됐다. stdin에서 아카이브 직접 연결로 바꾸면서 원본 파일의 읽기 권한 검사가
누락됐음을 확인했다. root 클라이언트 실행과 읽기 사전 검사를 추가했으며 실제 원인의
확정과 전체 복원 성공 여부는 이후 실행 결과로 확인한다.

**2026-10-21 최종 전체 복원 성공:** 운영자 로그에서 `20261020-233213`의 pre-data 6초,
data 161초, post-data 436초, DB 합계 603초를 확인했다. 관측된 주요 소요 구간은 인덱스·제약조건
생성(약 72%)이었다. 이전 제한 설정과 전체 완료 시간을 비교한 개선율은 측정하지 않았으므로 제시하지 않는다.
계정 207개·기록 24개·마이그레이션 75개, 객체 24개 재조회·이미지 21개 해독을 확인했고
`sandboxResourcesRemoved=true`로 정리 완료를 확인했다. 사본의 하루마디는 0개이므로 실제 PDF의
복원·해독 성공으로 확대하지 않는다. 운영 DB·스토리지 변경이나 삭제 원장 재반영은 수행하지 않았다.
이 결과로 전체 복원 선행 조건을 충족했으며, 다음은 사용자 핵심 백업의 의존 관계와 복원 시험이다.

### 사용자 핵심 백업: 범위·의존 관계 조회

전체 복원 성공 확인 뒤 추가한 다음 명령은 **조회만 수행**한다. 운영 DB의 읽기 전용
트랜잭션에서 카탈로그·용량·외래키만 확인하며 백업 생성·복원·서비스 중지·정기 작업 변경은 하지 않는다.

```sh
sudo sh scripts/ops/tuti-core-backup-plan
```

초기 후보는 전체 스키마를 유지하고, `core-backup-excluded-data-tables.txt`의 명시된
재수집 가능한 관광 원천·시계열·혼잡도·동기화 진행 자료 12개 테이블의 데이터만 제외한다.
그 밖의 현재·신규 테이블은 기본 보존한다. 계정·인증·기록·하루마디·찜/개인화·동의/철회·권리·
보안 이력뿐 아니라 장소·관광 장소 상세·LLM/수동 편집 정보·체류시간 프로필도 남기는 안이다.
제외 후보의 스키마를 삭제하거나 운영 데이터를 파기하는 계획은 아니다.

`dependencyBlockers`에 보존 테이블 → 제외 부모 FK가 나오면 제외 범위를 수정해야 한다.
`missingPolicyTables`도 확인한 뒤 범위를 고정한다. 출력 용량은 현재 디스크 사용량이지 예상 압축
백업 크기나 복원 시간을 보장하지 않는다. 조회 결과 전에는 실제 핵심 백업 생성·복원 완료로 기록하지 않는다.

핵심 백업은 전체 백업과 별도 경로·명시적인 범위 표식을 사용해야 하며, 전용 복원 시험에서
제외 테이블의 빈 상태·보존 데이터/객체 정합성을 확인해야 한다. 기존 전체 백업과 30일
보관·삭제/철회 원장 재반영 절차는 임의로 바꾸지 않는다. 실제 사본에 PDF가 없으면,
운영 계정에 시험 자료를 넣지 않고 별도 격리 합성 PDF 시험으로 부족한 범위를 구분해 검증한다.

2026-10-21 운영자 범위 조회에서 보존 75개 테이블 244,334,592바이트, 제외 후보 12개 테이블
3,221,913,600바이트를 확인했다. `dependencyBlockers=[]`, `missingPolicyTables=[]`였다.
이는 조회 시점의 원천 디스크 사용량이며 실제 압축 백업 크기·복원 시간은 아직 측정 전이다.

### 핵심 데이터 덤프 생성·복원의 격리 시험

```sh
sudo sh scripts/ops/tuti-prod-backup-restore-test 20261020-233213 --core-test
```

이 모드는 **운영 DB에서 신규 백업을 생성하지 않는다.** 위에서 성공한 전체 사본을 먼저 격리
DB에 준비한 뒤, 그 DB에서 12개 테이블의 데이터만 제외한 custom 덤프를 생성하고 다른 빈 DB에
복원한다. 따라서 최초 전체 DB 준비에 앞서 관측된 약 10분이 다시 필요할 수 있다.
핵심 덤프 생성 시간·바이트 크기, 핵심 DB 복원 각 단계 시간은 별도 출력한다.

- 스키마·계정·기록·동의·권리·장소·수동/LLM 편집 정보와 새 테이블은 유지한다.
  제외 테이블도 스키마·인덱스·FK는 남기며 데이터가 0건인지 검사한다.
- 원본 격리 DB와 핵심 복원 DB의 보존 테이블 전체에 대해 정확한 행 수와 정렬된 행 내용의
  MD5 지문을 비교한다. 이는 복원 대조용 지문이지 암호학적 서명이나 원장을 대체하지 않는다.
  지문·계정 식별자·본문은 출력하지 않고 root 전용 관측자료로만 보관했다가 정리한다.
- 시험 전후 모두 실제 FK 의존성과 정책 테이블의 존재를 재확인한다. 초기화용 보조 테이블·
  함수는 세션 한정 임시 객체라 핵심 덤프에 포함하지 않는다.
- 핵심 DB가 가리키는 사진·PDF와 원본 객체 24개(사본 기준)를 별도 Garage에 저장·재조회한다.
  실제 PDF가 없는 사본의 한계를 보완하기 위해 **합성 2페이지 PDF**를 격리 Garage에 저장·재조회해
  SHA-256과 PDF 해독을 검증한다. 이는 실제 이용자의 하루마디가나 DB-하루마디 연결 검증이 아니다.
- 시험용 핵심 덤프도 sandbox 작업 디렉터리 안에서만 만들며 성공·실패 정리 때 삭제한다.
  운영 백업 경로·전체 백업 일정·보관 정책·삭제/철회 원장은 변경하지 않는다.
- 이 시험 통과는 해당 사본에서 핵심 추출·복원 정책이 동작함을 뜻한다. 운영 핵심 백업의
  자동 생성·별도 보관·30일 파기·운영 복구 적용은 별도 구현·배포·승인이 필요하다.

개발 검증에서는 관련 단위·대역 테스트 23개와 PostgreSQL 11.11의 별도 합성 DB에서
실제 pg_dump/pg_restore·스냅샷 SQL 대조 시험 1개를 통과했다. 보존 행의 내용 변경·누락,
제외 부모를 참조하는 신규 FK는 거절했다. 이 결과를 NAS PostgreSQL 17의 실제 사용자
사본 시험 성공으로 간주하지 않는다. 해당 실행 결과는 다음과 같이 별도로 확인했다.

**2026-10-21 실제 핵심 추출·복원 성공:** `20261020-233213 --core-test` 운영자 로그에서
전체 DB 준비 678초 뒤 핵심 덤프 20,587,823바이트·생성 6초, 핵심 DB 복원 39초
(pre-data 8초·data 4초·post-data 27초)를 확인했다. 추출·대조를 포함한 핵심 단계는 81초였다.
전체 덤프 314,224,688바이트 대비 약 93% 작고, 같은 실행의 전체 DB 복원 대비 약 94% 짧았다.
이는 이 사본·실행 환경의 측정값이며 향후 동일 속도를 보장하지 않는다.
보존 75개 테이블·110,675개 행의 수·내용 지문이 일치했고 제외 12개 테이블은 빈 상태였다.
계정 207개·기록 24개·객체 24개 재조회·이미지 21개 해독, 합성 PDF 2페이지의 SHA-256·해독을
확인했다. 실제 하루마디는 0개로 실제 PDF/하루마디 DB 연결 검증은 아니다. 운영 데이터 변경 없이
`sandboxResourcesRemoved=true`를 확인했다.

### 실제 핵심 백업의 생성·예약 적용

검증한 12개 테이블 제외 정책을 `tuti-prod-backup --core`에 적용했다. 전체 스키마와 나머지
데이터·객체를 보존하며, 매번 읽기 전용 정책/외래키 검사를 통과해야 덤프를 만든다.
핵심 백업은 `/volume1/tuti/backups/core/{YYYYMMDD-HHMMSS}`에 별도로 저장하고,
manifest의 `database=production-core-custom-dump`, `backup_scope=core`와 해시 보호된
`excluded-data-tables.txt`로 전체 사본과 구별한다. 기존 전체 백업 경로·예약은 유지한다.
두 방식 모두 앱 쓰기를 잠시 멈춰 DB·객체를 함께 저장하고 종료 시 기존 이미지로 재시작한다.

관리자 권한이 필요한 실제 설치·첫 사본 생성·검증·일일 예약 활성화:

```sh
sudo sh scripts/ops/install-core-backup --apply
```

설치본은 이전 도구를 root 전용 `.ops-state/core-tools`에 보관한다. 기존 30일 정리 타이머의
활성·부팅 예약 상태를 요구하고, 새 스크립트는 커밋·무변경 여부를 검사한다. 현재 ops 이미지에
검증/정리 스크립트와 해당 모듈만 읽기 전용 마운트하므로 앱 재빌드·배포는 필요하지 않다.
첫 핵심 사본 생성·파일 해시·객체 목록·PG17 덤프 목록 검증 후에만 매일 **04:20 한국시간**
일일 타이머를 활성화한다(NAS +0900 확인). 실패는 기존 Slack 예약 작업 실패 알림으로 연결한다.
설치 명령의 실제 성공 출력 전에는 운영 활성화가 완료됐다고 기록하지 않는다.

2026-10-21 첫 설치 후 서비스는 Git 검사에서 종료 코드 128로 중단됐고 타이머는
disabled였다. `/var/services` 별칭을 신뢰 경로로 지정하면 `SUDO_UID`가 없는 systemd의
root 실행에서 실제 `/volume1` 경로와 달라 `dubious ownership`이 발생하는 것을 재현했다.
핵심 백업·정리·검증·시험·설치 도구는 `pwd -P`로 실제 경로를 구한 뒤 그 경로 하나만
Git 신뢰 대상으로 사용하도록 수정했다. 전역 예외나 모든 저장소 신뢰 설정은 추가하지 않는다.
수정 후 설치 명령 재실행과 실제 성공 결과 확인이 필요하다.

이어 생성한 핵심 사본 `20261021-150410`은 파일 29개·객체 24개(3,011,665바이트)의
무결성·PG17 목록 해독에 성공했다. 이후 대화형 터미널의 `timeout docker compose exec`
readiness 검사 자식이 T(정지) 상태로 남아 활성화가 대기한 것을 확인했다. 운영 앱·DB·Garage와
내부·공개 readiness는 별도 조회에서 정상이며, 예약은 아직 disabled였다.
설치기의 readiness 검사는 Docker exec 대신 로컬 공개 포트의 `/api/health`를 curl 자체의
연결·전체 시간 제한으로 조회하도록 변경했다. 앱 중지·백업 재생성 없이 이미 생성한 사본을
재검증하고 예약만 활성화하려면, 이전 설치 프로세스를 Ctrl+C로 중단한 뒤 다음을 실행한다.

```sh
sudo sh scripts/ops/install-core-backup --resume-verified 20261021-150410
```

이 명령 역시 파일·객체·덤프 목록을 재검증하고 앱 readiness 통과 후에만 타이머를 켠다.
정지된 이전 Docker 클라이언트는 실제 백업/복원 작업이 아니라 조회 클라이언트였으며,
잔존 프로세스 정리는 PID·명령·시작 시각을 확인하고 그 클라이언트에만 한정해야 한다.

보관기간 파기는 기존 정리 타이머에서 전체·핵심 두 경로를 모두 30일 기준으로 계획·검증한 뒤
수행한다. 한 경로라도 불명확한 사본·부분 디렉터리가 있거나 파기가 실패하면 삭제 원장을
먼저 정리하지 않는다. 백업 생성 중 mtime 기반 개별 삭제는 제거해 이 경로로 일원화했다.
기존 전체 사본이나 과거 불완전한 사본을 이번 작업에서 임의 삭제하지 않는다.

```sh
sudo /usr/local/sbin/tuti-prod-backup --core
sudo sh scripts/ops/tuti-prod-backup-verify --core
sudo sh scripts/ops/tuti-prod-backup-restore-test 실제핵심백업ID --from-core
sudo /usr/local/sbin/tuti-prod-backup-prune
sudo systemctl status tuti-core-backup.timer
```

`--from-core`는 **실제 생성된 핵심 사본**을 별도 빈 DB·Garage로 복원하는 시험이다.
기존 `--core-test`(전체 사본에서 임시 핵심 사본 추출)와 구분한다. 운영 핵심 사본의 격리
복원은 설치 이후 사본 ID로 별도 실행·결과 확인한다.

**2026-10-21 운영 활성화·최종 핵심 사본 복원 성공:** 운영자의 재개 실행에서
`핵심 일일 백업 활성화 완료`를 확인했고 직접 조회에서도 핵심 타이머 active/enabled,
다음 실행 2026-10-22 04:20 KST와 기존 정리 타이머 active를 확인했다. 이는 예약 설정
확인이며 첫 일일 자동 실행 성공을 의미하지 않는다.
`20261021-150410 --from-core`는 파일 29개 무결성·PG17 목록 검사를 통과한 뒤
pre-data 6초·data 7초·post-data 31초, DB 합계 **44초**에 복원됐다.
계정 208개·기록 24개·마이그레이션 75개, 객체 24개(3,011,665바이트) 재조회·이미지
21개 해독과 `sandboxResourcesRemoved=true`를 확인했다. 운영 DB·스토리지 변경이나
운영 복원은 하지 않았고 시험 후 앱·DB·스토리지 readiness는 정상이었다.
사본의 하루마디는 0개로 실제 PDF 해독·DB 하루마디 연결은 검증하지 않았다.
이 실행은 실제 사본의 복원·객체 정합성 확인이며, 앞선 `--core-test`의 75개 테이블·
110,675개 행 대조를 새 사본에 다시 수행했다는 뜻은 아니다. 운영 로그인·서비스 재개·
삭제/철회 원장 재반영·재해 시 키 복구 시험은 별도 범위로 남긴다.

실제 재난 복구에서만 아래 명령을 사용한다. **운영 데이터를 교체하므로 시험용 명령이 아니다.**
핵심 사본에는 재수집 관광 통계가 없으므로, 서비스 재개 전 재수집/빈 캐시 동작도 확인해야 한다.

```sh
sudo /usr/local/sbin/tuti-prod-restore --core 실제핵심백업ID --confirm-core-production-restore
sudo /usr/local/sbin/tuti-prod-restore --core --resume-reviewed 실제핵심백업ID 확인근거번호
```

종류가 다른 사본/확인 대기를 거절하며, 전체 복구와 동일하게 앱을 멈춘 채 삭제·철회 원장
재반영·과거 푸시 등록 초기화·스키마 호환성 확인을 거쳐야 재개한다. 정상 운영 DB에는
시험 목적으로 복원하지 않는다. 설치 되돌림은 핵심 타이머만 중지·해제 후 이전 설치본과
보관 사본·원장 범위를 검토한다. 핵심 사본을 남긴 상태에서 전체 전용 정리기로 되돌려
원장만 파기하면 안 된다. 이 작업은 새 약관 공고·시행 플래그를 변경하지 않는다.

동일 NAS의 백업은 디스크·화재·랜섬웨어 장애를 함께 겪을 수 있다. Synology Hyper
Backup으로 `/volume1/tuti/backups/full`을 외장 장치나 원격 저장소에 한 번 더
복제한다. 기존 관광·혼잡도 정기 작업보다 앞선 매일 오전 00:20 전체 백업,
보관 30일을 권장한다.

복구는 운영 앱을 중지하고 PostgreSQL 객체를 교체한 뒤 백업에 포함된 Garage
객체를 검증·덮어쓴다. 백업에 없던 Garage 객체는 자동 삭제하지 않는다. 운영
데이터를 바꾸는 작업이므로 백업 ID와 확인 인자가 모두 필요하다. 성공·실패 모두
자동으로 앱을 재시작하지 않으며, 파일 복원이 끝나도 개인정보 확인 대기로 남는다.

```sh
sudo -n /usr/local/sbin/tuti-prod-restore \
  20260815-022000 \
  --confirm-production-restore
```

확인 대기는 `.ops-state/restore-privacy/pending.env`로 관리한다. 삭제·철회 이행
근거를 확보해 복원된 DB와 이미지·PDF에 재반영하고, 스키마 호환성·서비스
정합성을 확인한 후에만 다음 명령으로 재개한다. `REVIEW-123`은 예시이며 실제
확인 기록 번호를 입력한다. 별도 복원 방지 원장이 활성화된 새 설치본은 재개 전에
완료된 삭제·철회·공개 중지 요청과 해당 이미지·PDF를 자동 재반영한다. 미수집 과거
구간과 완료 여부를 확인하지 못한 요청은 자동 승인하지 않는다.

```sh
sudo -n /usr/local/sbin/tuti-prod-restore \
  --resume-reviewed 20260815-022000 REVIEW-123
```

확인 근거·시각·선택된 이미지가 root 전용 디렉터리에 남는다. 복원 미완료 건은
재개할 수 없고, 재개 readiness 점검 실패 시 다시 앱을 멈추며 확인 대기를 유지한다.
실패한 복원은 같은 백업으로 재시도할 수 있다.

앱 코드 롤백과 DB 복원은 별개다. 확인 대기가 없는 일반 롤백은 기존대로 즉시
시작한다. 확인 대기가 있으면 배포·롤백은 선택한 앱 컨테이너를 `create`로 준비하되
시작하지 않고 재시작 정책도 `no`로 둔다. 배포는 이 상태에서 DB 마이그레이션도 하지 않는다. 준비 명령의
성공은 서비스 재개 완료를 뜻하지 않는다. 재개 명령은 실제 준비된 컨테이너의
이미지를 사용하고 성공 시 배포 이력도 해당 이미지로 갱신한다.

확인 대기 중 새 전체 백업은 만들지 않으며, 상태 점검은
`restore_privacy_review_required`로 표시한다. 직접 `docker compose up`을 실행하면
이 운영 스크립트의 확인 절차를 우회하므로 금지한다. 이 안전장치는 저장소 코드
기준이며, 운영 서버의 설치본을 갱신해야 실제 적용된다.

원장 초기화·구버전 백업 예외·30일 기준의 백업 및 완료 원장 파기·공유 버킷 주의사항은
[삭제·철회 복원 방지 운영](./legal/privacy-replay-operations.md)을 따른다. 기존 성공 후
`-mtime +30` 정리만으로 정확한 기간의 정기 파기가 구현된 것으로 간주하지 않는다.

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
헬스체크는 검사하는 동안 공유 잠금을, 백업·배포·복구·롤백은 상태를 변경하는 동안
배타 잠금을 유지한다. 두 작업이 같은 시각에 시작되어도 먼저 시작한 헬스체크가
끝난 뒤 유지보수 작업이 진행되거나, 진행 중인 유지보수 작업을 헬스체크가 정상적으로
건너뛰므로 컨테이너 중지와 `docker exec`가 경합하지 않는다.

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

### 트래픽 보안 식별과 수동 차단

개인정보 처리방침 2026-10-10 개정안의 시행 시각인 **2026년 10월 10일
00:00(KST)** 전에는 안정적인 요청 주체 식별정보를 만들거나 차단 규칙을 집행하지
않는다. 이 날짜는 애플리케이션 코드에도 하한으로 고정되어 있어
`TRAFFIC_SECURITY_ENABLED=true`를 미리 배포해도 조기 활성화되지 않는다.

시행일 이후에는 IP와 정규화된 User-Agent를 서버에서 즉시 HMAC 처리해 주소 키,
클라이언트 키와 두 값을 결합한 요청 주체 키를 만든다. DB에는 원본 IP와 전체
User-Agent를 남기지 않고 마스킹한 네트워크 대역과 브라우저·운영체제·자동화 도구
요약만 저장한다. 관측 기록은 90일 뒤 기존 인증자료 파기 작업에서 함께 삭제된다.

관리자는 **관리자 → 트래픽·보안 → 확인할 요청 주체**에서 탐지 근거와 접근 경로를
확인하고 다음 두 범위 중 하나를 수동으로 차단할 수 있다.

- 주소·클라이언트 조합: 기본값. 같은 공인 IP를 공유하는 정상 사용자의 오탐을 줄인다.
- IP 주소 전체: 같은 공유기나 통신사 주소 이용자도 함께 제한될 수 있으므로 확인 후 사용한다.

차단 기간은 1시간, 24시간, 7일 또는 직접 해제할 때까지이며 사유 입력이 필수다.
차단·해제는 `system_logs`에 감사 기록으로 남는다. 해제·만료된 차단 규칙은 90일 뒤
삭제한다. 자동 차단은 오탐 기준이 검증되기 전까지 구현하지 않는다.

운영 환경에서는 최소 32자의 별도 난수를 `TRAFFIC_SECURITY_HMAC_SECRET`에
설정한다. 값이 없으면 기존 `LOCATION_AUDIT_HMAC_SECRET`을 도메인 분리해
사용하지만 두 키를 분리하는 것이 권장된다. 시행일 이후 긴급하게 기능 전체를
중단해야 하면 `TRAFFIC_SECURITY_ENABLED=false`로 배포한다. 기존 식별 연속성이
끊어지므로 HMAC 비밀값은 유출 대응 외에는 교체하지 않는다.

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

공모전 기능설명서에 기재할 관광 공공데이터 건수와 최근 30일 OpenAPI 동기화
이력은 다음 읽기 전용 명령으로 개발·운영 DB에서 함께 확인한다. 데이터별 집계
기준과 활용표는 `docs/contest-2026-submission-readiness.md`를 따른다.

```sh
sudo -n /usr/local/sbin/tuti-contest-data-report
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

기록 웹 공개 기능의 상태·신고·검토 지연과 감사 이벤트는 아래 명령으로 개발·운영
DB를 함께 점검한다. 처리 완료 후 3년이 지난 신고와 공개 운영 감사 로그는 전용
파기 명령으로 매월 정리한다. 자세한 판단 기준과 DSM 일정은
`docs/journal-publication-operations.md`를 따른다.

```sh
/usr/local/sbin/tuti-journal-publication-audit
/usr/local/sbin/tuti-journal-moderation-purge
```

설치 명령은 저장소 안의 스크립트를 `/usr/local/sbin`에 root 소유 파일로 복사한 뒤, 위 고정 경로만 sudoers에 허용한다. 저장소 파일을 수정해도 이미 설치된 root 스크립트는 자동으로 변경되지 않으므로, 운영 명령의 변경 후에는 설치 명령을 다시 실행해야 한다.
