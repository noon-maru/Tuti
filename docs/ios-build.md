# iOS 빌드

Tuti iOS 앱은 Next.js 정적 산출물을 Capacitor 네이티브 프로젝트에 복사한 뒤
Xcode로 빌드한다. 운영용 Release Archive는 개인 Mac의 로그인 세션에 의존하지
않도록 GitHub Actions의 macOS runner에서 생성한다. Capacitor 8의 기본값인
Swift Package Manager를 사용하므로 CocoaPods는 필요하지 않다.

## 빌드 환경

워크플로가 macOS·Xcode·Node·pnpm을 준비한다. 개인 Mac이나 로컬 앱 빌드용 env는
필요하지 않으며, 앱 번들의 공개 설정은 `.github/workflows/ios-release.yml`의 `env`에서 관리한다.
서명·업로드 비밀값은 Actions Secrets에만 등록한다. 로컬 빌드 예제는 제거했다.

## GitHub Actions Release Archive

운영용 iOS Archive는 `.github/workflows/ios-release.yml`의 `iOS Release`
워크플로에서 생성한다. 워크플로는 자동 실행하지 않으며, GitHub 저장소의
`Actions > iOS Release > Run workflow`에서 빌드할 커밋 또는 태그를 선택해
수동 실행한다.

`upload_to_app_store`의 기본값은 `false`다. 이 모드는 자동 서명된 Archive와
IPA만 생성하며 Apple에 빌드 번호를 등록하지 않는다. 서명 검증이 끝난 릴리스를
App Store Connect에 올릴 때만 값을 `true`로 선택한다. 심사 제출은 자동화하지
않고 App Store Connect에서 사람이 최종 확인한다.

### GitHub Actions Secrets

저장소의 `Settings > Secrets and variables > Actions`에 다음 Repository secret
3개를 등록한다. Apple ID 비밀번호나 2단계 인증 코드는 사용하지 않는다.

| Secret | 값 |
| --- | --- |
| `TUTI_ASC_KEY_ID` | App Store Connect API Key ID |
| `TUTI_ASC_ISSUER_ID` | App Store Connect Issuer ID |
| `TUTI_ASC_PRIVATE_KEY_BASE64` | `AuthKey_<KEY_ID>.p8`를 Base64로 인코딩한 값(호환을 위해 PEM 원문도 허용) |

`.p8` 파일은 App Store Connect에서 한 번만 내려받을 수 있다. 저장소에 커밋하거나
로그에 출력하지 않고 별도 암호화 백업을 유지한다. 키를 잃어버렸거나 노출한 경우
기존 키를 폐기하고 새 키와 Secret을 등록한다.

### 빌드와 업로드 결과

워크플로는 아래 작업을 수행한다.

1. macOS 26과 Xcode 26.6, Node.js 26.12.1(`.node-version`), pnpm 11.2.2 준비
2. 앱 버전 일치 여부 검증과 운영 공개 설정 기반 Capacitor iOS 동기화
3. App Store Connect API 키와 Xcode 자동 서명으로 Release Archive 생성
4. 버전·빌드 번호·번들 ID와 앱 코드 서명 검증
5. 기본 모드에서는 IPA 내보내기, 업로드 모드에서는 App Store Connect 전송
6. Archive, 선택적 IPA, 빌드 로그, 빌드 정보와 SHA-256 체크섬을 Artifact로 보관

성공한 실행의 `Artifacts`에서 `tuti-<version>-<buildNumber>` 파일을 내려받는다.
GitHub Artifact 보관기간은 30일이므로 App Store에 제출한 Archive는 기존 암호화
릴리스 보관소에도 영구 보관한다.

동일한 빌드 번호를 App Store Connect에 두 번 업로드할 수 없다. 업로드 실행 전
`CURRENT_PROJECT_VERSION`이 기존 업로드보다 큰지 확인한다. 워크플로는 저장소의
버전과 빌드 번호를 그대로 사용하며 자동으로 증가시키지 않는다.

## 버전과 프로젝트

2026-10-29 기준 저장소 버전은 `1.5.0 (14)`다. Actions에서 `pnpm app:version:verify`로
확인한다. 이미 업로드한 빌드 번호를 재사용하지 않으며 워크플로가 자동 증가시키지 않는다.
프로젝트·target·scheme·product는 `Tuti`다. Capacitor용 `ios/App/App.xcodeproj`는
실제 `Tuti.xcodeproj`로 연결되는 상대 심볼릭 링크이며 동기화 도구가 확인한다.

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

Archive와 App Store Connect 업로드는 GitHub Actions에서만 진행한다. 서명 설정과
Secrets를 확인하고, 업로드한 빌드는 TestFlight·실기기에서 검증한 뒤 별도로 심사 제출한다.
Actions 장애를 이유로 로컬 빌드로 우회하지 않는다.

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
`NEXT_PUBLIC_MADI_PUBLICATION_ENABLED=true`와
`NEXT_PUBLIC_MADI_PUBLICATION_AUDIENCE=public`으로 정식 포함한다. 일반
계정의 공개 요청은 기록 공개 운영정책 시행일인 2026년 10월 1일부터 허용한다.
앱의 `계정 및 데이터` 화면에서는 로그인 계정과 자동 생성된 익명 계정을 모두
직접 삭제할 수 있어야 한다.
