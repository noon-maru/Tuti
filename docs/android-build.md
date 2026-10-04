# Android 빌드

Tuti Android 앱은 Next.js 정적 산출물을 Capacitor 네이티브 프로젝트에 복사한 뒤
Gradle로 APK 또는 AAB를 생성한다. 운영용 Release AAB는 NAS의 서비스 자원과
분리하기 위해 GitHub Actions의 Linux runner에서 빌드한다. NAS의 전용 Docker
빌더는 개발용 Debug APK와 비상시 로컬 검증에만 사용한다.

## 저장소에 포함하는 항목

- `android/` 네이티브 프로젝트와 Gradle Wrapper
- `capacitor.config.ts`와 앱 아이콘·스플래시 원본
- `Dockerfile.android`, `docker-compose.android.yml`
- 빌드 명령과 문서

APK, AAB, Gradle 캐시, 복사된 웹 산출물, 로컬 SDK 경로와 키스토어는 Git에
포함하지 않는다. 릴리스 키스토어와 비밀번호는 NAS 외부에도 암호화해 백업한다.

## 최초 준비

운영 명령을 추가하거나 수정한 뒤 NAS 터미널에서 다시 설치한다.

```sh
sudo sh scripts/ops/install-tuti-operations.sh
```

Android 앱 식별자는 Android Application ID와 iOS Bundle ID 모두
`com.noonmaru.tuti`를 사용한다. 생성된 프로젝트는 Android API 36, 최소 API 24,
Android Gradle Plugin 8.13.0과 Gradle 8.14.3을 사용한다. 빌더는 JDK 21,
Android Platform 36과 Build Tools 35.0.0·36.0.0을 고정해 설치한다.

## Debug APK 빌드

```sh
sudo -n /usr/local/sbin/tuti-android-debug-build
```

명령은 다음 작업을 순서대로 수행한다.

1. 전용 Android 빌더 이미지를 생성하거나 갱신한다.
2. 잠금 파일을 기준으로 Node 의존성을 설치한다.
3. 서버 전용 소스를 제외하고 Next.js 앱을 `out/`에 정적으로 빌드한다.
4. Capacitor 플러그인과 웹 산출물을 Android 프로젝트에 동기화한다.
5. Gradle `assembleDebug`를 실행한다.

완성된 APK는 아래 경로에 생성된다.

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

### 개발 서버 푸시 테스트 APK

운영 FCM을 활성화하기 전 실기기 푸시를 검증할 때는 운영 API를 사용하는 기본
디버그 APK와 구분된 개발 빌드를 사용한다. 먼저 예시 파일을 복사한다.

```sh
cp .env.android.development.example .env.android.development
```

`.env.android.development`의 `NEXT_PUBLIC_API_BASE_URL`에는 휴대전화에서 접근할 수
있는 HTTPS 개발 API 주소를 넣는다. `localhost`, NAS 사설 IP와 평문 HTTP 주소는
허용하지 않는다. 이 파일은 비공개 환경 파일이므로 Git에 포함되지 않는다.

운영 명령을 다시 설치한 뒤 개발 모드로 빌드한다.

```sh
sudo sh scripts/ops/install-tuti-operations.sh
sudo -n /usr/local/sbin/tuti-android-debug-build --development
```

개발 서버의 `.env.development`에는 `FCM_PUSH_ENABLED=true`, 운영 서버에는 사전
고지 시행 전까지 `FCM_PUSH_ENABLED=false`를 유지한다. APK 출력 경로는 기본
디버그 빌드와 같으므로 어떤 환경으로 마지막 빌드했는지 기록하고 배포 파일을
혼동하지 않는다.

`out/`, Android 빌드 결과와 의존성 캐시는 재생성할 수 있으므로 다른 빌드 장비로
이전하지 않는다. 새 장비에서는 Git 저장소와 비공개 환경변수를 복원하고 동일한
Docker Compose 명령을 실행한다.

## 브랜드 에셋 변경

`assets/capacitor/`의 아이콘 또는 스플래시 원본을 변경했을 때만 아래 명령을
실행하고 생성된 네이티브 리소스를 검토해 커밋한다.

