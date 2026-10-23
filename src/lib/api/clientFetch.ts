import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { apiUrl } from "./apiUrl";
import { CLIENT_PLATFORM_HEADER, CLIENT_PROTOCOL, CLIENT_PROTOCOL_HEADER, CLIENT_UPDATE_REQUIRED_EVENT, CLIENT_VERSION_HEADER } from "@/shared/api/clientProtocol";

let nativeVersion: Promise<string> | undefined;

export function clientRequestHeaders(input: HeadersInit | undefined, platform: string, version?: string) {
  const headers = new Headers(input);
  for (const name of [CLIENT_PROTOCOL_HEADER, CLIENT_PLATFORM_HEADER, CLIENT_VERSION_HEADER]) headers.delete(name);
  headers.set(CLIENT_PROTOCOL_HEADER, CLIENT_PROTOCOL);
  headers.set(CLIENT_PLATFORM_HEADER, platform);
  if (platform === "android" || platform === "ios") {
    if (!version) throw new Error("앱 버전을 확인하지 못했어요.");
    headers.set(CLIENT_VERSION_HEADER, version);
  }
  return headers;
}

// 1.4.1부터 현행 서버 규약만 사용한다. 구서버 협상·옛 약관 응답에 따른 재전송은 없다.
export async function clientFetch(input: string, init?: RequestInit) {
  const base = new URL(apiUrl(""), "https://tuti-relative.invalid");
  const target = new URL(input, base.origin);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) throw new Error("Tuti API 요청만 전송할 수 있어요.");
  const platform = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : "web";
  let version: string | undefined;
  if (platform === "android" || platform === "ios") {
    nativeVersion ??= App.getInfo().then(info => info.version).catch(error => { nativeVersion = undefined; throw error; });
    version = await nativeVersion;
  }
  const headers = clientRequestHeaders(init?.headers, platform, version);
  const response = await fetch(input, { ...init, headers });
  if (response.status === 426 && typeof window !== "undefined") {
    const body = await response.clone().json().catch(() => null);
    if (body?.code === "client_update_required") window.dispatchEvent(new CustomEvent(CLIENT_UPDATE_REQUIRED_EVENT, { detail: body }));
  }
  return response;
}
