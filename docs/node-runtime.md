# Node.js 실행 버전과 Node2Shell 대응

## 프로젝트 기준 (2026-10-28)

- 버전: **26.12.1**, pnpm **11.2.2**. `.node-version`을 CI·개발 도구의 기준으로 사용한다.
- 공식 일정상 2026-10-28이 26 계열 LTS 전환 예정일이나, 확인 시점 배포 목록의 26.12.1은 아직 `lts: false`다. LTS 명칭과 보안 패치 여부를 혼동하지 않는다.
- CVE-2026-111497(Node2Shell) 패치는 26.12.1에 포함됐다. 내장 Brotli 버전 문자열은 패치 후에도 1.2.0일 수 있으므로 문자열만 보고 미패치로 판단하지 않는다.
- Docker의 base·runner·Android Node 복사 원본을 같은 버전으로 고정했다. Android 최종 Ubuntu 이미지에는 Node 26에 필요한 `libatomic1`도 설치한다.
- package engines와 pnpm `engineStrict`로 다른 메이저·보안 기준 미달 버전의 설치를 막는다. `pnpm runtime:check`는 Node 26.12.1 이상 26.x 정식 버전만 허용한다.
- 웹·Android·iOS·법적 절차/복원 시험 CI는 `.node-version`을 읽고 설치 전 버전을 검사한다. 웹 Docker 빌드는 `pull: true`, 로컬 운영 이미지 빌드도 `--pull`로 실행한다.
- builder·runner와 운영 배포 도구는 실제 실행 버전을 검사한다. 배포 도구 검사는 네트워크·운영 비밀정보 없이 후보 앱·작업 이미지에서 실행한다.

## NAS 로컬 도구

현재 계정의 별도 디렉터리에 공식 Node 26.12.1 Linux x64 배포 파일을 설치하고 공식 SHASUMS256과 비교했다. NAS에 없는 `libatomic.so.1`은 Debian의 `libatomic1` 패키지에서 사용자 디렉터리로 분리했으며 OS 라이브러리를 덮어쓰지 않았다. `.profile`에 경로를 추가했으므로 새 로그인 또는 `. "$HOME/.profile"` 후 `node --version`, `pnpm --version`, `pnpm runtime:check`로 확인한다. 기존 Node 24 설치 파일은 복구와 실행 중 프로세스를 위해 삭제하지 않았다.

## 재배포·런타임 변경 절차

1. 승인한 커밋을 `main`에 반영하고 웹 Actions에서 앱·작업 이미지를 함께 재빌드한다.
2. 운영·개발 컨테이너를 새 이미지로 **재생성**한다. 기존 컨테이너 restart나 호스트 Node 교체만으로는 적용되지 않는다.
3. 실제 컨테이너에서 `node --version`, `node /app/scripts/check-node-runtime.mjs`를 검사하고 readiness와 주요 API를 확인한다. 개발 서버와 장기 실행 작업 워커도 새 이미지로 교체해야 한다.
4. 기존 Node 24 기반 롤백 이미지는 보안 패치 완료 증거로 간주하지 않는다. 구버전 코드가 필요하면 그 코드도 패치된 런타임으로 다시 빌드해 롤백 후보를 준비한다. 기존 자동 롤백 동작 자체를 이번 변경에서 제거하지는 않았다.

운영 Docker 소켓·서비스 설치는 관리자 권한이 필요하다. 2026-10-28 운영 배포에서 Node 26 기반 app·ops 교체와 readiness를 확인했다. 이는 당시 관측이며 호스트 러너·다른 제품의 내장 Node까지 교체했다는 뜻이 아니다. 이후에도 실제 실행 버전을 확인한다.

## Actions 러너 자체는 별도

`actions/setup-node`는 프로젝트의 Node를 바꾸며 self-hosted 러너와 각 Action이 번들한 Node를 바꾸지 않는다. 확인된 NAS 러너는 2.338.0, 번들 Node는 24.21.0이다. 이 파일을 Node 26으로 임의 덮어쓰지 않는다. 공식 러너 **2.338.2** 태그는 Node 24.22.1을 포함하므로 해당 버전 이상 공식 릴리스로 업데이트한 뒤 실제 번들 버전을 확인해야 한다. 러너 업데이트는 아직 실행하지 않았다. VS Code 서버 등 다른 제품의 번들 런타임도 해당 제품 업데이트로 관리한다.

## 로컬 검증 범위

- Node 26.12.1·pnpm 11.2.2 실행, frozen lockfile 검사와 Prisma 7.8.0 클라이언트 생성에 성공했다.
- Node 24.18.1로 설치를 시도하면 `ERR_PNPM_UNSUPPORTED_ENGINE`으로 거부되는 것도 확인했다.
- `main` fast-forward 이후 Node 26으로 전체 자동 테스트를 다시 실행해 **671개 통과·2개 건너뜀·실패 0개**를 확인했다. 첫 실행에서 실패한 오래된 UI 구조 검사 2개는 Node 24에서도 재현돼, 기능 변경 없이 현재 컴포넌트 위치와 배치 기준으로 갱신했다.
- Node 26의 격리 개발 인스턴스에서 Next.js 기동·홈·liveness HTTP 200을 확인했다. 운영 DB·스토리지를 사용하는 readiness 시험은 아니다.
- 타입·변경 파일 린트·워크플로 YAML 구문을 검사했다. NAS에서는 운영 웹 전체 빌드나 네이티브 빌드를 실행하지 않았으며, 해당 산출물은 CI 검증이 필요하다.

## 근거

- [Node.js 공식 릴리스 일정](https://github.com/nodejs/Release/blob/main/schedule.json)
- [26.12.1 보안 릴리스](https://nodejs.org/en/blog/release/v26.12.1)
- [2026년 10월 보안 공지](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
- [공식 Node Docker 이미지의 의존성](https://github.com/nodejs/docker-node/blob/main/26/bookworm-slim/Dockerfile)
- [러너 2.338.2의 번들 Node 버전](https://github.com/actions/runner/blob/v2.338.2/src/Misc/externals.sh)
