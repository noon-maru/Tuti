# Capacitor API Architecture

Tuti는 같은 소스코드에서 웹과 앱을 함께 가져간다. 웹은 Next.js standalone 서버로 배포하고, 앱은 Capacitor가 정적 빌드 산출물을 감싸는 구조를 기준으로 한다.

## 결정

- 웹 빌드는 Next.js standalone으로 배포한다.

- 앱 빌드는 Next.js static export 결과물인 `out/`을 Capacitor `webDir`로 사용한다.

- `src/app`은 화면과 Next 라우팅을 담당한다.

- `src/app/api/**/route.ts`는 웹 서버용 얇은 route adapter로만 사용한다.

- 서버 로직은 `src/server` 아래에 둔다.

- 앱과 웹이 함께 써도 되는 타입, 순수 계산, fallback 로직은 `src/shared` 또는 클라이언트 번들에 들어가도 안전한 모듈에 둔다.

## 요청 흐름

웹 standalone에서는 같은 origin의 Next Route Handler를 호출한다.

```txt
Browser
-> /api/recommendations
-> src/app/api/recommendations/route.ts
-> src/server/recommendations
```

Capacitor 앱에서는 정적 WebView 안에서 외부 API 서버를 호출한다.

```txt
Capacitor WebView
-> https://tuti.com/api/recommendations
-> deployed API server
-> src/server/recommendations
```

앱 안에는 Next 서버가 포함되지 않는다. 따라서 Capacitor 앱에서 `/api/recommendations` 같은 상대 경로에 서버가 있을 것이라고 가정하면 안 된다.

## API Base URL 규칙

API base URL은 `/api`까지 포함한다.

```env
NEXT_PUBLIC_API_BASE_URL=https://tuti.com/api
```

호출부에서는 resource path만 붙인다.

```ts
fetch(apiUrl("recommendations"));
```

최종 URL은 다음과 같다.

```txt
https://tuti.com/api/recommendations
```

웹 standalone에서 같은 서버의 API를 쓸 때는 env를 비워두거나 기본값을 `/api`로 둔다.

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

스크립트는 다음 형태를 기준으로 한다.

```json
{
  "scripts": {
    "build:web": "TUTI_TARGET=web next build",
    "build:app": "TUTI_TARGET=app next build",
    "cap:sync": "pnpm build:app && cap sync"
  }
}
```

## 중요한 제약

- 클라이언트 코드에서 `src/server`를 import하지 않는다.

- `NEXT_PUBLIC_API_BASE_URL`은 공개 값이다. OpenAI key, DB URL, service role key 같은 비밀 값은 절대 넣지 않는다.

- Capacitor 앱의 env 값은 빌드 시점에 JavaScript bundle에 포함된다. 서버 주소가 바뀌면 앱을 다시 빌드하고 `cap sync` 해야 한다.

- 앱에서 외부 API를 호출하려면 API 서버가 Capacitor WebView origin에 대한 CORS를 허용해야 한다.

- iOS와 Android의 WebView origin은 다를 수 있다. 최소한 웹 배포 도메인과 Capacitor 앱 origin을 CORS 정책에 포함해야 한다.

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
- Next.js Static Export: https://nextjs.org/docs/app/guides/single-page-applications
- Capacitor Config: https://capacitorjs.com/docs/config
