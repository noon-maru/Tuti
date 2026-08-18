# Capacitor API Architecture

Tuti는 같은 소스코드에서 웹과 앱을 함께 가져간다. 웹은 Next.js standalone 서버로 배포하고, 앱은 Capacitor가 정적 빌드 산출물을 감싸는 구조를 기준으로 한다.

## 결정

- 웹 빌드는 Next.js standalone으로 배포한다.

- 앱 빌드는 Next.js static export 결과물인 `out/`을 Capacitor `webDir`로 사용한다.

- `src/app`은 화면과 Next 라우팅을 담당한다.

- `src/app/api/**/route.ts`는 웹 서버용 얇은 route adapter로만 사용한다.

- 앱 빌드는 `.app-build/`에 일회성 소스 투영본을 만들고 `src/app/api`, `src/server`, `src/generated`를 제외한다.

- 서버 로직은 `src/server` 아래에 둔다.

- 앱과 웹이 함께 써도 되는 타입, 순수 계산, fallback 로직은 `src/shared` 또는 클라이언트 번들에 들어가도 안전한 모듈에 둔다.

## 전체 아키텍처

### 런타임 구조

```mermaid
flowchart LR
  subgraph clients[클라이언트]
    web[웹 브라우저]
    ios[iOS Capacitor 앱<br/>capacitor://localhost]
    android[Android Capacitor 앱<br/>https://localhost]
  end

  subgraph backend[tuti.today 운영 백엔드]
    subgraph next[Next.js standalone 서버]
      webUi[웹 UI]
      route[/api/*<br/>얇은 Route Handler]
      service[인증 · 저널 · 추천<br/>서버 서비스]
    end

    postgres[(PostgreSQL · PostGIS)]
  end

  openai[OpenAI API]

  web -->|웹 화면 요청| webUi
  web -->|same-origin HTTPS| route
  ios -->|CORS 허용 HTTPS| route
  android -->|CORS 허용 HTTPS| route
  route -->|검증된 입력| service
  service -->|장소 조회| postgres
  service -->|선택적 상태 해석| openai
  service -->|추천 장소 JSON| route
```

웹과 Capacitor 앱은 모두 `tuti.today`의 동일한 Route Handler를 사용한다. 차이는 웹 요청은 same-origin이고 앱 요청은 WebView origin에서 들어오는 cross-origin이라는 점뿐이다.

### 사용자 세션과 저널 소유권

앱 시작 시 클라이언트는 `POST /api/anonymous-session`으로 익명 사용자와 Bearer 토큰을 발급받는다. 토큰 원문은 웹과 Capacitor가 함께 사용하는 Preferences 저장소에 보관하고, 서버 DB에는 SHA-256 해시만 저장한다.

```mermaid
sequenceDiagram
  participant client as 웹 · Capacitor
  participant session as /api/anonymous-session
  participant journal as /api/journal-entries
  participant db as PostgreSQL

  client->>session: POST
  session->>db: 익명 사용자와 토큰 해시 저장
  session-->>client: userId + accessToken
  client->>client: Preferences에 세션 저장
  client->>journal: Authorization: Bearer accessToken
  journal->>db: 토큰 해시로 owner 조회
  journal->>db: ownerId 범위에서만 CRUD
  journal-->>client: 현재 사용자의 기록
```

- 클라이언트 요청 본문에서 `ownerId`를 받지 않는다.

- 저널 조회·생성·수정·삭제의 소유자는 Bearer 토큰으로 서버가 결정한다.

- 잘못되거나 DB 초기화로 사라진 토큰이 401을 받으면 Preferences 세션을 폐기하고 한 번만 재발급해 요청을 재시도한다.

- CORS preflight는 `Authorization` 헤더와 `GET, POST, PATCH, DELETE, OPTIONS`를 허용한다.

- CORS는 인증 수단이 아니며, 실제 기록 격리는 토큰 해시 조회와 `ownerId` 조건으로 강제한다.

#### 계정 연결

- 계정 인증 수단은 `AuthIdentity`에 `email`, `apple`, `google`, `kakao` 공급자와 공급자별 고유 식별자를 저장한다.

- 이메일 로그인은 비밀번호 대신 10분 동안 유효한 6자리 일회용 인증코드를 사용한다. 코드 원문은 저장하지 않고 서버 비밀값을 이용한 HMAC 해시만 저장한다.

- 이메일 인증에 처음 성공하면 현재 익명 사용자를 계정으로 승격한다.
  기존 이메일 계정이 있고 현재 기기에 익명 기록이 남아 있으면,
  사용자가 기록을 합칠지 계정 기록만 불러올지 명시적으로 선택한다.
