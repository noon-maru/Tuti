# Capacitor 앱 전환 및 출시 기반 로드맵

작성일: 2026-07-21

## 목표

현재 Next.js App Router 기반의 화면별 라우트 구조를 유지하면서, Capacitor로 패키징한 iOS·Android 앱에서 다음 품질을 확보한다.

- 전체 화면 이동이 새 페이지 로딩이 아니라 앱 화면 스택처럼 느껴진다.
- 버튼, 제스처, 브라우저 히스토리, Android 하드웨어 뒤로가기가 동일한 내비게이션 정책을 사용한다.
- 노치, 상태바, 홈 인디케이터, 작은 화면에서도 콘텐츠가 잘리지 않는다.
- 앱 정적 빌드와 원격 API 호출이 실제 배포 환경에서 동작한다.
- 느린 네트워크, 앱 재시작, 프로세스 복원, 접근성 설정에서도 화면이 깨지지 않는다.

## 현재 결정

- 질문과 첫 추천 화면은 루트 `/` 플로우에 통합하고 `/swipe`, `/detail`, `/journal` 같은 독립 화면 라우트는 유지한다.
- 공통 `layout.tsx`, `TutiAppShell`, `AppFrame`, Zustand, TanStack Query 구조를 유지한다.
- 앱은 Next.js static export 결과물인 `out/`을 Capacitor `webDir`로 사용한다.
- Swift·Kotlin 네이티브 UI는 만들지 않는다. 네이티브 코드는 Capacitor 설정과 플러그인 연동 범위로 제한한다.
- 모든 화면을 하나의 거대한 React 로컬 상태로 합치지 않는다.
- Next.js의 실험적 View Transition과 static export에서 지원되지 않는 Intercepting Routes를 핵심 구조로 사용하지 않는다.

API 배포 원칙은 [Capacitor API Architecture](./capacitor-api-architecture.md)를 따른다. 웹은 운영 환경의 Next.js Route Handler를 유지하고, 앱은 서버 전용 경로를 제외한 일회성 소스 투영본을 static export한 뒤 `https://tuti.today/api`의 동일한 Route Handler를 원격 호출한다.

## 목표 구조

```text
TutiAppShell
└─ Providers
   └─ AppFrame
      ├─ AppLifecycleBridge
      └─ AppNavigationProvider
         └─ RouteTransitionHost
            ├─ retained/outgoing layer
            └─ current/incoming layer
```

각 계층의 책임은 다음과 같다.

- `AppLifecycleBridge`: Android back, deep link, cold start, resume 이벤트를 웹 내비게이션으로 연결한다.
- `AppNavigationProvider`: `push`, `replace`, `backOrFallback`, 전환 방향, 중복 입력 잠금을 관리한다.
- `RouteTransitionHost`: 이전 화면과 다음 화면의 렌더링 수명 및 enter/exit 애니메이션을 관리한다.
- 각 `page.tsx`: URL과 화면 데이터를 연결하는 얇은 route adapter 역할만 맡는다.
- 각 Screen 컴포넌트: 라우터를 직접 알지 않고 이벤트 callback만 받는다.

## Phase 0 — 앱 빌드 기반 정상화

우선순위: P0

### 작업

- [x] 앱 static export 소스 투영본에서 `src/app/api/**`의 런타임 POST Route Handler를 제외한다.
- [x] 웹 Route Handler를 운영 API로 유지하고 운영 웹과 앱이 동일한 HTTPS API를 호출하도록 한다.
- [x] 로컬 웹은 `/api`, 운영 웹과 앱은 `https://tuti.today/api`를 사용한다.
- [x] API에 `OPTIONS`와 명시적인 CORS allowlist를 추가한다.
- [ ] 최소 허용 origin에 웹 배포 origin, `capacitor://localhost`, `https://localhost`를 포함한다.
- [x] 앱 빌드에서 `NEXT_PUBLIC_API_BASE_URL`이 비어 있거나 절대 HTTPS URL이 아니면 빌드를 실패시킨다.
- [ ] 최종 Bundle ID/Application ID를 확정하고 `app.tuti.prototype`을 교체한다.
- [ ] 동일한 Capacitor 8 버전으로 `@capacitor/android`, `@capacitor/ios`, `@capacitor/app`을 설치한다.
- [ ] `android/`, `ios/` 플랫폼 프로젝트를 생성하고 소스 저장소에 포함한다.

### 완료 기준

- [ ] `pnpm build:web`이 성공한다.
- [ ] `pnpm build:app`이 서버 런타임 기능 없이 성공하고 `out/`을 생성한다.
- [ ] `pnpm cap:sync`가 양쪽 플랫폼에 웹 산출물과 플러그인을 복사한다.
- [ ] iOS Simulator와 Android Emulator에서 앱이 로컬 번들로 시작한다.
- [ ] 앱에서 추천 API의 preflight와 POST가 모두 성공한다.

