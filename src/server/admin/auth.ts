import {
  authenticateUser,
  type AuthenticatedUser,
} from "@/server/auth/session";

type AdminAuthentication =
  | {
      ok: true;
      user: AuthenticatedUser;
    }
  | {
      ok: false;
      response: Response;
    };

export async function authenticateAdmin(
  request: Request,
): Promise<AdminAuthentication> {
  const user = await authenticateUser(request);

  if (!user) {
    return {
      ok: false,
      response: Response.json(
        { error: "관리자 로그인이 필요합니다." },
        { status: 401 },
      ),
    };
  }

  if (user.role !== "admin" || !user.account) {
    return {
      ok: false,
      response: Response.json(
        { error: "관리자 권한이 필요합니다." },
        { status: 403 },
      ),
    };
  }

  return { ok: true, user };
}
