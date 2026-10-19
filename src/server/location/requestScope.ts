import { AsyncLocalStorage } from "node:async_hooks";

type Scope = { controller: AbortController; memo: Map<string, Promise<unknown>> };
const storage = new AsyncLocalStorage<Scope>();
const active = new Map<string, Set<Scope>>();

// 좌표/경로를 프로세스 공용 캐시에 보관하지 않는다. 중복 계산은 한 요청 안에서만 합친다.
export async function withLocationRequestScope<T>(userId: string, operation: () => Promise<T>) {
  const scope: Scope = { controller: new AbortController(), memo: new Map() };
  const scopes = active.get(userId) ?? new Set<Scope>();
  scopes.add(scope);
  active.set(userId, scopes);
  try { return await storage.run(scope, operation); }
  finally {
    scope.controller.abort();
    scope.memo.clear();
    scopes.delete(scope);
    if (!scopes.size && active.get(userId) === scopes) active.delete(userId);
  }
}

export function cancelLocationRequests(userId: string) {
  for (const scope of active.get(userId) ?? []) {
    scope.controller.abort();
    scope.memo.clear();
  }
}

export function locationRequestSignal(timeoutMs: number) {
  const scope = storage.getStore();
  const timeout = AbortSignal.timeout(timeoutMs);
  return scope ? AbortSignal.any([scope.controller.signal, timeout]) : timeout;
}

export function memoizeLocationRequest<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const scope = storage.getStore();
  if (!scope) return operation();
  scope.controller.signal.throwIfAborted();
  const existing = scope.memo.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const result = operation().catch((error) => {
    if (scope.memo.get(key) === result) scope.memo.delete(key);
    throw error;
  });
  scope.memo.set(key, result);
  return result;
}
