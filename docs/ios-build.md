# iOS 빌드

Tuti iOS 앱은 Next.js 정적 산출물을 Capacitor 네이티브 프로젝트에 복사한 뒤
Xcode로 빌드한다. Capacitor 8의 기본값인 Swift Package Manager를 사용하므로
CocoaPods는 필요하지 않다.

## 요구사항

- macOS와 Xcode 26 이상
- Xcode에 설치된 iOS Simulator Runtime
- Node.js 22 이상과 pnpm 11
- 앱 빌드용 `NEXT_PUBLIC_API_BASE_URL`이 설정된 `.env.production`

최초 한 번 Xcode를 실행해 라이선스와 추가 구성 요소 설치를 완료한 뒤, 터미널이
전체 Xcode를 사용하도록 설정한다.

```sh
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -runFirstLaunch
xcodebuild -version
```

## Simulator Debug 빌드

```sh
pnpm ios:debug
```

이 명령은 다음 작업을 순서대로 수행한다.

1. 서버 전용 코드를 제외한 Next.js 정적 앱을 `out/`에 빌드한다.
2. 웹 산출물과 Capacitor 플러그인을 `ios/` 프로젝트에 동기화한다.
3. 코드 서명 없이 iOS Simulator용 Debug 앱을 빌드한다.

빌드 결과는 아래 경로에 생성된다.

```text
ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app
```

Xcode에서 실행하려면 다음 명령으로 프로젝트를 연 뒤 대상 Simulator를 선택한다.

```sh
pnpm cap:open:ios
```

## 권한과 개인정보 매니페스트

앱은 사용자가 위치 이용약관에 동의하고 직접 위치 기반 추천을 요청한 경우에만
포그라운드 위치 권한을 요청한다. `Info.plist`에는 Geolocation 플러그인이 요구하는
두 위치 사용 목적 문구를 선언한다. 백그라운드 위치 수집은 사용하지 않는다.

저널 이미지를 임시 파일로 공유할 때 Filesystem 플러그인을 사용하므로
`PrivacyInfo.xcprivacy`에 파일 타임스탬프 API의 승인 사유 `C617.1`을 선언한다.

## 실기기와 App Store 배포

Simulator 빌드에는 Apple Developer 계정이나 코드 서명이 필요하지 않다. 실기기
설치와 App Store 배포 전에는 Xcode의 App target에서 Team을 선택하고 Signing &
Capabilities를 설정해야 한다. App Store용 Archive 자동화는 배포 인증서와
프로비저닝 방식이 확정된 뒤 추가한다.
