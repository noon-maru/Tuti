"use client";

import { useEffect, useState } from "react";
import { fetchServiceTerms } from "@/lib/serviceTerms";
import { LegalDocument } from "@/features/legal/LegalDocument";
import type { ServiceTermsStatus } from "@/shared/legal/serviceTerms";
import { Button } from "@/shared/ui/buttons";

export function ServiceTermsPage() {
  const [state, setState] = useState<ServiceTermsStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [showUpcoming, setShowUpcoming] = useState(false);
  useEffect(() => {
    let disposed = false;
    void fetchServiceTerms(false).then((status) => { if (!disposed) setState(status); }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; };
  }, []);
  const release = showUpcoming ? state?.upcoming ?? state?.current : state?.current ?? state?.upcoming;
  return <LegalDocument
    title={release?.document.title ?? "Tuti 서비스 이용약관"}
    effectiveDate={release ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "long" }).format(new Date(release.effectiveAt)) : "미정"}
    summary={release?.document.summary ?? (failed ? "이용약관을 불러오지 못했어요. 연결을 확인한 뒤 새로고침해주세요." : state ? "현재 적용 중인 일반약관 원문이 없습니다. 개정 공고는 ‘약관·정책 개정 공고’에서 별도로 확인할 수 있어요." : "이용약관을 불러오고 있어요.")}
    documentNavigation={state?.current && state.upcoming ? <>
      <Button type="button" $tone="text" aria-pressed={!showUpcoming} onClick={() => setShowUpcoming(false)}>현재 시행 중</Button>
      <Button type="button" $tone="text" aria-pressed={showUpcoming} onClick={() => setShowUpcoming(true)}>시행 예정</Button>
    </> : undefined}
    sections={release ? [{ title: "중요 내용", paragraphs: release.document.importantTerms }, ...release.document.sections] : []}
    appendix={release ? [`문서 버전: ${release.version}`, `공고일: ${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "long" }).format(new Date(release.publishedAt))}`, "일반 이용약관 동의는 개인정보·위치정보·기록 공개에 관한 별도 동의를 대신하지 않습니다."] : []}
  />;
}