## Phase 1 — 모바일 뷰포트와 네이티브 셸

우선순위: P0

### 작업

- [x] Next.js viewport 설정에 `viewport-fit=cover`를 추가한다.
- [ ] Capacitor SystemBars 정책과 아이콘 색상을 명시한다.
- [x] `ScreenFrame`이 `env(safe-area-inset-*)`와 Capacitor의 `--safe-area-inset-*`를 사용하도록 한다.
- [x] `AppFrame` 모바일 레이아웃의 `min-height: 620px`을 제거하고 실제 WebView 높이에 맞춘다.
- [x] `100dvh`를 기본으로 사용하고 필요한 경우 `svh` fallback을 둔다.
- [x] 상세, 홈, 인테이크 화면에 안전한 내부 스크롤 영역을 둔다.
- [x] 저널의 flex scroll 영역에 `min-height: 0` 등 명시적인 축소 규칙을 둔다.
- [ ] 네이티브 App Icon, Splash Screen, 배경색을 생성하고 흰 화면 없이 React 초기 화면으로 연결한다.
- [ ] portrait 고정 여부와 landscape 지원 여부를 결정한다.

### 완료 기준

- [ ] iPhone SE급 높이, Dynamic Island 기기, Android cutout 기기에서 콘텐츠가 잘리지 않는다.
- [ ] 홈 인디케이터와 Android navigation bar가 버튼 또는 도움말을 가리지 않는다.
- [ ] 큰 글자 설정에서도 상세 화면의 모든 정보에 스크롤로 접근할 수 있다.
- [ ] 앱 시작과 resume 과정에서 흰색 또는 검은색 플래시가 보이지 않는다.

## Phase 2 — 내비게이션 계약 통합

우선순위: P0

### 작업

- [ ] `AppNavigationProvider`와 `useAppNavigation`을 추가한다.
- [ ] 모든 직접 `router.push`, `router.replace`, `router.back` 호출을 공통 API로 이동한다.
- [ ] `push`, `replace`, `backOrFallback`의 의미를 명확히 구분한다.
- [ ] 상세·저널 닫기에서 `/swipe`를 다시 `push`하는 히스토리 루프를 제거한다.
- [ ] Android `backButton`을 공통 내비게이션 계층으로 전달한다.
- [ ] 루트 화면에서 Android back을 눌렀을 때 exit 또는 minimize 중 어떤 정책을 쓸지 결정한다.
- [ ] 인테이크 도중 back은 이전 질문으로 이동하고 첫 질문에서만 이전 라우트로 이동하도록 한다.
- [ ] 비동기 위치 요청이 완료되기 전에 화면을 떠난 경우 오래된 callback의 라우팅을 무시한다.
- [ ] `appUrlOpen`, `getLaunchUrl`을 통해 deep link를 root bootstrap 후 client router로 전달한다.

### 기본 라우트 정책

| 이동 | 히스토리 | 전환 |
| --- | --- | --- |
| `/` 인테이크 다음 질문 | route 유지 | inline forward |
| `/` 인테이크 이전 질문 | route 유지 | inline backward |
| `/` 질문 → `/` 첫 추천 | 컴포넌트 상태 전환 | 같은 진입 플로우 안의 완료 전환 |
| `/` 첫 추천 → `/swipe` | 제품 정책 확정 후 `push` 또는 `replace` | forward |
| `/swipe` → `/detail` | `push` | 위 방향 interactive |
| `/detail` → `/swipe` | `backOrFallback('/swipe')` | 아래 방향 interactive |
| `/swipe` → `/journal` | `push` | 아래 방향 interactive |
| `/journal` → `/swipe` | `backOrFallback('/swipe')` | 위 방향 interactive |

### 완료 기준

- [ ] 상세를 여러 번 열고 닫아도 history에 `/swipe`와 `/detail`이 반복 누적되지 않는다.
- [ ] 화면 버튼, 제스처, Android back이 같은 방향과 같은 전환을 사용한다.
- [ ] 직접 진입한 `/detail`에서도 back fallback이 앱 밖의 예기치 않은 페이지로 이동하지 않는다.
- [ ] 빠르게 연속 입력해도 한 번의 동작에서 한 번만 내비게이션한다.

## Phase 3 — 공통 화면 전환 호스트

우선순위: P0/P1

### 상태 모델

```text
idle
→ dragging
→ settling-to-origin | settling-to-destination
→ navigating
→ entering
→ idle
```

### 작업

