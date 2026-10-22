// 앱 표시 버전과 별개인 API 계약. 이 규약을 보내지 않는 기존 바이너리는 지원하지 않는다.
export const CLIENT_PROTOCOL = "2026-10-22";
export const CLIENT_PROTOCOL_HEADER = "X-Tuti-Client-Protocol";
export const CLIENT_PLATFORM_HEADER = "X-Tuti-Client-Platform";
export const CLIENT_VERSION_HEADER = "X-Tuti-Client-Version";
export const CLIENT_UPDATE_REQUIRED_EVENT = "tuti:client-update-required";

export type ClientUpdateRequired = {
  code: "client_update_required";
  error: string;
  platform: "android" | "ios" | "web" | null;
  storeUrl: string | null;
};
