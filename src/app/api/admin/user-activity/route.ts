import { authenticateAdmin } from "@/server/admin/auth";
import { writeSystemLog } from "@/server/admin/log";
import { prisma } from "@/server/db/prisma";
import { analyticsPeriod, normalizeAnalyticsDays } from "@/server/admin/analyticsScope";
import { readLifelogUsers } from "@/server/admin/lifelogUsers";
import { lifecycleId } from "@/shared/api/lifecycle";
import { createPreflightResponse, isRequestOriginAllowed, withCors } from "@/server/http/cors";

export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  const authentication = await authenticateAdmin(request);
  if (!authentication.ok) return withCors(request, authentication.response);
  const params = new URL(request.url).searchParams, cursor = params.get("cursor");
  if (cursor !== null && !lifecycleId(cursor)) return withCors(request, Response.json({ error: "목록 위치를 확인해주세요." }, { status: 400 }));
  try {
    const period = analyticsPeriod(normalizeAnalyticsDays(params.get("days") ?? "7"));
    return withCors(request, Response.json(await readLifelogUsers(period, cursor), { headers: { "Cache-Control": "private, no-store" } }));
  } catch {
    return withCors(request, Response.json({ error: "사용자 활동을 불러오지 못했어요." }, { status: 503 }));
  }
}

export async function PATCH(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }
  const authentication = await authenticateAdmin(request);
  if (!authentication.ok) return withCors(request, authentication.response);

  try {
    const body = (await request.json()) as { userId?: unknown; excluded?: unknown };
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!userId || typeof body.excluded !== "boolean") {
      return withCors(
        request,
        Response.json({ error: "분석 제외 설정을 확인해주세요." }, { status: 400 }),
      );
    }
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!target) {
      return withCors(request, Response.json({ error: "사용자를 찾지 못했습니다." }, { status: 404 }));
    }
    if (target.role === "admin" && body.excluded === false) {
      return withCors(
        request,
        Response.json({ error: "관리자 계정은 분석에 포함할 수 없습니다." }, { status: 409 }),
      );
    }

    await prisma.user.update({
      where: { id: userId },
      data: body.excluded
        ? {
            analyticsExcludedAt: new Date(),
            analyticsExclusionReason: "내부·QA 계정",
            analyticsExcludedByUserId: authentication.user.id,
          }
        : {
            analyticsExcludedAt: null,
            analyticsExclusionReason: null,
            analyticsExcludedByUserId: null,
          },
    });
    await writeSystemLog({
      category: "analytics",
      action: body.excluded ? "user.excluded" : "user.included",
      message: body.excluded
        ? "사용자를 실사용 분석에서 제외했습니다."
        : "사용자를 실사용 분석에 다시 포함했습니다.",
      actorUserId: authentication.user.id,
      targetType: "user",
      targetId: userId,
    });
    return withCors(request, Response.json({ updated: true }));
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      console.error("사용자 분석 분류를 변경하지 못했습니다.", error);
    }
    return withCors(
      request,
      Response.json({ error: "사용자 분석 분류를 변경하지 못했습니다." }, { status: 500 }),
    );
  }
}


export const OPTIONS = createPreflightResponse;
