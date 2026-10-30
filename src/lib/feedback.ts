export type ConfirmationOptions = { title?: string; confirmLabel?: string; tone?: "neutral" | "danger" };
export type FeedbackSnapshot = {
  confirmation: ({ id: number; message: string } & ConfirmationOptions) | null;
  toast: { id: number; message: string; tone: "info" | "error" } | null;
};
const EMPTY: FeedbackSnapshot = { confirmation: null, toast: null };

/** Memory-only UI requests. No text, account identifiers or decisions are persisted. */
export function createFeedbackController() {
  let snapshot = EMPTY, sequence = 0;
  let runtime: { scope: () => string } | null = null;
  let pending: { id: number; scope: string; resolve: (accepted: boolean) => void } | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: FeedbackSnapshot) => { snapshot = next; listeners.forEach(listener => listener()); };
  const cancelConfirmation = () => {
    const request = pending; pending = null;
    if (snapshot.confirmation) publish({ ...snapshot, confirmation: null });
    request?.resolve(false);
  };
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => EMPTY,
    attach(scope: () => string) {
      const current = { scope }; runtime = current;
      return () => { if (runtime === current) { runtime = null; cancelConfirmation(); publish(EMPTY); } };
    },
    confirm(message: string, options: ConfirmationOptions = {}) {
      // No host or another pending decision: fail closed, never queue destructive actions.
      if (!runtime || pending) return Promise.resolve(false);
      const id = ++sequence, scope = runtime.scope();
      return new Promise<boolean>(resolve => {
        pending = { id, scope, resolve };
        publish({ ...snapshot, confirmation: { ...options, id, message } });
      });
    },
    answer(id: number, accepted: boolean) {
      if (!pending || pending.id !== id) return;
      const request = pending;
      const valid = Boolean(runtime && runtime.scope() === request.scope);
      pending = null;
      publish({ ...snapshot, confirmation: null });
      request.resolve(accepted && valid);
    },
    cancelConfirmation,
    notify(message: string, tone: "info" | "error" = "info") {
      if (!runtime) return;
      publish({ ...snapshot, toast: { id: ++sequence, message, tone } });
    },
    dismissToast(id: number) { if (snapshot.toast?.id === id) publish({ ...snapshot, toast: null }); },
    reset() { cancelConfirmation(); publish(EMPTY); },
  };
}
export const feedback = createFeedbackController();
export const confirmAction = (message: string, options?: ConfirmationOptions) => feedback.confirm(message, options);
export const showToast = (message: string) => feedback.notify(message);
export const showErrorToast = (message: string) => feedback.notify(message, "error");