```sh
pnpm assets:generate
```

## 릴리스 서명 최초 설정

Google Play에 올리는 AAB는 Debug 인증서가 아니라 별도의 업로드 키로 서명한다.
최초 한 번 아래 명령을 실행한다.

```sh
sudo -n /usr/local/sbin/tuti-android-release-setup
```

명령은 256비트 임의 비밀번호와 RSA 4096비트 업로드 키를 자동 생성하고 인증서
지문을 출력한다. 비밀 파일은 저장소 밖의 아래 경로에만 둔다.

```text
/var/services/homes/Tutiadmin/.tuti-secrets/android/tuti-upload.jks
/var/services/homes/Tutiadmin/.tuti-secrets/android/release.env
```

두 파일은 NAS 장애에 대비해 외부의 암호화된 저장소에도 함께 백업한다. 공개 인증서
`tuti-upload-certificate.pem`은 Play Console에 업로드 키 등록 또는 재설정이 필요할
때 사용한다. setup 명령은 기존 키를 발견하면 덮어쓰지 않고 중단한다.

## GitHub Actions Release 빌드

운영용 서명 AAB와 실기기 설치용 APK는 `.github/workflows/android-release.yml`의 `Android Release`
워크플로에서 생성한다. 워크플로는 자동 실행하지 않으며, GitHub 저장소의
`Actions > Android Release > Run workflow`에서 빌드할 커밋 또는 태그를 선택해
수동 실행한다.

### GitHub Actions Secrets

저장소의 `Settings > Secrets and variables > Actions`에 다음 Repository secret
4개를 등록한다. 값은 로그나 저장소 파일에 기록하지 않는다.

| Secret | 값 |
| --- | --- |
| `TUTI_ANDROID_KEYSTORE_BASE64` | `tuti-upload.jks`를 Base64 한 줄로 인코딩한 값 |
| `TUTI_ANDROID_KEYSTORE_PASSWORD` | 기존 키스토어 비밀번호 |
| `TUTI_ANDROID_KEY_ALIAS` | 기존 업로드 키 별칭 |
| `TUTI_ANDROID_KEY_PASSWORD` | 기존 업로드 키 비밀번호 |

NAS에 보관된 키스토어를 Secret 값으로 변환할 때는 원문을 터미널에 출력하지 않고
권한이 제한된 임시 파일에 저장한 뒤 GitHub 입력란에 복사한다.

```sh
sudo sh -c 'umask 077; openssl base64 -A -in /var/services/homes/Tutiadmin/.tuti-secrets/android/tuti-upload.jks > /tmp/tuti-upload-jks.base64'
```

등록을 마친 뒤 임시 파일을 삭제한다.

```sh
sudo rm -f /tmp/tuti-upload-jks.base64
```

기존 `release.env`에 있는 나머지 세 값을 각 Secret에 동일하게 등록한다. 키스토어와
비밀번호 원본은 기존 암호화 백업을 계속 유지한다.

### 빌드 결과

워크플로는 아래 작업을 수행한다.

1. Node.js 24, pnpm 11.2.2, JDK 21과 Android API 36·NDK 29 설치
2. 앱 버전 일치 여부 검증
3. 운영 공개 설정으로 Next.js 정적 앱 및 Capacitor Android 프로젝트 생성
4. 업로드 키로 Release AAB와 APK 서명
5. AAB·APK 서명 및 네이티브 디버그 기호 포함 여부 검증
6. AAB, APK, `mapping.txt`, 빌드 정보와 SHA-256 체크섬을 Artifact로 보관
7. 실행 옵션이 켜져 있으면 Google Play 내부 테스트 트랙에 즉시 업로드

성공한 실행의 `Artifacts`에서 `tuti-<versionName>-<versionCode>` 파일을
내려받는다. GitHub Artifact 보관기간은 30일이므로 Play Console에 제출한 파일은
기존 암호화 릴리스 보관소에도 영구 보관한다.

