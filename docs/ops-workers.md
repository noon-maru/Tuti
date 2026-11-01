# NAS 예약 작업의 반복 컨테이너 종료 알림 방지

분 단위 권리 점검과 개인정보 정리 등은 일회성 `compose run --rm ops` 대신
상시 컨테이너의 `docker exec`로 실행한다. 정상 작업이 끝나도 컨테이너 자체는
종료하지 않으므로 해당 반복 종료 이벤트가 발생하지 않는다. DSM 전체 알림 설정은 바꾸지 않는다.

## 전환 대상

| 기존 예약 작업 | 상시 컨테이너 | 기존 주기 |
| --- | --- | --- |
| 권리 침해 기한 점검 | `tuti-ops-maintenance` | 종료 후 1분 |
| 개인정보 정리 | `tuti-ops-maintenance` | 종료 후 5분 |
| 삭제 원장 복구 사본 | `tuti-ops-recovery` | 종료 후 5분 |
| 백업 30일 보관 정리 | `tuti-ops-retention` | 종료 후 1시간 |

타이머·실패 종료코드·systemd OnFailure·Slack 실패 알림을 유지한다. 컨테이너 자체의
충돌과 웹·DB의 중지 알림도 유지한다. DSM의 관광 데이터 작업과 수동 배포·복구 등은
이번 전환 대상이 아니며, 해당 일회성 실행에서는 종료 알림이 발생할 수 있다.

## 설치

현재 설치된 `tuti:ops` 이미지와 호스트의 검토된 실행 파일을 사용한다. NAS에서 이미지를
새로 빌드하지 않는다. jq와 Docker Compose가 필요하다. 조회·문법 검사는 다음과 같다.

```sh
sh scripts/ops/install-tuti-ops-workers
```

실제 설치는 기존 작업이 끝나 유지보수 배타 잠금을 획득할 때까지 기다린다. 작업 컨테이너
3개를 준비·확인한 뒤에만 root 소유 예약 작업 래퍼를 바꾼다. 웹·DB를 재시작하거나 약관·
개인정보 플래그를 변경하지 않는다. 기존 도구는 `.ops-state/ops-worker-tools`에 보관한다.

```sh
sudo sh scripts/ops/install-tuti-ops-workers --apply
sudo /usr/local/sbin/tuti-ops-workers --check
```

설치 후 기존 예약 실행이 적어도 한 주기 성공하는지 확인한다. 아래 세 명령은 조회·검증이며
파기 옵션 `--apply`를 붙이지 않는다.

```sh
sudo /usr/local/sbin/tuti-journal-rights-maintain
sudo /usr/local/sbin/tuti-privacy-data-maintain
sudo /usr/local/sbin/tuti-privacy-ledger-backup
```

새 설치 환경은 이 작업 컨테이너 전환을 먼저 수행한 뒤 기존 법적 운영 도구 설치와 원장
활성화를 이어간다. 원장 활성화에서 환경값이 바뀌면 작업 컨테이너도 갱신한다. 기존
systemd에는 `--now` 옵션이 없으므로 타이머 관리 시 enable과 start를 따로 사용한다.

## 실행과 안전장치

- 일반 정리 작업에는 원장만, 복구 사본 작업에는 복구 폴더를, 보관기간 정리에는 전체·핵심
  백업 경로를 추가 연결한다. Docker 소켓·호스트 루트·포트를 노출하지 않는다.
- 기존 ops의 root 실행 권한은 유지한다. 읽기 전용 루트 파일시스템, 64MB 임시 파일시스템,
  768MB 메모리 상한을 사용한다. 작업마다 별도 자식 프로세스를 실행하고 종료한다.
- 실행 파일·환경 파일·이미지의 지문을 확인한다. 변경됐다면 오래된 환경으로 계속 처리하거나
  일회성 컨테이너로 우회하지 않고 실패한다. 복원·원장 전환 확인 대기 중에도 실행하지 않는다.
