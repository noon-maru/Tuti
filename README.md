# Tuti

**작은 외출을 발견하고, 함께한 순간을 기록하여, 소장할 수 있는 결과물로 만드는 라이프로그 서비스.**

혼자 또는 소중한 사람과 보낸 평범한 하루도 기억하고 싶은 작은 여행이 될 수 있습니다.
Tuti는 사진과 짧은 글로 **마디**를 남기고, 이를 **하루마디**에 채워 간직하게 합니다.
장소 추천은 다음에 남길 하루를 시작하는 입구이지 서비스의 전부가 아닙니다.

## 현재 경험

- 첫 이용에서는 필수 약관에 명시적으로 동의하고 시작합니다. 위치 동의는 선택입니다.
- 홈(`/`)은 하루마디를 진열한 책장입니다. 빈 틀을 먼저 만들거나 첫 마디부터 남길 수 있습니다.
- 마디는 사진·글·선택 제목·날짜·장소로 남깁니다. 사진이나 장소가 없어도 사용할 수 있습니다.
- 첫 마디를 남길 때 하루마디가 없다면 기본 하루마디도 함께 만듭니다. 이후에는 원하는
  하루마디에 담거나 따로 보관합니다. 하루마디 안에서 시작한 작성은 그 책에 바로 담깁니다.
- 표지를 누르면 책이 펼쳐지고 쪽을 넘겨 읽습니다. PDF 저장은 별도 동작이며 저장 시점의 사본입니다.
- **작은 여행**(`/explore`)에서 시간·차량 이동 여부와 위치 또는 지역으로 장소를 찾습니다.
  오늘 하루를 선택하면 오늘·내일 출발도 묻습니다. 로그인 직후에는 위치를 요청하지 않습니다.
- 계정 연결과 다른 기기의 기록 불러오기, PNG 공유·선택적 웹 공개, 문의·선택 알림을 제공합니다.

현재 무료 디지털 기능과 달리 **실물 하루마디의 주문·결제·제작·배송은 제공하지 않습니다.**
20~25세 여성·커플을 우선 검증할 고객 가설로 두지만 이용 대상을 제한하지 않습니다.
제품 방향과 실제 구현·성과는 구분합니다.

## 개발 시작

실행 기준은 [.node-version](.node-version), [package.json](./package.json)의 Node·pnpm 버전입니다.
현재 Node 26.12.1 / pnpm 11.2.2이며 `pnpm runtime:check`로 확인합니다.

처음 설정하는 환경에서만 예제를 복사하고 실제 값을 채웁니다. 기존 환경 파일을 덮어쓰지 않습니다.

```sh
cp .env.example .env
cp .env.development.example .env.development
docker compose -f docker-compose.dev.yml up --build
```

개발 웹은 `http://localhost:5080`입니다. Compose는 PostgreSQL 17·PostGIS와 별도
스토리지 네트워크를 사용합니다. [오브젝트 스토리지 설정](./docs/object-storage.md)을 먼저 확인합니다.
개발·운영 환경과 DB를 혼용하지 않습니다.

실행 중인 개발 앱 컨테이너에서 마이그레이션을 적용합니다.

```sh
docker compose -f docker-compose.dev.yml exec app pnpm db:deploy
```

`db:deploy`는 마이그레이션과 파생 데이터 동기화를 수행합니다. `db:seed`는 초기 개발
데이터가 필요할 때만 별도로 검토해 실행하며 운영 배포나 재시작 절차가 아닙니다.
시행 약관의 개발 DB 준비는 [약관 운영 안내](./docs/legal/README.md)를 따릅니다.

## 구조와 검증

웹은 Next.js·React·TypeScript·Emotion, 상태는 Zustand·TanStack Query,
서버는 Route Handler·Prisma·PostgreSQL/PostGIS·비공개 객체 스토리지를 사용합니다.
Capacitor Android·iOS 앱은 정적 번들과 원격 API를 사용합니다.
`build:app`은 임시 소스 투영본을 만들며 원본 서버 라우트를 지우지 않습니다.

```sh
pnpm test
pnpm lint
pnpm docs:check
pnpm build:web
```

DB 통합 시험은 별도 격리 DB가 필요합니다. 테스트 통과·스토어 업로드·실기기 검증·
공개 출시는 서로 다른 단계입니다. NAS에서 무거운 앱 빌드를 반복하기보다 수동 Actions를 사용합니다.

## 배포와 문서

웹·Android·iOS 모두 수동 GitHub Actions 배포를 사용합니다. 일반 push 자체가
스토어 출시나 운영 배포를 실행하지 않습니다. Android 내부 트랙 업로드와 App Store Connect
빌드 업로드 후 공개 출시·심사 제출은 별도로 진행합니다. 비밀값은 Git에 넣지 않습니다.

- [전체 문서 안내와 문서 관리 기준](./docs/README.md)
- [현재 제품 방향·고객 가설](./docs/product-direction.md) · [하루마디 구현](./docs/harumadi.md)
- [웹 운영·백업·복구](./docs/operations.md) · [Android](./docs/android-build.md) · [iOS](./docs/ios-build.md)
- [약관·개인정보 운영](./docs/legal/README.md) · [출시 노트](./docs/release-notes.md)

> 멀리 떠나지 않아도 됩니다. 가까운 곳에서 보낸 작은 하루도 오래 간직할 수 있습니다.