워크플로 수동 실행 화면의 `Google Play 내부 테스트 트랙에 업로드`는 기본적으로
활성화되어 있다. 설치용 APK를 내부 검증할 때는 이 옵션을 해제한다. 자동
업로드에는 `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` Repository Secret과 Play Console의
Tuti 앱에 대한 테스트 트랙 출시 권한이 필요하다. Android 출시 노트는
`distribution/google-play/whatsnew/whatsnew-ko-KR`에서 읽으므로 버전을 올릴 때
`docs/release-notes.md`와 함께 갱신한다.

## NAS 로컬 Release AAB 빌드

GitHub Actions 장애 또는 워크플로 검증이 필요할 때만 기존 명령을 비상 수단으로
사용한다. 운영 서비스와 동시에 실행하면 메모리·스왑 압박이 발생할 수 있으므로
일상적인 릴리스 생성에는 사용하지 않는다.

버전을 확인하고 서명된 AAB를 만드는 명령은 다음과 같다.

```sh
sudo -n /usr/local/sbin/tuti-android-release-build
```

명령은 운영 웹 빌드, Capacitor 동기화, Gradle `bundleRelease`, JAR 서명 검증과
SHA-256 출력을 순서대로 수행한다. R8 코드 최적화·난독화와 미사용 리소스 축소는
해당 버전의 `android/app/build.gradle` 설정을 따르며, 네이티브 라이브러리에는
`SYMBOL_TABLE` 디버그 기호 생성을 요청한다. 완성된 작업 파일은 아래에 생성된다.

```text
android/app/build/outputs/bundle/release/app-release.aab
```

빌드가 성공하면 AAB, 같은 빌드에서 생성된 R8 `mapping.txt`와 두 파일의 체크섬을
저장소 밖의 아래 폴더에 함께 영구 보관한다. 네이티브 디버그 기호는 AAB의
`BUNDLE-METADATA/com.android.tools.build.debugsymbols`에 포함되며, 릴리스 명령은
네이티브 라이브러리가 있는데 이 기호가 누락된 빌드를 실패 처리한다. `mapping.txt`는
해당 버전의 난독화된 Java/Kotlin 충돌·ANR 스택을 복원할 때 사용하므로 다른 빌드의
파일로 덮어쓰면 안 된다.

```text
/var/services/homes/Tutiadmin/.tuti-releases/android/<versionName>-<versionCode>/
```

현재 릴리스 버전은 `versionCode 10`, `versionName 1.3.0`이다. R8 코드 축소와
난독화는 활성화하되, 위치 권한 회귀가 발생했던 Capacitor 코어 권한 브리지,
Geolocation 플러그인과 `IONGeolocationLib` 경계는 `proguard-rules.pro`에서
보존한다. 플러그인 경계만 보존한 1차 내부 테스트에서도 권한 요청 직후 종료가
재현되어, `BridgeActivity` 클래스 병합과 브리지 콜백 이름 변경까지 막도록 보존
범위를 넓혔다. 빌드 후 `scripts/verify-android-r8-mapping.sh`가 이 경계의 보존과
나머지 클래스의 실제 이름 변경을 함께 검증한다. 이전 회귀에서 R8과 동시에 켰던
리소스 축소는 원인을 분리하기 위해 현재 비활성화하며, 위치 권한 실기기 회귀가
통과한 뒤 별도 버전에서 활성화한다.

내부 테스트에서는 신규 설치 상태에서 위치 권한을 `앱 사용 중에만 허용`과
`대략적인 위치만 허용`으로 각각 확인하고, 권한 승인 직후 엔트리 완료·추천 카드
노출까지 진행한다. 이 검증을 통과하기 전에는 프로덕션 트랙으로 승격하지 않는다.
Play Console에 AAB를 한 번이라도 올린 뒤에는 매 업로드마다 `versionCode`를
증가시켜야 한다. 표시 버전이 같더라도 새 AAB를 업로드할 때는 versionCode를
반드시 올린다.

최초 AAB를 Play Console 폐쇄 테스트 트랙에 올릴 때 Play App Signing을 활성화한다.
Google이 최종 앱 서명키를 관리하고, Tuti 키스토어는 이후 AAB의 업로드 키로 계속
사용한다. OAuth 공급자에는 필요에 따라 업로드 인증서와 Play App Signing 인증서의
SHA-1·SHA-256을 각각 등록한다.
