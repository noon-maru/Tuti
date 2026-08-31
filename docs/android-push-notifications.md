# Tuti Android 서버 푸시

Android 서버 푸시는 Capacitor Push Notifications와 Firebase Cloud Messaging
HTTP v1을 사용한다. 현재 첫 사용처는 사용자가 직접 남긴 1:1 문의의 답변
도착 알림이며 광고성·홍보성 메시지는 보내지 않는다.

## 자격증명

- 앱 설정: `android/app/google-services.json`
- 서버 서비스 계정:
  `/var/services/homes/Tutiadmin/.tuti-secrets/firebase/tuti-push-sender.json`
- 컨테이너 내부 경로:
  `/run/secrets/tuti-firebase-service-account.json`
- 서버 활성화 환경변수: `FCM_PUSH_ENABLED=true`

서비스 계정 파일은 Git, 앱 번들, Docker 이미지에 포함하지 않는다. 호스트에서는
`root:administrators`, 디렉터리 `0750`, 파일 `0640`으로 보관한다. 개발·운영
컨테이너에는 읽기 전용으로 마운트하고 `administrators`의 숫자 GID만 추가한다.

## 사용자 흐름

1. Android 앱의 `알림 설정`에서 `문의 답변`을 직접 활성화
2. 운영체제 알림 권한 확인 후 FCM 토큰 발급
3. Preferences에 생성한 설치 식별값과 토큰을 현재 Tuti 사용자에게 연결
4. 로그인·로그아웃으로 세션 사용자가 바뀌면 같은 설치를 새 사용자에게 재연결
5. 관리자가 문의 답변을 새로 저장하면 해당 사용자의 활성 Android 기기에 전송
6. 알림 선택 시 `/inquiry?view=history`로 이동
7. 사용자가 알림을 끄면 서버 연결과 FCM 토큰을 함께 해제

계정 삭제 시 외래키 cascade로 기기 정보도 삭제된다. FCM이 만료된 토큰을
`UNREGISTERED`로 응답하면 해당 기기를 자동으로 비활성화한다. 발송 오류는 문의
답변 저장을 취소하지 않으며 원문 토큰이나 서비스 계정 내용은 로그에 남기지 않는다.

## Android 채널

- ID: `tuti_service_updates`
- 이름: `Tuti 소식`
- 중요도: 기본
- 작은 아이콘: `tuti_notification_icon`
- 강조색: brand 500 `#8CBDEF`

## 실기기 확인

1. 새 디버그 APK 설치
2. 메인 메뉴의 `알림 설정`에서 `문의 답변` 활성화
3. 시스템 알림 권한 허용
4. 개발 DB `push_devices`에 현재 설치 1건이 연결됐는지 확인
5. 같은 사용자로 문의를 남기고 관리자 화면에서 답변 및 `답변 완료` 저장
6. 앱이 전면·백그라운드·종료된 상태에서 각각 알림 표시 확인
7. 알림 선택 시 내 문의 탭과 답변 표시 확인
8. 설정을 끈 뒤 같은 문의를 다시 수정해도 알림이 오지 않는지 확인
9. 로그아웃·다른 계정 로그인·앱 재설치 후 잘못된 계정으로 발송되지 않는지 확인

운영 배포 전 개인정보 처리방침의 Firebase Cloud Messaging 처리 항목을 다시
검토하고, 광고성 알림을 추가할 경우 서비스 알림과 분리된 명시적 사전 동의 및
간편한 수신거부 절차를 별도로 구현한다.

개인정보 처리방침 변경 초안에는 다음 내용을 포함한다.

- 처리 항목: 앱 설치 식별값, FCM 토큰, 플랫폼, 앱 버전, 언어, 활성화·갱신·무효화 시각
- 처리 목적: 사용자가 요청한 문의 답변 도착 안내
- 외부 서비스: Google Firebase Cloud Messaging
- 외부 전달 항목: 푸시 토큰, 알림 제목·본문, 앱 내부 이동 경로
- 보유기간: 알림 해제·계정 삭제 또는 토큰 무효화 시까지
- 이용자 통제: 앱 설정에서 로그인 없이 즉시 해제

현재 개인정보 처리방침은 중요한 변경을 시행 30일 전부터 알리도록 정하고
있으므로 고지 일정과 국외 처리·위탁 문구를 확정하기 전에는 운영 환경의
`FCM_PUSH_ENABLED`를 `false`로 유지한다.
