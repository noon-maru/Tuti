import { LegalDocument } from "@/features/legal/LegalDocument";
import { privacyPolicyFrom20261010 } from "@/shared/legal/privacyPolicySecurityUpdate";

// 시행이 완료된 방침은 서버 HTML과 앱에서 동일하게 표시한다.
// 과거 방침을 먼저 렌더링하거나 기기 시계에 따라 되돌리지 않는다.
export function EffectivePrivacyPolicyDocument() {
  return <LegalDocument {...privacyPolicyFrom20261010} />;
}