- 기존 유지보수·작업별 잠금을 유지한다. 자식 작업은 별도 프로세스 그룹이며 240초 후 중단,
  추가 10초 후 강제 종료한다. systemd의 300초 제한보다 먼저 끝나도록 한다. TERM/INT/HUP
  취소 시 해당 실행 ID와 PID를 확인하고 자식 그룹을 정리한다. 늦게 시작한 실행도 취소 표식을 확인한다.
- 설치 후 배포 도구는 ops 이미지 교체와 함께 작업 컨테이너도 갱신한다. 아래 계획 중지
  도구를 설치하면 설정·이미지가 바뀐 worker만 DSM stop API로 중지한 뒤 교체한다.

환경 파일을 수동 수정한 경우에는 다음 명령으로 작업 컨테이너도 갱신해야 한다.

```sh
sudo /usr/local/sbin/tuti-ops-workers --refresh
```

운영 Docker 접근은 관리자 권한이 필요하다. 로컬 대역 시험과 Compose 해석 검증을 실제
NAS 적용·예약 성공·이메일 수신 중단 확인으로 대체하지 않는다.

## 백업·배포의 계획된 중지 (2026-11-01)

최근 60건의 DSM 발송 로그 중 13건이 전체·핵심 백업 시각인 00:20·04:20과 겹쳤다.
다른 여러 건은 운영 배포 시간대와 겹쳤으나, 발송 로그에는 컨테이너 이름·종료 코드가
없으므로 모두 정상 종료였다고 단정하지 않는다. `desktop,sa_mail`은 발송 채널이며
같은 사건이 30번 재전송됐다는 증거가 아니다.

`tuti-planned-container-stop`은 설치된 `SYNO.Docker.Container` v1의 `stop` API와
호스트 `synowebapi`를 사용한다. 계정 비밀번호·세션을 추가 저장하지 않으며 DSM 알림
설정이나 Container Manager 내부 config 파일은 수정하지 않는다.

- 대상은 `tuti-prod`와 상시 worker 3개로 제한한다. root와 유지보수 배타 잠금을 요구한다.
- API 성공 응답뿐 아니라 실제 중지 상태·종료 코드(0 또는 SIGTERM 143)·OOM 여부를 확인한다.
  실패하면 원래 Docker stop/kill로 우회하지 않고 상위 백업·배포의 실패로 전달한다.
- 백업은 기존처럼 앱 쓰기를 중지하고 잔존 객체 정리·DB 덤프·객체 사본을 만든 뒤 앱을 재개한다.
  동시점 일관성·개인정보 원장·기존 실패 알림을 완화하지 않는다.
- 배포의 새 앱 교체·스키마 전환·실패 후 롤백과 수동 롤백에도 같은 경로를 사용한다.
  worker는 설정·이미지가 바뀔 때만 계획 중지하며, 동일 설정 refresh는 중지하지 않는다.

운영 API의 읽기 전용 왕복 검증은 다음과 같다. 응답 원문·환경변수는 출력하지 않는다.

```sh
sudo sh scripts/ops/tuti-planned-container-stop --check
sh scripts/ops/install-planned-container-stop
```

관련 변경을 커밋한 다음, 설치만 수행한다. 기존 도구는 root 전용 디렉터리에 보관하며
이 명령 자체로 컨테이너를 중지하거나 예약을 실행하지 않는다.

```sh
sudo sh scripts/ops/install-planned-container-stop --apply
```

로컬 대역 테스트는 운영 API의 알림 억제를 입증하지 않는다. 첫 실제 백업·배포 후 성공
로그, 앱 readiness, `/var/log/sysnotify.log`의 해당 시각 종료 알림을 대조해야 한다.
일회성 관광 데이터·수동 작업 컨테이너 및 별도 복구 도구는 아직 이번 변경 대상이 아니므로
모든 종료 알림이 제거됐다고 보고하지 않는다. DSM 전역 알림은 계속 유지한다.
