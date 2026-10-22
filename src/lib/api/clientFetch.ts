import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { apiUrl } from "./apiUrl";
import { CLIENT_PLATFORM_HEADER, CLIENT_PROTOCOL, CLIENT_PROTOCOL_HEADER, CLIENT_UPDATE_REQUIRED_EVENT, CLIENT_VERSION_HEADER } from "@/shared/api/clientProtocol";

let nativeVersion: Promise<string> | undefined;
const protocolSupport = new Map<string, Promise<boolean>>();

function readProtocolSupport(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("서버 호환 상태를 확인하지 못했어요.");
  const data = value as Record<string, unknown>;
  if (data.clientProtocol === CLIENT_PROTOCOL) return true;
  if (!("clientProtocol" in data) && !("enforcementEnabled" in data) && data.current === null && data.upcoming === null && data.required === false) return false;
  throw new Error("서버 호환 상태를 확인하지 못했어요.");
}

// 구서버의 CORS 허용 목록에는 새 헤더가 없다. 계정 없는 조회로 지원 여부를 먼저 협상한다.
function supportsProtocol(base: URL) {
  let pending = protocolSupport.get(base.href);
  if (!pending) {
    pending = fetch(apiUrl("service-terms"), { cache: "no-store", signal: AbortSignal.timeout(10_000) }).then(async response => {
      if (!response.ok) throw new Error("서버 호환 상태를 확인하지 못했어요.");
      return readProtocolSupport(await response.json());
    }).catch(error => { protocolSupport.delete(base.href); throw error; });
    protocolSupport.set(base.href, pending);
  }
  return pending;
}

// Tuti API 전용. 외부 사진/지도 등으로 인증·실행 환경 헤더를 전달하지 않는다.
export async function clientFetch(input: string, init?: RequestInit) {
  const base = new URL(apiUrl(""), "https://tuti-relative.invalid");
  const target = new URL(input, base.origin);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) throw new Error("Tuti API 요청만 전송할 수 있어요.");
  const crossOrigin = Capacitor.isNativePlatform() || (typeof window !== "undefined" && target.origin !== window.location.origin);
  const bootstrap = target.pathname.replace(/\/+$/, "") === new URL(apiUrl("service-terms"), base.origin).pathname ||
    target.pathname.replace(/\/+$/, "") === new URL(apiUrl("app-update"), base.origin).pathname;
  let useProtocol = !crossOrigin || (!bootstrap && await supportsProtocol(base));
  const platform = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : "web";
  const send = async () => {
    const headers = new Headers(init?.headers);
    for (const name of [CLIENT_PROTOCOL_HEADER, CLIENT_PLATFORM_HEADER, CLIENT_VERSION_HEADER]) headers.delete(name);
    if (useProtocol) {
      headers.set(CLIENT_PROTOCOL_HEADER, CLIENT_PROTOCOL);
      headers.set(CLIENT_PLATFORM_HEADER, platform);
      if (platform === "android" || platform === "ios") {
        nativeVersion ??= App.getInfo().then(info => info.version).catch(error => { nativeVersion = undefined; throw error; });
        headers.set(CLIENT_VERSION_HEADER, await nativeVersion);
      }
    }
    return fetch(input, { ...init, headers });
  };
  let response = await send();
  // 구서버를 사용하던 앱이 열린 채로 서버가 전환돼도, 처리 전 거절된 요청만 한 번 재협상한다.
  if (crossOrigin && !bootstrap && !useProtocol && response.status === 426 &&
      (await response.clone().json().catch(() => null))?.code === "client_update_required" &&
      !(typeof ReadableStream !== "undefined" && init?.body instanceof ReadableStream)) {
    protocolSupport.delete(base.href);
    useProtocol = await supportsProtocol(base);
    if (useProtocol) response = await send();
  }
  if (response.status === 426 && typeof window !== "undefined") {
    const body = await response.clone().json().catch(() => null);
    if (body?.code === "client_update_required") window.dispatchEvent(new CustomEvent(CLIENT_UPDATE_REQUIRED_EVENT, { detail: body }));
  }
  return response;
}
