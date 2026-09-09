# iOS 빌드

Tuti iOS 앱은 Next.js 정적 산출물을 Capacitor 네이티브 프로젝트에 복사한 뒤
Xcode로 빌드한다. Capacitor 8의 기본값인 Swift Package Manager를 사용하므로
CocoaPods는 필요하지 않다.

## 요구사항

- macOS와 Xcode 26 이상
- Xcode에 설치된 iOS Simulator Runtime
- Node.js 22 이상과 pnpm 11
- 앱 빌드용 공개 설정이 담긴 `.env.app.local`

최초 한 번 Xcode를 실행해 라이선스와 추가 구성 요소 설치를 완료한 뒤, 터미널이
전체 Xcode를 사용하도록 설정한다.

```sh
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -runFirstLaunch
xcodebuild -version
```

## 새 Mac에서 App Store 빌드 준비

저장소를 새로 내려받은 Mac에서는 서버 DB 비밀번호나 API 비밀키가 담긴
`.env.production`을 복사하지 않는다. 앱 정적 번들에 공개되어도 되는 값만 별도
파일로 준비한다.

```sh
git clone https://github.com/noon-maru/Tuti.git
cd Tuti
corepack enable
corepack prepare pnpm@11.2.2 --activate
pnpm install --frozen-lockfile
cp .env.app.example .env.app.local
pnpm ios:sync
pnpm cap:open:ios
```

`.env.app.local`의 API 주소와 로그인 기능 플래그를 출시 환경에 맞게 확인한다.
`ios:sync`는 앱 버전 일치 검사, 정적 웹 빌드, Capacitor 플러그인 동기화를 함께
수행한다. Xcode에서 현재 소유자 Apple Developer 계정으로 로그인한 뒤 Tuti
target의 Team과 자동 서명을 확인하고 `Any iOS Device (arm64)` 대상으로
`Product > Archive`를 실행한다.

현재 App Store 준비 버전은 `1.1.0 (9)`이다. 이미 build 9를 App Store Connect에
업로드했다면 `CURRENT_PROJECT_VERSION`을 더 큰 정수로 올린 뒤 다시 Archive한다.
인증서와 프로비저닝 프로파일은 Git으로 옮기지 않고 Xcode의 자동 서명으로 새
Mac에 발급한다.

## Simulator Debug 빌드

```sh
pnpm ios:debug
```

이 명령은 다음 작업을 순서대로 수행한다.

1. 서버 전용 코드를 제외한 Next.js 정적 앱을 `out/`에 빌드한다.
2. `Tuti.xcodeproj`와 Capacitor 호환 링크를 확인한 뒤 웹 산출물과
   Capacitor 플러그인을 `ios/` 프로젝트에 동기화한다.
3. 코드 서명 없이 iOS Simulator용 Debug 앱을 빌드한다.

빌드 결과는 아래 경로에 생성된다.

```text
ios/DerivedData/Build/Products/Debug-iphonesimulator/Tuti.app
```

Xcode에서 실행하려면 다음 명령으로 프로젝트를 연 뒤 대상 Simulator를 선택한다.

```sh
pnpm cap:open:ios
```

Xcode에서는 프로젝트·target·scheme·product가 모두 `Tuti`로 표시된다.
Capacitor CLI가 사용하는 `ios/App/App.xcodeproj`는 실제
`Tuti.xcodeproj`를 가리키는 상대 심볼릭 링크로 유지한다. Git clone 시
링크가 함께 복원되며, 누락된 경우 `ios:sync`와 `cap:open:ios`가 자동으로
다시 생성한다. `node_modules`의 Capacitor 코드는 수정하지 않는다.

## 권한과 개인정보 매니페스트

앱은 사용자가 위치 이용약관에 동의하고 직접 위치 기반 추천을 요청한 경우에만
포그라운드 위치 권한을 요청한다. `Info.plist`에는 Geolocation 플러그인이 요구하는
두 위치 사용 목적 문구를 선언한다. 백그라운드 위치 수집은 사용하지 않는다.

저널 이미지를 임시 파일로 공유할 때 Filesystem 플러그인을 사용하므로
`PrivacyInfo.xcprivacy`에 파일 타임스탬프 API의 승인 사유 `C617.1`을 선언한다.
세션과 화면 상태 저장에 Preferences 플러그인을 사용하므로 UserDefaults 승인
사유 `CA92.1`도 선언한다. 같은 파일의 수집 항목은 App Store Connect의
개인정보 답변과 일치시킨다.

## 실기기와 App Store 배포

Simulator 빌드에는 Apple Developer 계정이나 코드 서명이 필요하지 않다. 실기기
설치와 App Store 배포 전에는 Xcode의 Tuti target에서 Team을 선택하고 Signing &
Capabilities를 설정해야 한다. App Store용 Archive 자동화는 배포 인증서와
프로비저닝 방식이 확정된 뒤 추가한다.

첫 버전 출시와 정연한 팀으로의 앱 이전을 완료했다. 새 팀의 공급자 설정을
사용해 Apple·Google·Kakao 로그인을 운영하며 서버의 `SOCIAL_OAUTH_ENABLED`와
빌드 시점의 `NEXT_PUBLIC_SOCIAL_OAUTH_ENABLED`, 각 공급자별 플래그를 모두
`true`로 유지한다. 이메일 로그인을 위한 `ACCOUNT_AUTH_ENABLED`와
`NEXT_PUBLIC_ACCOUNT_AUTH_ENABLED`도 계속 `true`로 유지한다.

네이티브 OAuth는 시스템 인증 브라우저를 열고
`com.noonmaru.tuti://oauth/callback` URL Scheme으로 앱에 복귀한다. 새 기기에서
OAuth를 검증할 때는 공급자 페이지가 앱 WebView 안이 아니라 시스템 브라우저로
열리는지와 성공·취소 모두 로그인 화면으로 돌아오는지 확인한다.

현재 사용자 행동의 외부 AI 전송은 비활성화한다. 공개 기록 웹 링크는 1.0.0부터
`NEXT_PUBLIC_JOURNAL_PUBLICATION_ENABLED=true`와
`NEXT_PUBLIC_JOURNAL_PUBLICATION_AUDIENCE=public`으로 정식 포함한다. 일반
계정의 공개 요청은 기록 공개 운영정책 시행일인 2026년 10월 1일부터 허용한다.
앱의 `계정 및 데이터` 화면에서는 로그인 계정과 자동 생성된 익명 계정을 모두
직접 삭제할 수 있어야 한다.
