import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { apiUrl } from "./apiUrl";
import { CLIENT_PLATFORM_HEADER, CLIENT_PROTOCOL, CLIENT_PROTOCOL_HEADER, CLIENT_UPDATE_REQUIRED_EVENT, CLIENT_VERSION_HEADER } from "@/shared/api/clientProtocol";

let nativeVersion: Promise<string> | undefined;

// Tuti API 전용. 외부 사진/지도 등으로 인증·실행 환경 헤더를 전달하지 않는다.
export async function clientFetch(input: string, init?: RequestInit) {
  const base = new URL(apiUrl(""), "https://tuti-relative.invalid");
  const target = new URL(input, base.origin);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) throw new Error("Tuti API 요청만 전송할 수 있어요.");
  const headers = new Headers(init?.headers);
  headers.set(CLIENT_PROTOCOL_HEADER, CLIENT_PROTOCOL);
  const platform = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : "web";
  headers.set(CLIENT_PLATFORM_HEADER, platform);
  if (platform === "android" || platform === "ios") {
    nativeVersion ??= App.getInfo().then(info => info.version).catch(error => { nativeVersion = undefined; throw error; });
    headers.set(CLIENT_VERSION_HEADER, await nativeVersion);
  } else headers.delete(CLIENT_VERSION_HEADER);
  const response = await fetch(input, { ...init, headers });
  if (response.status === 426 && typeof window !== "undefined") {
    const body = await response.clone().json().catch(() => null);
    if (body?.code === "client_update_required") window.dispatchEvent(new CustomEvent(CLIENT_UPDATE_REQUIRED_EVENT, { detail: body }));
  }
  return response;
}
