export type HarumadiParticipant = { userId: string; name: string; owner: boolean };
export type HarumadiInviteItem = { id: string; expiresAt: string; acceptedAt: string | null; revokedAt: string | null };
export type HarumadiTogether = { owner: boolean; participants: HarumadiParticipant[]; invites: HarumadiInviteItem[] };
export type HarumadiComment = { id: string; authorId: string | null; authorName: string; parentId: string | null;
  body: string; revision: number; createdAt: string; updatedAt: string; deleted: boolean; canEdit: boolean; canDelete: boolean };
export const HARUMADI_COMMENT_LIMIT = 1000;
export const INVITE_TOKEN = /^[A-Za-z0-9_-]{43}$/;
export function harumadiInviteUrl(token: string, apiBase: string, localOrigin: string) {
  if (!INVITE_TOKEN.test(token)) throw new Error("초대 링크를 확인해주세요.");
  const origin = new URL(apiBase, localOrigin).origin;
  const url = new URL("/harumadi/invite", origin === "null" ? "https://tuti.today" : origin);
  url.hash = token;
  return url.toString();
}
export function harumadiInviteShareContent(url: string) {
  // 공유 대상마다 text와 url을 합치는 순서·구분자가 달라 초대 토큰이 오염될 수 있다.
  // URL을 별도 필드로 보내지 않고 안내 뒤 한 본문에 담아 경계를 고정한다.
  return { title: "하루마디 함께 채우기", text: `각자의 순간을 하나의 하루마디에 담아보세요.\n\n${url}` };
}
export function parseTogetherComment(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.body !== "string" || !input.body.trim() || input.body.length > HARUMADI_COMMENT_LIMIT ||
    (input.parentId !== undefined && input.parentId !== null && (typeof input.parentId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(input.parentId)))) return null;
  return { body: input.body.trim(), parentId: typeof input.parentId === "string" ? input.parentId : null };
}