- 이메일 인증코드는 서버에서 Daum 스마트워크 SMTP
  (`smtp.daum.net:465`, SSL)를 통해 `admin@tuti.today` 발신 주소로
  전송한다. SMTP 인증에는 스마트워크 주소가 아닌 연결된 Daum ID와
  2단계 인증 앱 비밀번호를 사용하며, 자격 증명은 서버 환경변수로만
  주입한다.

- OAuth 계정은 이메일이 아니라 각 공급자가 보장하는 고유 사용자 식별자로 연결한다. 같은 이메일이라는 이유만으로 서로 다른 OAuth 계정을 자동 병합하지 않는다.

- Google OAuth는 서버가 authorization code를 PKCE verifier와 client
  secret으로 교환한 뒤 OpenID Connect UserInfo의 `sub`를 계정 식별자로
  사용한다. 공급자 콜백에서 세션 토큰을 URL로 전달하지 않고 10분 유효
  일회용 교환 티켓을 발급하며, 웹 클라이언트가 티켓을 세션으로 교환한다.

- Google Cloud의 웹 애플리케이션 OAuth 클라이언트에는
  `https://tuti.today/api/auth/oauth/google/callback`을 승인된 리디렉션
  URI로 정확히 등록한다. 서버의 `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_ENABLED`와 빌드 시점의
  `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED`를 설정해야 Google 버튼이 활성화된다.

- Kakao OAuth도 authorization code와 PKCE를 사용한다. 서버가 Kakao
  토큰 엔드포인트에서 코드를 교환한 뒤 사용자 정보 API의 회원번호를
  계정 식별자로 사용한다. 카카오계정 이메일은 유효하고 인증된 경우에만
  표시 정보로 저장하며 계정 연결 기준으로 사용하지 않는다.

- Kakao Developers에는 Kakao Login을 활성화하고
  `https://tuti.today/api/auth/oauth/kakao/callback`을 리디렉션 URI로
  등록한다. REST API 키를 `KAKAO_REST_API_KEY`, 활성화된 Client Secret을
  `KAKAO_CLIENT_SECRET`에 넣고 서버의 `KAKAO_OAUTH_ENABLED`와 빌드
  시점의 `NEXT_PUBLIC_KAKAO_OAUTH_ENABLED`를 함께 활성화한다.

- 로그인 세션 토큰도 원문 대신 SHA-256 해시만 `user_sessions`에 저장한다.

## 출발 계획 API

- `POST /api/places/{placeId}/travel-time`은 메인 캐러셀에서 현재 선택한
  장소 한 곳의 이동시간만 계산한다. 직선거리 1.8km 이내는 도보를 먼저
  확인하고, 이후 대중교통·자동차·자전거·도보 순서로 사용 가능한 경로를
  찾는다. 카드가 선택되기 전에는 호출하지 않는다.
- 접힌 출발 준비 피크 시트는 메인 활성 카드의 React Query 결과와 표시
  문자열을 그대로 이어받는다. 시트를 여는 동작만으로 이동시간이나 전체
  출발 계획을 다시 요청하지 않는다.
- 사용자가 피크 시트를 위로 펼칠 때만 전체 출발 계획 화면을 마운트하고
  `POST /api/places/{placeId}/departure-plan`을 호출한다. 경량 이동시간과
  전체 계획은 같은 이동수단 우선순위를 사용한다.
- `POST /api/places/{placeId}/departure-plan`은 현재 위치와 목적지 좌표를
  바탕으로 대중교통·도보·자전거·자동차 이동 요약을 반환한다.
- 대중교통·도보·자전거와 주변 장소는 카카오맵 REST API, 자동차는
  카카오내비 길찾기 API를 사용하며 모두 `KAKAO_REST_API_KEY`를 공유한다.
- 사용자 출발 좌표는 DB와 로그에 저장하지 않는다. 출발 계획의 동일한
  동시 요청을 합치는 동안에만 약 10m 단위의 SHA-256 해시 키를 메모리에
  유지하며, 요청이 끝나면 경로 결과와 키를 서버 캐시에 남기지 않는다.
- 관광지 상세정보는 TourAPI 지연 수집 캐시를 사용하고, 주변 장소는 6시간
  메모리 캐시를 사용한다. 개별 이동수단 호출 실패는 다른 결과를 막지 않는다.
- `POST /api/recommendation-actions`는 익명·로그인 사용자 모두 기존 Bearer
  세션으로 추천 이후 행동을 기록한다. 추천 실행 ID, 장소, 행동 유형과
  이동수단만 저장하며 현재 위치 좌표는 포함하지 않는다.

## 사진 위치 기반 장소 제안

