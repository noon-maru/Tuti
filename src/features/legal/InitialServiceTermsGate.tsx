"use client";

import styled from "@emotion/styled";
import { ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { TutiWordmark } from "@/features/tuti/components/TutiWordmark";
import { acceptInitialServiceTerms, InitialTermsLoadError, isInitialTermsRightsPath, loadInitialServiceTerms, type InitialTermsState } from "@/lib/initialServiceTerms";
import { Button, baseControlStyles } from "@/shared/ui/buttons";
import type { ServiceTermsOffer } from "@/shared/legal/serviceTerms";

// 오버레이가 아니라 진입 화면이다. 통과 전에는 children과 그 안의 effect를 마운트하지 않는다.
export function InitialServiceTermsGate({ children, rightsChildren }: { children: React.ReactNode; rightsChildren: React.ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<InitialTermsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [documentOpen, setDocumentOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void loadInitialServiceTerms().then(next => {
      if (active) { setState(next); setError(null); }
    }).catch(failure => {
      if (active) {
        if (failure instanceof InitialTermsLoadError) setState({ hasStoredSession: failure.hasStoredSession, offer: null, allowed: false });
        setError("이용약관을 불러오지 못했어요. 연결을 확인하고 다시 시도해주세요.");
      }
    });
    return () => { active = false; };
  }, [retry]);

  if (state?.allowed) return children;
  // 새 기기에서도 기존 계정을 복구하거나 문의할 수 있다. 이 경로에서는 분석/추천을 시작하지 않는다.
  if (pathname === "/login" || pathname === "/inquiry" || (state?.hasStoredSession && isInitialTermsRightsPath(pathname))) return rightsChildren;

  const offer = state?.offer ?? null;
  const reload = () => { setError(null); setState(null); setRetry(value => value + 1); };

  return (
    <Screen aria-labelledby="initial-terms-title" data-initial-terms-screen>
      {documentOpen && offer ? <>
        <DocumentHeader>
          <Button type="button" $tone="text" $size="compact" onClick={() => setDocumentOpen(false)}>닫기</Button>
          <span>서비스 이용약관</span>
        </DocumentHeader>
        <Document data-scroll-region tabIndex={0} aria-label="서비스 이용약관 전문">
          <h1 id="initial-terms-title">{offer.document.title}</h1>
          <p>{offer.document.summary}</p>
          <h2>시작 전에 확인할 중요 내용</h2>
          <ul>{offer.document.importantTerms.map(item => <li key={item}>{item}</li>)}</ul>
          {offer.document.sections.map(section => <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </section>)}
          <p>버전 {offer.version} · 시행일 {new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "long" }).format(new Date(offer.effectiveAt))}</p>
        </Document>
      </> : <>
        <Heading>
          <TutiWordmark priority />
          <div>
            <h1 id="initial-terms-title">우리의 첫 페이지를<br />열기 전에</h1>
            <p>튜티와 함께하기 위한<br />작은 약속을 확인해주세요.</p>
          </div>
        </Heading>
        <Content data-scroll-region>
          {offer ? <ConsentForm key={`${offer.version}:${offer.documentHash}`} offer={offer}
            onRead={() => setDocumentOpen(true)} onAccepted={setState} onRefresh={reload} /> : <Unavailable role="status" aria-live="polite">
            <p>{error ?? (state ? "서비스 이용약관을 준비하고 있어요." : "이용약관을 확인하고 있어요.")}</p>
            {(error || state) && <>
              <small>동의할 약관이 확인되면 시작할 수 있어요.<br />아직 계정을 만들거나 활동을 기록하지 않아요.</small>
              <Button type="button" $tone="neutral" onClick={reload}>다시 확인하기</Button>
            </>}
          </Unavailable>}
        </Content>
        <Footer>
          <p>위치·알림·민감정보는 필요한 순간에<br />별도로 확인할게요.</p>
          <nav aria-label="약관과 도움말">
            <a href="/legal/privacy">개인정보 처리방침</a>
            <a href="/account-deletion">데이터 삭제 안내</a>
            <a href="/login">계정 관리</a>
            <a href="mailto:admin@tuti.today">문의</a>
          </nav>
        </Footer>
      </>}
    </Screen>
  );
}