- [ ] `RouteTransitionHost`를 공유 layout 아래에 추가한다.
- [ ] 일반 route 이동에도 일관된 enter/exit 전환을 적용한다.
- [ ] 전환 방향은 pathname 비교가 아니라 명시적인 route policy로 결정한다.
- [ ] drag 중에는 손가락 위치가 화면 progress를 직접 제어하도록 한다.
- [ ] 손을 놓으면 현재 progress에서 목적지 또는 원점까지 easing/spring으로 이어간다.
- [ ] 고정 120ms/180ms 타이머 대신 `transitionend`, Web Animations 완료 또는 취소 가능한 animation promise를 사용한다.
- [ ] 전환 중 추가 pointer, 버튼, hardware back 입력을 잠근다.
- [ ] 언마운트 또는 다른 내비게이션 발생 시 animation과 callback을 취소한다.
- [ ] 전체 `DetailScreen`/`JournalScreen` 복제 대신 가벼운 presentation-only preview를 사용한다.
- [ ] `SwipeScreen`과 `SwipeReturnBackdrop`의 중복 마크업을 공통 `SwipeScene`으로 추출한다.
- [ ] 숨은 전환 레이어에 `inert`, `aria-hidden`, focus 차단을 적용한다.

### 완료 기준

- [ ] 임계점 부근에서 손을 놓아도 화면이 100% 위치로 점프하지 않는다.
- [ ] 취소 제스처가 현재 위치에서 자연스럽게 원점으로 복귀한다.
- [ ] 느린 API 또는 느린 라우트 로딩에서도 이전 화면과 다음 화면 사이에 빈 프레임이 없다.
- [ ] 버튼으로 닫기와 제스처로 닫기의 시각적 결과가 동일하다.
- [ ] 전환 도중 화면 회전, background 전환, 빠른 재입력이 발생해도 오래된 route callback이 실행되지 않는다.

## Phase 4 — 제스처 성능과 접근성

우선순위: P1

### 작업

- [ ] pointer move 값을 `requestAnimationFrame`으로 샘플링한다.
- [ ] 연속 좌표는 React/Emotion props 대신 CSS 변수, ref 또는 MotionValue 계열로 전달한다.
- [ ] React state는 `idle`, `dragging`, `settling`, `committed` 같은 단계 변경에만 사용한다.
- [ ] `will-change`는 실제 전환 중인 레이어에만 적용한다.
- [ ] 멀리 떨어진 카드는 DOM 및 이미지 로딩 대상에서 제외하거나 지연 렌더링한다.
- [ ] Pointer Events를 단일 입력 모델로 정리하고 multi-touch, lost pointer capture를 처리한다.
- [ ] 저널 스크롤과 화면 닫기 제스처의 소유권을 제스처 시작 시 확정한다.
- [ ] `prefers-reduced-motion`에서 shimmer, nudge, 큰 slide를 제거하고 짧은 fade 또는 즉시 이동을 사용한다.
- [ ] 상세 보기와 기록 보기에 제스처 외 명시적인 버튼 대안을 제공한다.
- [ ] 현재 카드 외의 카드는 접근성 focus 순서에서 제외한다.
- [ ] route 및 인테이크 단계 변경 후 제목으로 focus를 이동하거나 화면 변경을 알린다.
- [ ] 모든 주요 터치 대상에 최소 44×44px hit area와 `:focus-visible`을 제공한다.

### 완료 기준

- [ ] 중급 Android 실기기에서 drag 중 지속적인 긴 프레임이 발생하지 않는다.
- [ ] VoiceOver와 TalkBack만으로 모든 핵심 화면에 진입하고 돌아올 수 있다.
- [ ] reduced-motion 사용자는 자동 반복 모션 없이 전체 흐름을 완료할 수 있다.
- [ ] 숨겨진 preview와 backdrop 내부 요소로 focus가 이동하지 않는다.

## Phase 5 — 데이터 준비, 오프라인, 앱 복원

우선순위: P1

### 작업

- [ ] `isPending`, `isError`, retry 상태를 각 화면에 연결한다.
- [ ] 추천 데이터가 없는 상태에서 `/swipe` 또는 `/detail`로 이동해도 빈 화면을 반환하지 않는다.
- [ ] 현재 장소 이미지의 preload/decode 완료 여부를 전환 시작 조건과 연결한다.
- [ ] 이미지 실패 placeholder와 번들 내 최소 fallback 자산을 둔다.
- [ ] 앱 재시작 시 복원할 상태와 초기화할 상태를 구분한다.
- [ ] `answers`, `activePlaceId`, onboarding 완료 여부의 영속 정책을 정한다.
- [ ] 위치 정보는 개인정보이므로 별도 결정 없이 영속화하지 않는다.
- [ ] 상세를 공유 가능한 화면으로 만들지, 세션 전용 화면으로 둘지 결정한다.
- [ ] 공유 가능하다면 `/detail?place=<id>`처럼 static export가 처리할 수 있는 안정적인 식별자를 사용한다.
- [ ] 세션 전용이라면 선택 상태가 없는 직접 진입을 `/swipe`로 `replace`한다.
- [ ] Capacitor WebView가 nested URL에서 process restore될 때 root HTML로 시작하는 상황을 실기기에서 검증한다.

