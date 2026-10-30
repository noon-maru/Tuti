// Daily activity is not a session boundary. Only real foreground activity calls this.
export type ActivityClock = { owner: string; sessionId: string; lastAt: number; day: number };
export function nextActivityClock(previous: ActivityClock | null, owner: string, now: number, uuid: () => string) {
  const day = Math.floor((now + 9 * 3_600_000) / 86_400_000);
  const newSession = !previous || previous.owner !== owner || now < previous.lastAt || now - previous.lastAt >= 30 * 60_000;
  return { clock: { owner, sessionId: newSession ? uuid() : previous!.sessionId, lastAt: now, day },
    newSession, newDay: newSession || previous?.day !== day };
}
