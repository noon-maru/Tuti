"use client";

import styled from "@emotion/styled";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/features/tuti/hooks/useSession";
import { Button } from "@/shared/ui/buttons";
import { fetchServiceTerms, SERVICE_TERMS_REQUIRED_EVENT, submitServiceTerms } from "@/lib/serviceTerms";
import { getSessionSnapshot } from "@/lib/auth/session";
import type { ServiceTermsOffer } from "@/shared/legal/serviceTerms";

export function ServiceTermsNotice() {
  const session = useSession();
  // 계정별 key가 바뀌면 확인 체크와 이전 계정 응답도 함께 폐기한다.
  return session ? <AccountTermsNotice key={session.userId} userId={session.userId} /> : null;
}

function AccountTermsNotice({ userId }: { userId: string }) {
  const [offer, setOffer] = useState<ServiceTermsOffer | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [importantTermsConfirmed, setImportantTermsConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offerKey = useRef("");
  const generation = useRef(0);

  const refresh = useCallback(async (force = false) => {
    const requestGeneration = ++generation.current;
    try {
      const status = await fetchServiceTerms();
      if (getSessionSnapshot()?.userId !== userId || generation.current !== requestGeneration) return;
      const next = status.required ? status.current : status.upcoming && !status.upcoming.accepted ? status.upcoming : null;
      const key = next ? `${next.version}:${next.documentHash}` : "";
      if (offerKey.current !== key) {
        setAgeConfirmed(false);
        setImportantTermsConfirmed(false);
        setDismissed(false);
        offerKey.current = key;
      }
      setOffer(next);
      if (force) setDismissed(false);
      setError(null);
    } catch {
      // 상태 확인 실패 시 동의한 것으로 간주하지 않는다. 새 쓰기는 서버에서 차단한다.
      if (force && generation.current === requestGeneration && getSessionSnapshot()?.userId === userId) {
        setDismissed(false);
        setError("이용약관을 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해주세요.");
      }
    }
  }, [userId]);

  useEffect(() => {
    // refresh는 서버 응답을 await한 뒤에만 상태를 갱신한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const requested = () => { void refresh(true); };
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener(SERVICE_TERMS_REQUIRED_EVENT, requested);
    document.addEventListener("visibilitychange", visible);
    return () => {
      generation.current += 1;
      window.removeEventListener(SERVICE_TERMS_REQUIRED_EVENT, requested);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);

  const accept = async () => {
    if (!offer || saving || !ageConfirmed || !importantTermsConfirmed) return;
    setSaving(true);
    setError(null);
    try {
      await submitServiceTerms(offer, { ageConfirmed, importantTermsConfirmed });
      if (getSessionSnapshot()?.userId === userId) await refresh(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "동의를 저장하지 못했어요.");
    } finally { setSaving(false); }
  };

  if (dismissed || (!offer && !error)) return null;
  return (
    <Panel aria-label="이용약관 확인" data-scroll-region>
      <h2>앞으로의 이용을 위해 확인해주세요.</h2>
      {offer && <>
        <p>{offer.document.summary}</p>
        <small>시행일 {new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "long" }).format(new Date(offer.effectiveAt))} · {offer.version}</small>
        <Highlights>{offer.document.importantTerms.map((item) => <li key={item}>{item}</li>)}</Highlights>
        <Details>
          <summary>서비스 이용약관 전체 보기</summary>
          <Document>
            {offer.document.sections.map((section) => <section key={section.title}><h3>{section.title}</h3>{section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</section>)}
          </Document>
        </Details>
        <label><input type="checkbox" checked={ageConfirmed} onChange={(event) => setAgeConfirmed(event.target.checked)} disabled={saving} />만 14세 이상이에요.</label>
        <label><input type="checkbox" checked={importantTermsConfirmed} onChange={(event) => setImportantTermsConfirmed(event.target.checked)} disabled={saving} />중요 내용을 확인했고, 서비스 이용약관에 동의해요.</label>
        <p>위치정보·기록 공개 동의와는 별개예요. 지금 동의하지 않아도 기존 기록 열람·삭제와 문의는 할 수 있어요.</p>
      </>}
      {error && <p role="alert">{error}</p>}
      <Actions>
        {offer ? <Button type="button" disabled={saving || !ageConfirmed || !importantTermsConfirmed} onClick={() => void accept()}>{saving ? "저장 중" : "동의하고 이어가기"}</Button> : <Button type="button" onClick={() => void refresh(true)}>다시 불러오기</Button>}
        <Button type="button" $tone="text" disabled={saving} onClick={() => setDismissed(true)}>나중에</Button>
        <Link href="/login" onClick={() => setDismissed(true)}>계정·데이터 관리</Link>
        <a href="mailto:admin@tuti.today">문의</a>
      </Actions>
    </Panel>
  );
}

const Panel = styled.aside`
  position: fixed;
  z-index: 330;
  inset-inline: max(var(--space-4), env(safe-area-inset-left, 0px));
  bottom: calc(var(--space-4) + env(safe-area-inset-bottom, 0px));
  width: auto;
  max-width: 600px;
  max-height: calc(100dvh - 48px - env(safe-area-inset-top, 0px));
  box-sizing: border-box;
  margin-inline: auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
  display: grid;
  gap: var(--space-3);
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--space-4);
  background: var(--color-surface);
  color: var(--color-text-primary);
  box-shadow: 0 8px 32px rgb(0 0 0 / 0.12);
  h2 { font-size: var(--font-size-300); font-weight: 600; }
  p, label, small { font-size: var(--font-size-100); line-height: 1.65; }
  label { display: flex; align-items: flex-start; gap: var(--space-2); }
  input { flex: none; width: 18px; height: 18px; margin-top: 3px; accent-color: var(--color-brand-700); }
  a { color: var(--color-text-secondary); font-size: var(--font-size-100); text-underline-offset: 3px; }
`;
const Details = styled.details`
  summary { cursor: pointer; font-size: var(--font-size-100); font-weight: 600; }
`;
const Highlights = styled.ul`
  padding-left: var(--space-5);
  font-size: var(--font-size-100);
  line-height: 1.7;
  li + li { margin-top: var(--space-2); }
`;
const Document = styled.div`
  padding-block: var(--space-4);
  overflow-wrap: anywhere;
  h3 { margin-block: var(--space-4) var(--space-2); font-size: var(--font-size-200); }
  ul { padding-left: var(--space-5); font-size: var(--font-size-100); line-height: 1.7; }
  p + p { margin-top: var(--space-2); }
`;
const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
`;
