export type PushPrivacyState = {
  status: "enabled" | "disabled" | "cleanup-pending";
  ownerId: string | null;
  serverCleanupRequired: boolean;
};

export class PushRegistrationCancelled extends Error {
  constructor() { super("알림 설정이 변경되어 등록을 중단했어요."); }
}

// 등록과 해제는 같은 큐를 사용한다. 철회 의도는 큐를 기다리지 않고 기록한다.
export function createPushPrivacyLifecycle(deps: {
  read: () => Promise<PushPrivacyState>;
  write: (state: PushPrivacyState) => Promise<void>;
  deleteServer: (ownerId: string | null) => Promise<void>;
  revokeNative: () => Promise<void>;
}) {
  let generation = 0;
  let pending = Promise.resolve();
  let suspended = false;
  const enqueue = <T>(operation: () => Promise<T>) => {
    const result = pending.catch(() => {}).then(operation);
    pending = result.then(() => {}, () => {});
    return result;
  };
  const assertCurrent = (expected: number) => {
    if (suspended || generation !== expected) throw new PushRegistrationCancelled();
  };
  const cleanup = async () => {
    const cleanupGeneration = generation;
    const state = await deps.read();
    const results = await Promise.allSettled([
      state.serverCleanupRequired ? deps.deleteServer(state.ownerId) : Promise.resolve(),
      deps.revokeNative(),
    ]);
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    if (cleanupGeneration === generation) {
      await deps.write({ status: "disabled", ownerId: null, serverCleanupRequired: false });
    }
  };
  return {
    enable(ownerId: string, register: (assertActive: () => void) => Promise<boolean>) {
      const expected = ++generation;
      suspended = false;
      return enqueue(async () => {
        assertCurrent(expected);
        if ((await deps.read()).status === "cleanup-pending") await cleanup();
        assertCurrent(expected);
        await deps.write({ status: "cleanup-pending", ownerId, serverCleanupRequired: true });
        try {
          const registered = await register(() => assertCurrent(expected));
          assertCurrent(expected);
          if (!registered) { await cleanup(); return false; }
          await deps.write({ status: "enabled", ownerId, serverCleanupRequired: true });
          assertCurrent(expected);
          return true;
        } catch (error) {
          // 준비 기록은 성공 처리 전까지 유지한다. 취소 뒤 도착한 토큰도 정리한다.
          await cleanup().catch(() => {});
          throw error;
        }
      });
    },
    sync(ownerId: string, register: (assertActive: () => void) => Promise<boolean>) {
      const expected = generation;
      return enqueue(async () => {
        assertCurrent(expected);
        const state = await deps.read();
        if (state.status !== "enabled") return false;
        const registered = await register(() => assertCurrent(expected));
        assertCurrent(expected);
        if (!registered) {
          await deps.write({ status: "cleanup-pending", ownerId, serverCleanupRequired: true });
          await cleanup();
          return false;
        }
        await deps.write({ status: "enabled", ownerId, serverCleanupRequired: true });
        assertCurrent(expected);
        return true;
      });
    },
    revoke(ownerId: string | null) {
      generation++;
      suspended = true;
      const saved = deps.read().then((state) => deps.write({
        status: "cleanup-pending", ownerId: ownerId ?? state.ownerId, serverCleanupRequired: true,
      }));
      // saved의 거절은 큐를 기다리는 동안에도 처리해 미처리 rejection을 만들지 않는다.
      void saved.catch(() => {});
      return enqueue(async () => { await saved; await cleanup(); });
    },
    async prepareAccountDeletion(ownerId: string) {
      generation++;
      suspended = true;
      await deps.write({ status: "cleanup-pending", ownerId, serverCleanupRequired: true });
    },
    finishAccountDeletion() {
      generation++;
      // 계정 삭제 API의 성공 응답을 확인한 뒤에만 서버 정리가 끝났다고 기록한다.
      const saved = deps.write({ status: "cleanup-pending", ownerId: null, serverCleanupRequired: false });
      void saved.catch(() => {});
      return enqueue(async () => { await saved; await cleanup(); });
    },
    recover() {
      return enqueue(async () => {
        const state = await deps.read();
        if (state.status === "cleanup-pending") { await cleanup(); return false; }
        return state.status === "enabled";
      });
    },
  };
}
