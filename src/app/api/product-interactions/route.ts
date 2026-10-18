import { authenticateUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { createPreflightResponse, isRequestOriginAllowed, withCors } from "@/server/http/cors";
import { normalizeProductInteraction } from "@/shared/api/productInteraction";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }
  try {
    const user = await authenticateUser(request);
    if (!user) return withCors(request, Response.json({ error: "사용자 확인이 필요해요." }, { status: 401 }));
    const input = normalizeProductInteraction(await request.json());
    if (!input) return withCors(request, Response.json({ error: "활동 기록 요청을 확인해주세요." }, { status: 400 }));

    // 클릭마다 별도 이벤트를 저장하되, 재전송은 같은 ID로 멱등 처리한다.
    await prisma.systemLog.upsert({
      where: { id: `interaction:${user.id}:${input.eventId}` },
      create: {
        id: `interaction:${user.id}:${input.eventId}`,
        level: "info",
        category: "product",
        action: input.action,
        message: input.action === "journal_book_purchase_clicked"
          ? "실물 기록집 구매 준비 중 안내를 열었습니다. 결제·주문은 발생하지 않았습니다."
          : "첫 화면 이용 행동을 기록했습니다.",
        actorUserId: user.id,
        metadata: { surface: input.surface, platform: input.platform },
      },
      update: {},
    });
    return withCors(request, Response.json({ recorded: true }, { status: 201 }));
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;
    if (!invalidJson) console.error("제품 선택 활동을 기록하지 못했습니다.", error);
    return withCors(request, Response.json({ error: "활동을 기록하지 못했어요." }, { status: invalidJson ? 400 : 500 }));
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
