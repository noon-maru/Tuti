import type { Harumadi } from "../api/harumadi";

/** Viewer-relative display metadata only: never expose account IDs or email addresses. */
export function makeHarumadiAudience(viewerId: string, people: { userId: string; displayName: string | null }[]) {
  const others = people.filter(person => person.userId !== viewerId);
  return { count: others.length, names: others.map(person => person.displayName?.trim() ?? "").filter(Boolean).slice(0, 1) };
}

type SharedBook = Pick<Harumadi, "shared" | "sharingAudience">;
function audienceName(book: SharedBook) {
  const audience = book.sharingAudience;
  if (!audience || audience.count < 1) return null;
  const name = audience.names[0]?.trim();
  return name ? `${name}님${audience.count > 1 ? ` 외 ${audience.count - 1}명` : ""}` : `${audience.count}명`;
}

export function harumadiSharingLabel(book: SharedBook) {
  if (!book.shared) return null;
  if (book.sharingAudience?.count === 0) return "아직 나만 참여 중";
  const name = audienceName(book);
  return name ? `${name}과 함께` : "함께 채우는 중";
}

export function harumadiSharingNotice(book: SharedBook) {
  if (!book.shared) return "나만 보는 하루마디에 담아요.";
  if (book.sharingAudience?.count === 0) return "참여자가 생기면 이 마디도 함께 보여요.";
  const name = audienceName(book);
  return name ? `${name}에게 보여요.` : "함께 채우는 사람들에게 보여요.";
}
