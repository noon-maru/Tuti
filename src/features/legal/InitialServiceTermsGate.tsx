"use client";

import styled from "@emotion/styled";
import { ChevronRight } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { TutiWordmark } from "@/features/tuti/components/TutiWordmark";
import { InitialTermsLoadError, initialTermsEntryRedirect, isInitialTermsRightsPath, startInitialServiceTerms, type InitialTermsState } from "@/lib/initialServiceTerms";
import { submitInitialConsents } from "@/lib/initialConsent";
import { animateRequiredConsents } from "@/lib/requiredConsentAnimation";
import { getSessionSnapshot, subscribeToSession } from "@/lib/auth/session";
import { serviceTermsAcceptanceCache } from "@/lib/serviceTermsAcceptanceCache";
import { Button, baseControlStyles } from "@/shared/ui/buttons";
import { SERVICE_TERMS_REQUIRED_EVENT, ServiceTermsSessionExpiredError } from "@/lib/serviceTerms";
import type { ServiceTermsOffer } from "@/shared/legal/serviceTerms";
import { getLocationTerms, getLocationTermsVersion } from "@/shared/location/terms";

// 오버레이가 아니라 진입 화면이다. 통과 전에는 children과 그 안의 effect를 마운트하지 않는다.
export function InitialServiceTermsGate({ children, rightsChildren, renderContent = content => content }: {
  children: React.ReactNode; rightsChildren: React.ReactNode;
  renderContent?: (content: React.ReactNode) => React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<InitialTermsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [localCheckComplete, setLocalCheckComplete] = useState(false);
  const [documentOpen, setDocumentOpen] = useState<"service" | "location" | null>(null);
  const [reconsent, setReconsent] = useState(false);
  const admitted = useRef(false);
  const activeUserId = useRef<string | null>(null);
  const forceChecking = useRef(false);
  const screenRef = useRef<HTMLElement>(null);
  const submittingConsent = useRef(false);
  const entryRedirect = initialTermsEntryRedirect(pathname, state);
  const reconsentDialog = reconsent && pathname !== "/entry";

  useEffect(() => {
    if (entryRedirect) router.replace(entryRedirect);
  }, [entryRedirect, router]);

  useEffect(() => {
    let active = true;
    let usedCache = false;
    void startInitialServiceTerms(cached => {
      if (!active) return;
      usedCache = true;
      admitted.current = true;
      activeUserId.current = cached.userId ?? null;
      setState(cached);
      setError(null);
    }, !forceChecking.current, () => {
      if (active) setLocalCheckComplete(true);
    }).then(next => {
      if (active) {
        activeUserId.current = next.userId ?? null;
        setReconsent(admitted.current && !next.allowed && Boolean(next.offer));
        if (next.allowed) admitted.current = true;
        setState(next); setError(null);
      }
    }).catch(failure => {
      // 통신 실패만으로 캐시 진입을 취소하지 않는다. 실제 API는 계속 서버에서 검증한다.
      if (active && !usedCache) {
        if (failure instanceof InitialTermsLoadError) setState({ hasStoredSession: failure.hasStoredSession, offer: null, allowed: false });
        setError("이용약관을 불러오지 못했어요. 연결을 확인하고 다시 시도해주세요.");
      }
    }).finally(() => { if (active) forceChecking.current = false; });
    return () => { active = false; };
  }, [retry]);

  useEffect(() => {
    const requireTerms = () => {
      if (forceChecking.current) return;
      forceChecking.current = true;
      const userId = getSessionSnapshot()?.userId;
      if (userId) void serviceTermsAcceptanceCache.clear(userId);
      setDocumentOpen(null);
      setError(null);
      setState(previous => previous ? { ...previous, allowed: false, offer: null } : null);
      setRetry(value => value + 1);
    };
    window.addEventListener(SERVICE_TERMS_REQUIRED_EVENT, requireTerms);
    const unsubscribe = subscribeToSession(() => {
      const userId = getSessionSnapshot()?.userId ?? null;
      if (userId === activeUserId.current) return;
      // 최초 명시적 동의 버튼이 만든 계정은 같은 양식에서 저장을 끝낸다.
      if (!activeUserId.current && userId && submittingConsent.current && !admitted.current) {
        activeUserId.current = userId;
        return;
      }
      activeUserId.current = userId;
      admitted.current = false;
      forceChecking.current = false;
      setState(null); setError(null); setReconsent(false); setDocumentOpen(null);
      setRetry(value => value + 1);
    });
    const visible = () => {
      if (document.visibilityState === "visible" && !forceChecking.current) setRetry(value => value + 1);
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener(SERVICE_TERMS_REQUIRED_EVENT, requireTerms);
      document.removeEventListener("visibilitychange", visible);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!reconsentDialog || state?.allowed) return;
    const screen = screenRef.current;
    const previous = document.activeElement;
    screen?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !screen) return;
      const controls = Array.from(screen.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), a[href], summary, [tabindex='0']"))
        .filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); screen.focus(); }
      else if (!screen.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === screen)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === screen)) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", trapFocus);
    return () => {
      window.removeEventListener("keydown", trapFocus);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [reconsentDialog, state?.allowed, pathname]);

  if (state?.allowed) return renderContent(children);
  // 새 기기에서도 기존 계정을 복구하거나 문의할 수 있다. 이 경로에서는 분석/추천을 시작하지 않는다.
  if (pathname === "/login" || pathname === "/inquiry" || (state?.hasStoredSession && isInitialTermsRightsPath(pathname))) return renderContent(rightsChildren);

  // SSR·저장소 조회 동안 로고를 미리 그리면 캐시 진입에서도 새로고침마다 깜빡인다.
  if (entryRedirect || (!state && !error)) return renderContent(<LoadingBrand role="status" aria-label="튜티 시작 중">{localCheckComplete && !entryRedirect && <TutiWordmark priority />}</LoadingBrand>);

  const offer = state?.offer ?? null;
  const locationTerms = getLocationTerms();
  const displayedDocument = documentOpen === "location" ? locationTerms : offer?.document;
  const reload = () => { setError(null); setState(null); setRetry(value => value + 1); };

  const screen = (
    <Screen ref={screenRef} tabIndex={reconsentDialog ? -1 : undefined} role={reconsentDialog ? "dialog" : undefined} aria-modal={reconsentDialog || undefined} aria-labelledby="initial-terms-title" data-initial-terms-screen>
      {documentOpen && offer && displayedDocument && <>
        <DocumentHeader>
          <Button type="button" $tone="text" $size="compact" onClick={() => setDocumentOpen(null)}>닫기</Button>
          <span>{documentOpen === "location" ? "위치기반서비스 이용약관" : "서비스 이용약관"}</span>
        </DocumentHeader>
        <Document data-scroll-region tabIndex={0} aria-label={`${documentOpen === "location" ? "위치기반서비스 이용약관" : "서비스 이용약관"} 전문`}>
          <h1 id="initial-terms-title">{displayedDocument.title}</h1>
          <p>{displayedDocument.summary}</p>
          <h2>시작 전에 확인할 중요 내용</h2>
          <ul>{displayedDocument.importantTerms.map(item => <li key={item}>{item}</li>)}</ul>
          {displayedDocument.sections.map(section => <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </section>)}
          <p>버전 {documentOpen === "location" ? getLocationTermsVersion() : offer.version} · 시행일 {documentOpen === "location" ? locationTerms.effectiveDate : new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "long" }).format(new Date(offer.effectiveAt))}</p>
        </Document>
      </>}
      <MainPanel hidden={Boolean(documentOpen)}>
        <Content data-scroll-region>
          <Heading>
            <h1 id={documentOpen ? undefined : "initial-terms-title"}><TutiWordmark priority /><span>{reconsent ? "이용약관 다시 동의" : "이용약관 동의"}</span></h1>
          </Heading>
          {offer ? <ConsentForm key={`${offer.version}:${offer.documentHash}`} offer={offer}
            onRead={setDocumentOpen} onAccepted={next => { admitted.current = next.allowed; setReconsent(false); setState(next); }} onRefresh={reload}
            onSubmittingChange={value => { submittingConsent.current = value; }} /> : <Unavailable role="status" aria-live="polite">
            <p>{error ?? (state ? "서비스 이용약관을 준비하고 있어요." : "이용약관을 확인하고 있어요.")}</p>
            {(error || state) && <>
              <small>동의할 약관이 확인되면 시작할 수 있어요.<br />아직 계정을 만들거나 활동을 기록하지 않아요.</small>
              <Button type="button" $tone="neutral" onClick={reload}>다시 확인하기</Button>
            </>}
          </Unavailable>}
        </Content>
        <Footer>
          <nav aria-label="약관과 도움말">
            <a href="/legal/privacy">개인정보 처리방침</a>
            <a href="/login">계정 관리</a>
            <a href="mailto:admin@tuti.today">문의</a>
          </nav>
        </Footer>
      </MainPanel>
    </Screen>
  );
  return renderContent(reconsentDialog ? <ReconsentBackdrop>{screen}</ReconsentBackdrop> : screen);
}

