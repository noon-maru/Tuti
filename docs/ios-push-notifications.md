# Tuti iOS 서버 푸시

iOS 문의 답변 알림은 Capacitor Push Notifications에서 발급받은 APNs 기기
토큰을 Tuti 서버에 등록하고, 서버가 Apple Push Notification service HTTP/2
API로 직접 발송한다. Firebase iOS SDK는 추가하지 않는다.

## Apple 설정

- App ID: `com.noonmaru.tuti`
- App ID capability: Push Notifications
- Xcode capability: Push Notifications
- 앱 이전 후 현재 소유자 팀에서 새로 발급한 APNs `.p8` 인증키 사용
- Xcode 직접 설치: APNs sandbox
- TestFlight·App Store: APNs production

앱 이전 전 소유자의 APNs 키를 사용하지 않는다. `.p8` 파일은 Git, 앱 번들,
Docker 이미지에 포함하지 않고 서버 비공개 폴더에서만 관리한다.

## 서버 자격증명

호스트 기본 경로:

```text
/var/services/homes/Tutiadmin/.tuti-secrets/apple/tuti-apns-auth-key.p8
```

환경변수:

```dotenv
APNS_PUSH_ENABLED=false
APNS_PUSH_TEST_EMAILS=admin@tuti.today
APNS_TEAM_ID=
APNS_KEY_ID=
APNS_BUNDLE_ID=com.noonmaru.tuti
APNS_ENVIRONMENT=production
APNS_PRIVATE_KEY_HOST_PATH=/var/services/homes/Tutiadmin/.tuti-secrets/apple/tuti-apns-auth-key.p8
```

시행 전에는 `APNS_PUSH_ENABLED=false`를 유지하고 내부 QA 계정만
`APNS_PUSH_TEST_EMAILS`에 등록한다. 개발용 Xcode 직접 설치 앱이 개발 API를
사용한다면 개발 서버의 `APNS_ENVIRONMENT=sandbox`로 설정한다. TestFlight와
App Store 빌드는 `production`을 사용한다.

## 사용자 흐름

1. iOS 앱 알림 설정에서 문의 답변 알림 직접 활성화
2. iOS 알림 권한 허용 후 APNs 토큰 발급
3. 설치 식별값·플랫폼·토큰을 현재 로그인 계정에 연결
4. 관리자가 문의 답변을 저장하면 활성 iOS 기기에 APNs 알림 발송
5. 알림 선택 시 `/inquiry?view=history`로 이동
6. 알림을 끄면 서버 연결 삭제와 APNs 등록 해제

잠금 화면에 문의 제목·본문·답변 내용은 표시하지 않는다. APNs에는 일반화된
답변 도착 문구와 인증 후 이동할 앱 내부 경로만 전달한다. 만료되거나 Bundle ID와
일치하지 않는 토큰은 자동으로 비활성화한다.

## 실기기 확인

1. `pnpm ios:sync` 후 Xcode에서 새 빌드 설치
2. Signing & Capabilities에서 Push Notifications 표시 확인
3. 앱 알림 설정에서 문의 답변 알림 활성화 및 시스템 권한 허용
4. 개발 또는 운영 DB `push_devices`에 `platform=ios` 등록 확인
5. 문의 답변 저장 후 전면·백그라운드·종료 상태 수신 확인
6. 알림 선택 시 내 문의 답변 화면 이동 확인
7. 알림 해제, 로그아웃·재로그인, 재설치 후 잘못된 계정 발송 여부 확인

일반 사용자 대상 발송은 개인정보 처리방침 개정 시행일인 2026년 10월 1일
이후 운영 점검을 마친 뒤 `APNS_PUSH_ENABLED=true`로 전환한다.
