// 앱·웹 중복 수신 정책을 정하기 전까지 웹/PWA의 사용자 활성화 경로를 보류한다.
// 브라우저 지원 판별·구독 해제 코드는 유지하고 신규 등록과 자동 갱신만 막는다.
export const WEB_PUSH_USER_ENABLED = false;

export function notificationSettingsAvailable(environment: string) {
  return environment === "native" || (WEB_PUSH_USER_ENABLED && environment === "supported");
}
