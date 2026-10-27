import type { WelcomeHarumadiOrigin } from "@/shared/tuti/welcomeHarumadi";

// 페이지 간 펼치기 애니메이션 좌표만 한 번 전달한다. URL·영구 저장소에는 남기지 않는다.
let pendingOrigin: WelcomeHarumadiOrigin | null = null;
export function setWelcomeHarumadiOrigin(origin: WelcomeHarumadiOrigin | null) { pendingOrigin = origin; }
export function getWelcomeHarumadiOrigin() { return pendingOrigin; }
export function takeWelcomeHarumadiOrigin() {
  const origin = pendingOrigin;
  pendingOrigin = null;
  return origin;
}
