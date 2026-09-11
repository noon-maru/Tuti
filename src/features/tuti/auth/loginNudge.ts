export type LoginNudgeReason = "journal_created" | "place_saved";

export const LOGIN_NUDGE_EVENT = "tuti:login-nudge";

export function requestLoginNudge(reason: LoginNudgeReason) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<LoginNudgeReason>(LOGIN_NUDGE_EVENT, { detail: reason }),
  );
}