function ConsentForm({ offer, onRead, onAccepted, onRefresh, onSubmittingChange }: {
  offer: ServiceTermsOffer; onRead: (document: "service" | "location") => void; onAccepted: (state: InitialTermsState) => void; onRefresh: () => void;
  onSubmittingChange: (value: boolean) => void;
}) {
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [termsConfirmed, setTermsConfirmed] = useState(false);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const active = useRef(true);
  const animation = useRef<AbortController | null>(null);
  const requiredGroup = useRef<HTMLDivElement>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; animation.current?.abort(); }; }, []);

  const accept = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    const controller = new AbortController();
    animation.current = controller;
    onSubmittingChange(true);
    setSaving(true);
    setConfirming(true);
    setError(null);
    try {
      requiredGroup.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
      await animateRequiredConsents({ ageConfirmed, termsConfirmed,
        confirmAge: () => setAgeConfirmed(true), confirmTerms: () => setTermsConfirmed(true),
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        signal: controller.signal });
      if (!active.current || controller.signal.aborted) return;
      setConfirming(false);
      const result = await submitInitialConsents(offer, { ageConfirmed: true, importantTermsConfirmed: true }, locationConfirmed);
      // 선택 동의 저장 실패로 필수 동의를 마친 사용자의 시작을 막지 않는다.
      // 위치 사용 시에는 서버에 저장된 동의 상태를 다시 확인한다.
      if (result.locationError) console.warn("선택 위치 동의를 저장하지 못했습니다. 위치 사용 시 다시 확인합니다.");
      if (active.current) onAccepted(result.state);
    } catch (failure) {
      if (active.current && !controller.signal.aborted) {
        if (failure instanceof ServiceTermsSessionExpiredError) {
          setAgeConfirmed(false);
          setTermsConfirmed(false);
          setLocationConfirmed(false);
          setError(failure.message);
        } else setError("동의를 저장하지 못했어요. 다시 시도하거나 최신 약관을 확인해주세요.");
      }
    } finally {
      submitting.current = false;
      onSubmittingChange(false);
      if (active.current) { setSaving(false); setConfirming(false); }
    }
  };

  return <Form onSubmit={event => void accept(event)} aria-busy={saving}>
    <AgreementGroup ref={requiredGroup}>
      <CheckRow><input type="checkbox" checked={ageConfirmed} disabled={saving} onChange={event => setAgeConfirmed(event.target.checked)} /><span>만 14세 이상입니다<small>필수</small></span></CheckRow>
      <AgreementRow>
        <CheckRow><input type="checkbox" checked={termsConfirmed} disabled={saving} onChange={event => setTermsConfirmed(event.target.checked)} /><span>서비스 이용약관 동의<small>필수</small></span></CheckRow>
        <ReadButton type="button" aria-label="서비스 이용약관과 중요 내용 보기" disabled={saving} onClick={() => onRead("service")}><ChevronRight size={18} aria-hidden="true" /></ReadButton>
      </AgreementRow>
    </AgreementGroup>
    <AgreementGroup>
      <AgreementRow>
        <CheckRow><input type="checkbox" checked={locationConfirmed} disabled={saving} onChange={event => setLocationConfirmed(event.target.checked)} /><span>위치기반서비스 이용약관<small>선택</small></span></CheckRow>
        <ReadButton type="button" aria-label="위치기반서비스 이용약관 보기" disabled={saving} onClick={() => onRead("location")}><ChevronRight size={18} aria-hidden="true" /></ReadButton>
      </AgreementRow>
      <OptionalHint>위치 동의 없이도 마디를 남길 수 있어요.</OptionalHint>
    </AgreementGroup>
    {error && <ErrorMessage role="alert">{error}<Button type="button" $tone="text" $size="compact" disabled={saving} onClick={onRefresh}>최신 약관 확인</Button></ErrorMessage>}
    <Button type="submit" $tone="secondary" $size="large" $fullWidth disabled={saving}>{confirming ? "필수 항목을 확인하고 있어요" : saving ? "동의를 저장하고 있어요" : ageConfirmed && termsConfirmed ? "동의하고 시작하기" : "필수 항목에 동의하고 시작하기"}</Button>
    <small>버튼을 누르면 만 14세 이상임을 확인하고<br />서비스 이용약관과 중요 내용에 동의해요.</small>
  </Form>;
}

