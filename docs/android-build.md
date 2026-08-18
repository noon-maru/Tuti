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

## 릴리스 빌드

현재 단계에서는 서명되지 않은 Debug APK만 만든다. Debug APK의 위치 권한,
API 통신, 공유, Preferences, OAuth 딥링크와 Android 뒤로가기를 실기기에서
검증한 뒤 업로드 키스토어와 Play App Signing을 구성하고 `bundleRelease`를
추가한다.
