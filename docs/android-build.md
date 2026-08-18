# Android 빌드

Tuti Android 앱은 Next.js 정적 산출물을 Capacitor 네이티브 프로젝트에 복사한 뒤
Gradle로 APK 또는 AAB를 생성한다. NAS에는 Java와 Android SDK를 직접 설치하지
않고 `Dockerfile.android`로 고정한 전용 빌더를 사용한다.

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

## Release AAB 빌드

버전을 확인하고 서명된 AAB를 만드는 명령은 다음과 같다.

```sh
sudo -n /usr/local/sbin/tuti-android-release-build
```

명령은 운영 웹 빌드, Capacitor 동기화, Gradle `bundleRelease`, JAR 서명 검증과
SHA-256 출력을 순서대로 수행한다. 완성된 파일은 아래에 생성된다.

```text
android/app/build/outputs/bundle/release/app-release.aab
```

현재 첫 폐쇄 테스트 버전은 `versionCode 1`, `versionName 0.1.0`이다. Play Console에
AAB를 한 번이라도 올린 뒤에는 매 업로드마다 `versionCode`를 증가시켜야 한다.
정식 배포 시점의 표시 버전은 별개로 `1.0.0`을 사용할 수 있다.

최초 AAB를 Play Console 폐쇄 테스트 트랙에 올릴 때 Play App Signing을 활성화한다.
Google이 최종 앱 서명키를 관리하고, Tuti 키스토어는 이후 AAB의 업로드 키로 계속
사용한다. OAuth 공급자에는 필요에 따라 업로드 인증서와 Play App Signing 인증서의
SHA-1·SHA-256을 각각 등록한다.