- 기록 이미지의 촬영일과 GPS 메타데이터는 크롭·압축 전에 클라이언트에서
  읽는다. GPS가 있는 경우에만 `POST /api/places/nearby`를 호출한다.
- 서버는 PostGIS로 반경 3km 안의 승인·노출 장소를 거리순으로 최대 5개
  반환한다. 가장 가까운 장소를 기록 작성 화면에 미리 선택하되 사용자가
  장소 검색에서 언제든 바꿀 수 있다.
- 사진 좌표는 가까운 장소를 조회하는 동안만 사용한다. 좌표 원문은 DB,
  서버 로그, 클라이언트 영속 저장소에 보관하지 않는다.

- 웹과 Capacitor는 모두 `tuti-session` Preferences 키와 같은 클라이언트 API를 사용한다.

- 로그아웃하면 현재 로그인 세션을 폐기하고 새 익명 세션으로 전환한다. 계정에 연결된 기존 기록은 서버에 유지된다.

##### 비활성화 정책

- 계정 인증과 각 OAuth 공급자는 별도 플래그로 활성화한다.

- 클라이언트는 `NEXT_PUBLIC_ACCOUNT_AUTH_ENABLED=false`일 때 모든 로그인 입력과 공급자 버튼을 비활성화한다.

- 서버는 별도의 `ACCOUNT_AUTH_ENABLED=false`를 검사하므로 클라이언트 UI를 우회해도 이메일 코드 발송과 OAuth 시작·콜백이 `503`으로 종료된다.

- Google은 추가로 서버의 `GOOGLE_OAUTH_ENABLED`와 클라이언트의
  `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED`가 모두 `true`여야 한다. Kakao도
  서버의 `KAKAO_OAUTH_ENABLED`와 클라이언트의
  `NEXT_PUBLIC_KAKAO_OAUTH_ENABLED`를 함께 검사한다. Apple은 연결
  작업이 끝날 때까지 비활성 상태로 둔다.

- Capacitor 최종 앱 ID는 `com.noonmaru.tuti`를 사용한다.

- 현재 OAuth 완료 리디렉션은 웹 `/login`으로 연결한다. Capacitor는
  iOS/Android 네이티브 프로젝트 생성 후 시스템 브라우저와 앱 딥링크를
  같은 일회용 티켓 교환 API에 연결한다.

### 빌드 파이프라인

```mermaid
flowchart TB
  subgraph source[하나의 원본 저장소]
    pages[src/app/(tuti)<br/>공통 화면 라우트]
    api[src/app/api<br/>웹 Route Handler]
    server[src/server · src/generated<br/>DB·OpenAI 서버 코드]
    client[src/features · src/lib<br/>src/store · src/styles]
    shared[src/shared<br/>API 계약·공통 타입]
  end

  subgraph webBuild[웹 빌드]
    nextBuild[pnpm build:web]
    standalone[Next.js standalone 산출물]
  end

  subgraph appBuild[Capacitor 앱 빌드]
    buildScript[scripts/build-capacitor-app.ts]
    projection[.app-build 임시 프로젝트]
    staticBuild[Next.js static export]
    out[out/]
    capacitor[Capacitor iOS · Android]
  end

  pages --> nextBuild
  api --> nextBuild
  server --> nextBuild
  client --> nextBuild
  shared --> nextBuild
  nextBuild --> standalone

  pages --> buildScript
  client --> buildScript
  shared --> buildScript
  api -. 빌드 투영본에서 제외 .-> buildScript
  server -. 빌드 투영본에서 제외 .-> buildScript
  buildScript --> projection
  projection --> staticBuild
  staticBuild --> out
  out --> capacitor
```

앱 빌드 투영본은 서버 전용 경로를 복사하지 않는다. 원본 저장소와 웹 빌드는 Route Handler를 그대로 유지하며, 앱 정적 산출물만 서버 코드에서 물리적으로 분리된다.

## 요청 흐름

웹 standalone에서는 같은 origin의 Next Route Handler를 호출한다.

```txt
Browser
-> /api/recommendations
-> src/app/api/recommendations/route.ts
-> src/server/recommendations
```

Capacitor 앱에서는 정적 WebView 안에서 운영 환경의 동일한 Next Route Handler를 원격 호출한다.

```txt
Capacitor WebView
-> https://tuti.today/api/recommendations
-> 운영 Next Route Handler
-> src/server/recommendations
```

앱 안에는 Next 서버가 포함되지 않는다. 따라서 Capacitor 앱에서 `/api/recommendations` 같은 상대 경로에 서버가 있을 것이라고 가정하면 안 된다.

## API Base URL 규칙

API base URL은 `/api`까지 포함한다.

```env
NEXT_PUBLIC_API_BASE_URL=https://tuti.today/api
```

