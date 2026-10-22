import { PolicyDocument } from "@/features/legal/PolicyDocument";
import { getLegalPolicyRelease } from "@/shared/legal/policyRelease";

// 서버 렌더링의 초기 버전을 전달하고 앱에서는 운영 서버의 상태로 재확인한다.
// 기기 시계로 시행 여부를 판단하지 않는다.
export function EffectivePrivacyPolicyDocument() {
  return <PolicyDocument kind="privacy" initialRelease={getLegalPolicyRelease()} />;
}
