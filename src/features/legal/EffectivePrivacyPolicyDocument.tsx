"use client";

import { useSyncExternalStore } from "react";
import { LegalDocument } from "@/features/legal/LegalDocument";
import { privacyPolicy } from "@/shared/legal/privacyPolicy";
import {
  privacyPolicyFrom20261001,
} from "@/shared/legal/privacyPolicyUpdate";
import {
  PRIVACY_SECURITY_UPDATE_EFFECTIVE_AT,
  PRIVACY_SECURITY_UPDATE_PATH,
  privacyPolicyFrom20261010,
} from "@/shared/legal/privacyPolicySecurityUpdate";

const FIRST_UPDATE_AT = new Date("2026-10-01T00:00:00+09:00").getTime();
const SECURITY_UPDATE_AT = new Date("2026-10-10T00:00:00+09:00").getTime();

export function EffectivePrivacyPolicyDocument() {
  const stage = useSyncExternalStore(
    subscribeToPolicyStage,
    getPolicyStage,
    getServerPolicyStage,
  );

  if (stage === 2) {
    return <LegalDocument {...privacyPolicyFrom20261010} />;
  }

  const activePolicy = stage === 1 ? privacyPolicyFrom20261001 : privacyPolicy;
  return (
    <LegalDocument
      {...activePolicy}
      announcement={{
        title: "개인정보 처리방침 개정 안내",
        description: `${PRIVACY_SECURITY_UPDATE_EFFECTIVE_AT}부터 서비스 보호를 위한 가명 보안 식별정보 처리 내용이 추가됩니다.`,
        href: PRIVACY_SECURITY_UPDATE_PATH,
        linkLabel: "개정안 확인하기",
      }}
    />
  );
}

function getPolicyStage(): 0 | 1 | 2 {
  const now = Date.now();
  return now >= SECURITY_UPDATE_AT ? 2 : now >= FIRST_UPDATE_AT ? 1 : 0;
}

function getServerPolicyStage(): 0 {
  return 0;
}

function subscribeToPolicyStage(onStoreChange: () => void) {
  const now = Date.now();
  const nextBoundary = now < FIRST_UPDATE_AT
    ? FIRST_UPDATE_AT
    : now < SECURITY_UPDATE_AT
      ? SECURITY_UPDATE_AT
      : null;
  if (nextBoundary === null) return () => undefined;

  const timeout = window.setTimeout(
    onStoreChange,
    Math.min(nextBoundary - now + 100, 2_147_000_000),
  );
  return () => window.clearTimeout(timeout);
}