호출부에서는 resource path만 붙인다.

```ts
fetch(apiUrl("recommendations"));
```

최종 URL은 다음과 같다.

```txt
https://tuti.today/api/recommendations
```

로컬 웹 개발에서는 값을 비워 같은 origin의 `/api`를 사용한다. 운영 웹과 Capacitor 앱은 모두 `https://tuti.today/api`를 사용한다.

```ts
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";
```

URL 결합은 trailing slash 차이로 깨지지 않게 helper를 사용한다.

```ts
export function apiUrl(path: string) {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
```

이 규칙은 나중에 API 버저닝을 붙일 때도 유지할 수 있다.

```env
NEXT_PUBLIC_API_BASE_URL=https://tuti.com/api/v1
```

## 빌드 타겟

Next 설정은 빌드 타겟에 따라 갈라질 수 있다.

```ts
const target = process.env.TUTI_TARGET;

const nextConfig = {
  output: target === "app" ? "export" : "standalone",
  images: {
    unoptimized: target === "app",
  },
};

export default nextConfig;
```

웹 빌드는 원본 트리 전체를 사용한다. 앱 빌드는 TypeScript 스크립트가 임시 프로젝트를 만든 다음 Next.js를 실행한다.

```json
{
  "scripts": {
    "build:web": "TUTI_TARGET=web next build",
    "build:app": "tsx scripts/build-capacitor-app.ts",
    "cap:sync": "pnpm build:app && cap sync"
  }
}
```

`build-capacitor-app.ts`는 다음 순서로 동작한다.

1. `.app-build/`을 깨끗하게 생성한다.
2. `public`, 클라이언트 소스, Next.js 설정을 복사한다.
3. 사용자 앱에 필요하지 않은 `src/app/admin`과 서버 전용 `src/app/api`,
   `src/proxy.ts`, `src/server`, `src/generated`를 제외한다.
4. `NEXT_PUBLIC_API_BASE_URL`이 `/api` 경로를 포함한 절대 HTTPS URL인지 검증한다.
5. 상위 웹 프로젝트를 자동 루트로 선택하지 않도록 Webpack을 사용하고,
   `TUTI_TARGET=app`으로 임시 프로젝트를 static export한다.
6. 성공한 산출물만 프로젝트 루트의 `out/`으로 교체한다.
7. 임시 프로젝트를 제거한다.

원본 `src/app/api`를 이동하거나 삭제하지 않으므로 빌드 실패나 강제 종료가 웹 소스 트리를 훼손하지 않는다.

## 중요한 제약

- 클라이언트 코드에서 `src/server`를 import하지 않는다.

- `NEXT_PUBLIC_API_BASE_URL`은 공개 값이다. OpenAI key, DB URL, service role key 같은 비밀 값은 절대 넣지 않는다.

- Capacitor 앱의 env 값은 빌드 시점에 JavaScript bundle에 포함된다. 서버 주소가 바뀌면 앱을 다시 빌드하고 `cap sync` 해야 한다.

- 앱에서 외부 API를 호출하려면 API 서버가 Capacitor WebView origin에 대한 CORS를 허용해야 한다.

- iOS와 Android의 WebView origin은 다를 수 있다. 최소한 웹 배포 도메인과 Capacitor 앱 origin을 CORS 정책에 포함해야 한다.

- 현재 allowlist는 `https://tuti.today`, `capacitor://localhost`, `https://localhost`이며, API는 `OPTIONS` preflight에 응답한다.

- 앱 빌드 투영본에 `src/server`를 포함하지 않는다. 클라이언트 코드가 서버 모듈을 잘못 import하면 앱 빌드가 실패해야 한다.

## 서버 경계

서버 로직은 다음처럼 분리한다.

```txt
src/
  app/
    (tuti)/
      page.tsx
      swipe/page.tsx
      detail/page.tsx
    api/
      recommendations/
        route.ts

  server/
    recommendations/
      service.ts
      fatigue.ts
      places.ts
      schema.ts
    llm/
      interpretState.ts
    db/
      prisma.ts

  shared/
    api/
      recommendations.ts
    tuti/
      types.ts
      fallbackRecommendations.ts
```

Route Handler는 요청/응답 변환만 맡고, 실제 추천 생성은 `src/server`로 위임한다.

```ts
// src/app/api/recommendations/route.ts
import { createRecommendations } from "@/server/recommendations/service";

export async function POST(request: Request) {
  const body = await request.json();
  const result = await createRecommendations(body);

  return Response.json(result);
}
```

## 참고 문서

- Next.js Route Handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- Next.js Static Export: https://nextjs.org/docs/app/guides/static-exports
- Capacitor Config: https://capacitorjs.com/docs/config