function ConsentForm({ offer, onRead, onAccepted, onRefresh }: {
  offer: ServiceTermsOffer; onRead: () => void; onAccepted: (state: InitialTermsState) => void; onRefresh: () => void;
}) {
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [termsConfirmed, setTermsConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  const accept = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current || !ageConfirmed || !termsConfirmed) return;
    submitting.current = true;
    setSaving(true);
    setError(null);
    try {
      const state = await acceptInitialServiceTerms(offer, { ageConfirmed, importantTermsConfirmed: termsConfirmed });
      if (active.current) onAccepted(state);
    } catch {
      if (active.current) setError("동의를 저장하지 못했어요. 다시 시도하거나 최신 약관을 확인해주세요.");
    } finally {
      submitting.current = false;
      if (active.current) setSaving(false);
    }
  };

  return <Form onSubmit={event => void accept(event)} aria-busy={saving}>
    <AgreementGroup>
      <CheckRow><input type="checkbox" checked={ageConfirmed} disabled={saving} onChange={event => setAgeConfirmed(event.target.checked)} /><span>만 14세 이상이에요.<small>필수</small></span></CheckRow>
      <CheckRow><input type="checkbox" checked={termsConfirmed} disabled={saving} onChange={event => setTermsConfirmed(event.target.checked)} /><span>중요 내용을 확인했고,<br />서비스 이용약관에 동의해요.<small>필수</small></span></CheckRow>
      <ReadButton type="button" onClick={onRead}>약관과 중요 내용 읽기<ChevronRight size={16} aria-hidden="true" /></ReadButton>
    </AgreementGroup>
    {error && <ErrorMessage role="alert">{error}<Button type="button" $tone="text" $size="compact" disabled={saving} onClick={onRefresh}>최신 약관 확인</Button></ErrorMessage>}
    <Button type="submit" $tone="secondary" $size="large" $fullWidth disabled={saving || !ageConfirmed || !termsConfirmed}>{saving ? "동의를 저장하고 있어요" : "동의하고 시작하기"}</Button>
    <small>개인정보 처리방침에서 정보가 어떻게 쓰이는지 확인할 수 있어요.</small>
  </Form>;
}

const Screen = styled.section`
  display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0;
  padding: max(28px, env(safe-area-inset-top)) 24px max(20px, env(safe-area-inset-bottom));
  box-sizing: border-box; background: var(--color-surface); color: var(--color-text);
`;
const Heading = styled.header`
  flex-shrink: 0;
  > img { width: 76px; height: auto; }
  > div { margin-top: clamp(24px, 6cqh, 56px); }
  h1 { margin: 0; font-size: clamp(26px, 4.3cqh, 34px); font-weight: 700; line-height: 1.35; letter-spacing: -0.045em; }
  p { margin: 14px 0 0; color: var(--color-text-muted); font-size: 15px; line-height: 1.65; }
  @media (max-height: 600px) { > div { margin-top: 16px; } p { margin-top: 8px; } }
`;
const Content = styled.div`
  flex: 1; min-height: 0; display: flex; flex-direction: column;
  overflow-y: auto; padding-block: 24px 16px;
  > form, > div { margin-top: auto; }
  @media (max-height: 600px) { padding-block: 16px 8px; }
`;
const Form = styled.form`
  display: grid; gap: 16px; flex-shrink: 0;
  > small { color: var(--color-text-muted); font-size: 11px; line-height: 1.6; text-align: center; }
`;
const AgreementGroup = styled.div`
  border-radius: 20px; padding: 8px 16px; background: var(--color-secondary-100);
`;
const CheckRow = styled.label`
  display: flex; align-items: center; gap: 12px; min-height: 52px; cursor: pointer;
  input { width: 21px; height: 21px; margin: 0; flex-shrink: 0; accent-color: var(--color-brand-800); }
  input:focus-visible { outline: 2px solid var(--color-brand-800); outline-offset: 4px; }
  span { display: block; font-size: 14px; font-weight: 600; line-height: 1.6; }
  small { display: inline-block; margin-inline-start: 6px; color: var(--color-text-muted); font-size: 11px; font-weight: 400; }
`;
const ReadButton = styled.button`
  ${baseControlStyles}; display: flex; align-items: center; justify-content: space-between;
  width: 100%; min-height: 44px; padding: 4px 0 4px 33px; background: transparent;
  color: var(--color-text-muted); font-size: 12px; text-align: left;
`;
const Footer = styled.footer`
  flex-shrink: 0; text-align: center;
  p { color: var(--color-text-muted); font-size: 12px; line-height: 1.6; margin: 0 0 12px; }
  nav { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 14px; }
  a { color: var(--color-text-muted); font-size: 11px; line-height: 1.6; padding-block: 4px; text-underline-offset: 3px; }
`;
const Unavailable = styled.div`
  display: grid; gap: 16px; padding-block: 24px;
  p { margin: 0; font-size: 15px; line-height: 1.6; }
  small { color: var(--color-text-muted); line-height: 1.7; }
`;
const ErrorMessage = styled.div`
  color: var(--color-error); font-size: 13px; line-height: 1.6;
`;
const DocumentHeader = styled.div`
  display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; padding-bottom: 12px;
  span { font-size: 13px; font-weight: 600; }
`;
const Document = styled.article`
  overflow-y: auto; min-height: 0; padding: 4px 4px 16px;
  h1 { font-size: 22px; line-height: 1.5; margin: 12px 0; }
  h2 { font-size: 16px; line-height: 1.5; margin: 28px 0 12px; }
  p, li { font-size: 14px; line-height: 1.9; white-space: pre-wrap; overflow-wrap: anywhere; }
`;
