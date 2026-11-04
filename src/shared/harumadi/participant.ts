import type { HarumadiParticipant } from "../api/harumadiTogether";

export function makeHarumadiParticipant(userId: string, displayName: string | null, owner: boolean): HarumadiParticipant {
  const name = displayName?.trim() ?? "";
  // Keep the existing string field for installed clients, but distinguish the
  // role fallback from a real account display name in new screens.
  return { userId, name: name || (owner ? "만든 사람" : "함께하는 사람"), owner, nameAvailable: Boolean(name) };
}

export function harumadiParticipantIdentity(person: HarumadiParticipant, viewerId: string) {
  const self = person.userId === viewerId;
  const named = person.nameAvailable !== false && Boolean(person.name.trim());
  return {
    name: named ? person.name.trim() : self ? "나" : "이름 미설정",
    showSelf: self && named,
    role: person.owner ? "만든 사람" : "참여자",
  };
}
