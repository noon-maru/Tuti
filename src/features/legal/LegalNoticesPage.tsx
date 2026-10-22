"use client";

import { useEffect, useState } from "react";
import { LegalDocument } from "./LegalDocument";
import { fetchLegalDocumentNotices } from "@/lib/legalDocumentNotices";
import { LEGAL_DOCUMENT_LABELS, type LegalDocumentNotice, type LegalDocumentType } from "@/shared/legal/documentNotice";
import { Button } from "@/shared/ui/buttons";

const date = (value: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "long" }).format(new Date(value));

export function LegalNoticesPage() {
  const [notices, setNotices] = useState<LegalDocumentNotice[] | null>(null);
  const [selected, setSelected] = useState<LegalDocumentType>("service-terms");
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    void fetchLegalDocumentNotices().then(rows => {
      if (disposed) return;
      setNotices(rows); setFailed(false);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; };
  }, [attempt]);
  const notice = notices?.find(row => row.documentType === selected) ?? notices?.[0];
  return <LegalDocument
    title={notice ? `${LEGAL_DOCUMENT_LABELS[notice.documentType]} 개정 공고` : "약관·정책 개정 공고"}
    dateLabel="시행 예정일"
    effectiveDate={notice ? date(notice.plannedEffectiveAt) : "—"}
    summary={notice?.document.summary ?? (failed ? "개정 공고를 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해주세요." : notices ? "현재 공고된 개정 문서가 없습니다." : "개정 공고를 확인하고 있어요.")}
    documentNavigation={<>
      {notices?.map(row => <Button key={row.documentType} type="button" $tone="text" aria-pressed={row.documentType === notice?.documentType} onClick={() => setSelected(row.documentType)}>{LEGAL_DOCUMENT_LABELS[row.documentType]}</Button>)}
      {failed && <Button type="button" onClick={() => setAttempt(value => value + 1)}>다시 확인하기</Button>}
    </>}
    sections={notice ? [{ title: "적용 대상과 전환 안내", paragraphs: [notice.applicationPolicy, "이 페이지는 공고 원문입니다. 원문 열람은 동의가 아니며, 현재 시행 문서와 별도로 표시합니다."] }, { title: "중요 내용", paragraphs: notice.document.importantTerms }, ...notice.document.sections] : []}
    appendix={notice ? [`공고일: ${date(notice.publishedAt)}`, `문서 버전: ${notice.version}`, `원문 확인값: ${notice.documentHash}`, "일반약관 동의는 위치·민감정보·국외 이전 등에 필요한 별도 동의를 대신하지 않습니다."] : []}
  />;
}