### 완료 기준

- [ ] 네트워크가 느리거나 끊겨도 빈 화면 대신 로딩, 재시도 또는 이전 추천을 표시한다.
- [ ] background 후 OS가 WebView process를 종료해도 앱이 유효한 화면으로 복원된다.
- [ ] 직접 `/detail`에 진입해도 선택된 장소를 복원하거나 명시적으로 `/swipe`로 이동한다.

## Phase 6 — 네이티브 기능과 출시 검증

우선순위: P1/P2

### 작업

- [ ] Capacitor Geolocation 사용 여부를 결정하고 iOS·Android 권한 문구와 manifest를 설정한다.
- [ ] 위치 거부, 제한, timeout 상태를 UI에 명시한다.
- [ ] Universal Links/App Links와 허용 route 검증을 구현한다.
- [ ] 네이티브 아이콘, splash, 상태바, 화면 방향을 최종 자산으로 교체한다.
- [ ] API rate limit, 인증 또는 앱 무결성 정책을 추가한다.
- [ ] 위치 전송과 외부 이미지 사용을 개인정보 처리방침 및 스토어 disclosure에 반영한다.
- [ ] 웹과 앱 빌드를 CI에서 각각 검증한다.

### 회귀 테스트 매트릭스

- [ ] 인테이크 → 홈 → 스와이프 전체 흐름
- [ ] 인테이크 각 단계에서 back
- [ ] 상세·저널 반복 open/close 20회
- [ ] 화면 버튼, swipe back, Android hardware back, browser back/forward
- [ ] transition 중 빠른 연속 터치와 multi-touch
- [ ] 저널 목록 상단, 중간, 하단의 scroll/close 충돌
- [ ] API 지연, 오류, 오프라인, 이미지 오류
- [ ] cold start, deep link, background/resume, WebView process restore
- [ ] 작은 화면, 큰 글자, landscape 정책
- [ ] reduced-motion, VoiceOver, TalkBack
- [ ] 60Hz 및 120Hz 기기와 중급 Android 기기

## 제안 파일 구조

```text
src/
  features/
    navigation/
      AppLifecycleBridge.tsx
      AppNavigationProvider.tsx
      RouteTransitionHost.tsx
      routePolicy.ts
      useAppNavigation.ts
    tuti/
      components/
        AppFrame.tsx
        ScreenFrame.tsx
      screens/
        swipe/
          SwipeScene.tsx
          SwipeScreen.tsx
```

이 구조는 예시이며, 핵심은 route policy, native lifecycle, transition rendering을 개별 Screen에서 분리하는 것이다.

## 착수 전 확정할 제품 결정

- [ ] 질문 완료 후 Android back으로 인테이크에 돌아갈 수 있는가?
- [ ] 홈 → 스와이프는 되돌아갈 수 있는 이동인가?
- [ ] 상세 화면은 외부 공유·딥링크 대상인가, 세션 전용인가?
- [ ] 루트에서 Android back은 앱 종료인가, 최소화인가?
- [ ] 앱은 portrait만 지원하는가?
- [ ] 추천 및 선택 상태를 앱 재시작 후 얼마 동안 보존하는가?

## 전체 완료 정의

- [ ] 페이지 라우트와 URL을 유지하면서 모든 화면 이동이 공통 전환 계층을 통과한다.
- [ ] 앱 build, sync, iOS/Android debug build가 CI 또는 재현 가능한 명령으로 성공한다.
- [ ] API, CORS, 위치 권한, deep link가 실제 배포 origin과 실기기에서 검증된다.
- [ ] 작은 화면, 오프라인, process restore, 접근성 설정에서도 핵심 사용자 흐름이 중단되지 않는다.
- [ ] 실험적 Next.js 기능 없이 프로덕션 전환 품질을 제공한다.

## 참고 문서

- [Next.js Static Exports](https://nextjs.org/docs/app/guides/static-exports)
- [Next.js View Transition](https://nextjs.org/docs/app/api-reference/config/next-config-js/viewTransition)
- [Capacitor App API](https://capacitorjs.com/docs/apis/app)
- [Capacitor System Bars API](https://capacitorjs.com/docs/apis/system-bars)
- [Capacitor Deep Links](https://capacitorjs.com/docs/guides/deep-links)
- [Capacitor Geolocation](https://capacitorjs.com/docs/apis/geolocation)
