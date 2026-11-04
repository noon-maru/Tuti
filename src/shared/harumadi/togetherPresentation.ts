import type { HarumadiTogether } from "../api/harumadiTogether";

export function harumadiTogetherPhase(data: HarumadiTogether) {
  if (!data.owner || data.participants.some(person => !person.owner)) return "together";
  return data.invites.length > 0 ? "waiting" : "invite";
}
