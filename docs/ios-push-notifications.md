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

내부 QA는 일반 활성화와 구분해 `APNS_PUSH_TEST_EMAILS`로 제한한다.
개발용 Xcode 직접 설치 앱이 개발 API를
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

일반 발송은 `APNS_PUSH_ENABLED`와 사용자 선택에 따르며 날짜만으로 자동 전환하지 않는다.
현행 방침과 시행 이력은 [법적 문서 안내](legal/README.md)를 따른다.
Apple 개인정보팀의 App Store 처리자 설명은 APNs 역할을 확정한 답변이 아니다.
APNs 처리 관계·계약·보관은 개발자 지원에 추가 확인할 대상으로 남기며 임의 고정 기간을 만들지 않는다.

## 등록·계정 삭제 정리

공통 클라이언트에서 등록·해제 요청을 직렬화하고 정리 대기를 영속 저장한다.
알림 해제는 서버 등록 삭제와 OS `unregisterForRemoteNotifications` 완료 뒤에만
완료로 기록한다. 계정 삭제 API 성공 후에도 현재 기기의 해제 실패는 별도 안내하고
다음 실행·앱 복귀·온라인 복귀에 재시도한다. 삭제 계정의 요청을 새 익명 계정으로
재전송하지 않는다. 기존 설치는 정리 후 알림을 다시 켜야 할 수 있다.

이 보호 코드는 네이티브 앱에 번들되므로 서버만 배포해서는 기존 설치가 바뀌지 않는다.
빌드 업로드 성공과 아래 실기기 회귀 시험 완료는 구분한다.
OS 등록 해제가 Apple의 기기 토큰·운영 로그·백업 자료 전체 삭제를 증명하지는 않는다.
개발자 앱 변경으로 다른 오프라인 기기의 OS 등록까지 해제할 수도 없다.
수신, 등록 중 해제, 오프라인 해제 후 복귀, 계정 삭제 후 재등록 없음, 재활성화를
실기기에서 확인한다.
