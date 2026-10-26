import { acceptInitialServiceTerms, type InitialTermsState } from "@/lib/initialServiceTerms";
import { getSessionSnapshot } from "@/lib/auth/session";
import { updateLocationConsent } from "@/lib/tutiApi";
import { getLocationTermsVersion } from "@/shared/location/terms";
import type { ServiceTermsOffer } from "@/shared/legal/serviceTerms";

export async function submitInitialConsents(
  offer: ServiceTermsOffer,
  confirmations: { ageConfirmed: boolean; importantTermsConfirmed: boolean },
  locationAccepted: boolean,
): Promise<{ state: InitialTermsState; locationError?: string }> {
  const state = await acceptInitialServiceTerms(offer, confirmations);
  if (!locationAccepted) return { state };
  if (!state.userId || getSessionSnapshot()?.userId !== state.userId) throw new Error("계정이 변경되었어요. 현재 계정에서 다시 확인해주세요.");
  try {
    // 일반약관과 위치 동의는 별도로 기록한다. 기기 권한 요청·좌표 수집은 하지 않는다.
    await updateLocationConsent("accepted", confirmations.ageConfirmed, getLocationTermsVersion(), state.userId);
    return { state };
  } catch {
    if (getSessionSnapshot()?.userId !== state.userId) throw new Error("계정이 변경되었어요. 현재 계정에서 다시 확인해주세요.");
    return { state, locationError: "필수 동의는 저장했지만 위치 동의는 저장하지 못했어요. 위치 없이 시작하고, 위치가 필요할 때 다시 확인할게요." };
  }
}
