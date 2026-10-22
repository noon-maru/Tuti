import { createPreflightResponse, isRequestOriginAllowed, withCors } from "@/server/http/cors";
import { sensitiveJournalPolicyEnabled } from "@/server/journal/sensitivePolicy";
import { SENSITIVE_JOURNAL_CONSENT_VERSION } from "@/shared/legal/sensitiveJournalPolicy";
import { privacyReplayEnabled } from "@/server/legal/privacyReplayLedger";

export function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  const enabled = sensitiveJournalPolicyEnabled();
  return withCors(request, Response.json({ enabled, privateStorageAvailable: enabled && privacyReplayEnabled(), version: SENSITIVE_JOURNAL_CONSENT_VERSION }, { headers: { "Cache-Control": "no-store" } }));
}
export function OPTIONS(request: Request) { return createPreflightResponse(request); }