const Screen = styled.section`
  display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0;
  padding: max(28px, env(safe-area-inset-top)) 24px max(20px, env(safe-area-inset-bottom));
  box-sizing: border-box; background: var(--color-surface); color: var(--color-text);
`;
const MainPanel = styled.div`display: contents; &[hidden] { display: none; }`;
const OptionalHint = styled.p`margin: 0 0 4px 33px; color: var(--color-text-muted); font-size: 11px; line-height: 1.65;`;
const LoadingBrand = styled.div`
  width: 100%; height: 100%; display: grid; place-items: center; background: var(--color-surface);
  img { width: 76px; height: auto; }
`;
const ReconsentBackdrop = styled.div`
  position: absolute; inset: 0; z-index: 330; display: grid; place-items: center;
  padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));
  background: rgb(var(--color-black-rgb) / 0.32);
  > section { width: min(100%, 420px); height: 100%; max-height: 760px; border-radius: 24px; box-shadow: 0 20px 56px rgb(var(--color-black-rgb) / 0.18); }
  @media (max-height: 600px) { padding: 8px; > section { border-radius: 16px; } }
`;
const Heading = styled.header`
  flex-shrink: 0; margin-bottom: 30px;
  h1 { display: flex; align-items: center; gap: 10px; margin: 0; font-size: 18px; font-weight: 500; line-height: 1.5; letter-spacing: -0.025em; }
  img { display: block; width: 52px; height: auto; flex: none; }
  @media (max-height: 600px) { margin-bottom: 22px; }
`;
const Content = styled.div`
  flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: safe center;
  overflow-y: auto; padding-block: 24px 28px;
  @media (max-height: 600px) { padding-block: 12px 20px; }
`;
const Form = styled.form`
  display: grid; gap: 12px; flex-shrink: 0;
  > small { color: var(--color-text-muted); font-size: 11px; line-height: 1.6; text-align: center; }
`;
const AgreementGroup = styled.div`
  padding: 6px 14px; border: 1px solid var(--color-border); border-radius: 16px;
  background: var(--color-surface);
  > label + div { border-top: 1px solid var(--color-border); }
  & + & { padding: 2px 0 10px; border: none; border-radius: 0; background: transparent; }
`;
const AgreementRow = styled.div`display: flex; align-items: center; gap: 4px; > label { flex: 1; min-width: 0; }`;
const CheckRow = styled.label`
  display: flex; align-items: center; gap: 12px; min-height: 52px; cursor: pointer;
  input {
    appearance: none; width: 20px; height: 20px; margin: 0; flex-shrink: 0;
    display: grid; place-content: center; border: 1.5px solid var(--color-text-muted); border-radius: 6px;
    background: var(--color-surface); transition: background-color 160ms ease, border-color 160ms ease;
  }
  input::after {
    content: ""; width: 5px; height: 10px; border: solid white; border-width: 0 2px 2px 0;
    transform: translateY(-1px) rotate(45deg) scale(0);
    transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  input:checked { background: var(--color-brand-800); border-color: var(--color-brand-800); }
  input:checked::after { transform: translateY(-1px) rotate(45deg) scale(1); }
  input:focus-visible { outline: 2px solid var(--color-brand-800); outline-offset: 4px; }
  span { display: block; font-size: 14px; font-weight: 500; line-height: 1.6; word-break: keep-all; }
  small { display: inline-block; margin-inline-start: 6px; color: var(--color-text-muted); font-size: 10px; font-weight: 400; white-space: nowrap; }
  @media (prefers-reduced-motion: reduce) { input, input::after { transition: none; } }
  @media (forced-colors: active) { input { appearance: auto; } input::after { display: none; } }
`;
const ReadButton = styled.button`
  ${baseControlStyles}; display: grid; place-items: center; flex: none;
  width: 40px; min-height: 48px; padding: 0; background: transparent;
  color: var(--color-text-muted);
`;
const Footer = styled.footer`
  flex-shrink: 0; text-align: center;
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
