import type { StateStorage } from "zustand/middleware";

// 버전마다 바꾸지 않는다. 1.4.1의 이전 세션 정리는 설치별로 한 번만 수행한다.
export const SESSION_RESET_MARKER = "tuti-session-reset-1.4.1";
export function createSessionReset(storage: StateStorage) {
  let pending: Promise<void> | undefined;
  let retryWrites = false;
  return () => pending ??= (async () => {
    if (!retryWrites && await storage.getItem(SESSION_RESET_MARKER) === "done") return;
    retryWrites = true;
    await storage.removeItem("tuti-session");
    await storage.removeItem("tuti-initial-terms-pending");
    // 중간 실패 시 완료로 표시하지 않아 다음 실행에서 정리를 다시 시도한다.
    await storage.setItem(SESSION_RESET_MARKER, "done");
    retryWrites = false;
  })().catch(error => { pending = undefined; throw error; });
}
