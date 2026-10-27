"use client";

import { Preferences } from "@capacitor/preferences";
import styled from "@emotion/styled";
import { ArrowUpRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  fetchNativeAppUpdatePolicy,
  getNativeAppPlatform,
  openNativeAppStore,
  readCachedAppUpdatePolicy,
} from "@/lib/appUpdate";
import type { AppUpdatePolicyResponse } from "@/shared/api/appUpdate";
import { Button } from "@/features/tuti/components/buttons";
import { CLIENT_UPDATE_REQUIRED_EVENT, type ClientUpdateRequired } from "@/shared/api/clientProtocol";
import { isInitialTermsRightsPath } from "@/lib/initialServiceTerms";
import { TutiWordmark } from "@/features/tuti/components/TutiWordmark";

const UPDATE_SNOOZE_DURATION_MS = 24 * 60 * 60 * 1_000;

export function NativeAppUpdateNotice({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [policy, setPolicy] = useState<AppUpdatePolicyResponse | null>(null);
  const [openingStore, setOpeningStore] = useState(false);
  const [checked, setChecked] = useState(false);
  const [localCheckComplete, setLocalCheckComplete] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [incompatible, setIncompatible] = useState<ClientUpdateRequired | null>(null);

  const dismiss = useCallback(
    async (currentPolicy: AppUpdatePolicyResponse) => {
      setPolicy(null);
      await Preferences.set({
        key: getSnoozeKey(currentPolicy),
        value: String(Date.now() + UPDATE_SNOOZE_DURATION_MS),
      });
    },
    [],
  );

  useLayoutEffect(() => {
    let disposed = false;
    let cached = readCachedAppUpdatePolicy();
    // 서버 HTML에서는 저장소를 읽을 수 없으므로 로고 없이 시작하고 로컬 판단 뒤에만 표시한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalCheckComplete(true);
    // 로컬 확인 결과로 먼저 표시하고, 매번 네트워크를 기다리며 스플래시를 띄우지 않는다.
    if (!getNativeAppPlatform() || cached) {
      // hydration 결과를 첫 paint 전에 반영해 캐시 진입 시 스플래시 깜빡임을 막는다.
      setChecked(true);
      if (cached?.policy.required) setPolicy(cached.policy);
    }

    void fetchNativeAppUpdatePolicy(identity => {
      if (disposed || !cached) return;
      if (cached.appId !== identity.appId || cached.build !== identity.build ||
          cached.policy.currentVersion !== identity.version) {
        cached = null;
        setPolicy(null);
        setChecked(false);
      }
    })
      .then(async (nextPolicy) => {
        if (disposed) return;
        if (!nextPolicy?.updateAvailable || !nextPolicy.storeUrl) { setPolicy(null); setChecked(true); return; }

        if (!nextPolicy.required && nextPolicy.latestVersion) {
          const { value } = await Preferences.get({
            key: getSnoozeKey(nextPolicy),
          });
          const snoozedUntil = Number(value);
          if (Number.isFinite(snoozedUntil) && snoozedUntil > Date.now()) {
            if (!disposed) { setPolicy(null); setChecked(true); }
            return;
          }
        }

        if (!disposed) { setPolicy(nextPolicy); setChecked(true); }
      })
      .catch(() => {
        // 이미 확인한 같은 앱의 일시적 통신 실패는 진입을 막지 않는다.
        // 캐시된 필수 업데이트 및 API의 426 차단은 계속 유지한다.
        if (!disposed && !cached) setCheckFailed(true);
      });

    return () => {
      disposed = true;
    };
  }, [attempt]);

  useEffect(() => {
    const required = (event: Event) => {
      const data = (event as CustomEvent<ClientUpdateRequired>).detail;
      if (data?.code === "client_update_required") setIncompatible(data);
    };
    window.addEventListener(CLIENT_UPDATE_REQUIRED_EVENT, required);
    return () => window.removeEventListener(CLIENT_UPDATE_REQUIRED_EVENT, required);
  }, []);

  useEffect(() => {
    if (!policy || policy.required) return;

    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") void dismiss(policy);
    };
    window.addEventListener("keydown", dismissOnEscape);
    return () => window.removeEventListener("keydown", dismissOnEscape);
  }, [dismiss, policy]);

  const openStore = async () => {
    if (!policy?.storeUrl || openingStore) return;

    setOpeningStore(true);
    try {
      if (!policy.required) {
        await Preferences.set({
          key: getSnoozeKey(policy),
          value: String(Date.now() + UPDATE_SNOOZE_DURATION_MS),
        });
      }
      await openNativeAppStore(policy.storeUrl);
    } catch {
      window.open(policy.storeUrl, "_blank", "noopener,noreferrer");
    } finally {
      setOpeningStore(false);
    }
  };

  // 계정 복구·삭제·열람·철회·문의는 업데이트와 분리한다. API 쪽 기존 인증은 유지한다.
  if (isInitialTermsRightsPath(pathname)) return children;

  if (incompatible || checkFailed) return <Backdrop>
    <Dialog role="dialog" aria-modal="true" aria-labelledby="client-version-title">
      <Copy>
        <h2 id="client-version-title">{incompatible ? "새 버전으로 이어서 사용할 수 있어요." : "앱 버전을 확인하지 못했어요."}</h2>
        <p>{incompatible?.error ?? "연결을 확인한 뒤 다시 시도해주세요."}</p>
      </Copy>
      {incompatible ? incompatible.storeUrl ? <Button type="button" $tone="primary" onClick={() => {
        const url = incompatible.storeUrl;
        if (url?.startsWith("https://")) void openNativeAppStore(url).catch(() => window.open(url, "_blank", "noopener,noreferrer"));
      }}>지금 업데이트하기</Button> : <Button type="button" $tone="primary" onClick={() => window.location.reload()}>새로고침하기</Button> : checkFailed && <Button type="button" onClick={() => { setCheckFailed(false); setAttempt(value => value + 1); }}>다시 확인하기</Button>}
      <a href="/login">계정·데이터 관리</a>
      <a href="/account-deletion">데이터 삭제 안내</a>
      <a href="mailto:admin@tuti.today">문의</a>
    </Dialog>
  </Backdrop>;

  // 시작 화면을 유지하는 동안만 가린다. 실패·필수 업데이트 안내는 위에서 별도로 처리한다.
  if (!checked) return <StartupSplash role="status" aria-label="튜티 시작 중">{localCheckComplete && <TutiWordmark priority />}</StartupSplash>;

  if (!policy?.updateAvailable || !policy.latestVersion || !policy.storeUrl) return children;

  const title = policy.required
    ? "새 버전으로 이어서 사용할 수 있어요."
    : "새로운 Tuti가 준비됐어요.";
  const description = policy.required
    ? "안정적인 이용을 위해 최신 버전으로 업데이트해주세요."
    : "지금의 마디는 그대로 두고, 더 안정적인 버전으로 가볍게 옮겨갈 수 있어요.";

  return (
    <>
    {!policy.required && children}
    <Backdrop>
      <Dialog
        role="dialog"
        aria-modal="true"
        aria-labelledby="native-app-update-title"
        aria-describedby="native-app-update-description"
      >
        <BrandMark aria-hidden="true" />
        <Copy>
          <VersionLabel>
            Tuti {policy.currentVersion}
            <span aria-hidden="true">→</span>
            {policy.latestVersion}
          </VersionLabel>
          <h2 id="native-app-update-title">{title}</h2>
          <p id="native-app-update-description">{description}</p>
        </Copy>
        <Actions>
          <UpdateButton
            type="button"
            $tone="primary"
            $size="large"
            $fullWidth
            autoFocus
            disabled={openingStore}
            onClick={() => void openStore()}
          >
            {openingStore ? "스토어 여는 중" : "지금 업데이트하기"}
            {!openingStore && <ArrowUpRight aria-hidden="true" />}
          </UpdateButton>
          {!policy.required && (
            <LaterButton
              type="button"
              $tone="text"
              $size="medium"
              $fullWidth
              onClick={() => void dismiss(policy)}
            >
              다음에 할게요
            </LaterButton>
          )}
        </Actions>
        {policy.required && <a href="/login">계정·데이터 관리</a>}
      </Dialog>
    </Backdrop>
    </>
  );
}

function getSnoozeKey(policy: AppUpdatePolicyResponse) {
  return `tuti-app-update-snooze:${policy.platform}:${policy.latestVersion}`;
}

const StartupSplash = styled.div`
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  background: var(--color-surface);
  img { width: 76px; height: auto; }
`;

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 320;
  display: grid;
  place-items: center;
  padding:
    calc(var(--app-safe-area-top, 0px) + var(--space-6))
    var(--space-5)
    calc(var(--app-safe-area-bottom, 0px) + var(--space-6));
  background: rgb(var(--color-black-rgb) / 0.32);
  animation: update-backdrop-enter 220ms ease-out both;

  @keyframes update-backdrop-enter {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const Dialog = styled.section`
  width: min(100%, 340px);
  display: grid;
  justify-items: center;
  gap: var(--space-5);
  padding: var(--space-7) var(--space-6) var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: 26px;
  background: var(--color-surface);
  box-shadow: 0 20px 54px rgb(var(--color-black-rgb) / 0.18);
  text-align: center;
  animation: update-dialog-enter 360ms cubic-bezier(0.22, 1, 0.36, 1) both;

  @keyframes update-dialog-enter {
    from {
      opacity: 0;
      transform: translateY(14px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const BrandMark = styled.span`
  width: var(--space-13);
  height: var(--space-13);
  border-radius: 18px;
  background:
    var(--color-brand-200)
    url("/brand/tuti-symbol.svg") center / 30px 30px no-repeat;
`;

const Copy = styled.div`
  display: grid;
  gap: var(--space-2);

  h2 {
    font-size: var(--font-size-500);
    font-weight: 700;
    line-height: var(--line-height-heading);
    letter-spacing: var(--letter-spacing-heading);
  }

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-200);
    line-height: var(--line-height-body);
    letter-spacing: var(--letter-spacing-body);
  }
`;

const VersionLabel = styled.span`
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-brand-700);
  font-size: var(--font-size-100);
  font-weight: 650;
  line-height: var(--line-height-body);

  span {
    color: var(--color-text-muted);
    font-weight: 400;
  }
`;

const Actions = styled.div`
  width: 100%;
  display: grid;
  gap: var(--space-1);
`;

const UpdateButton = styled(Button)`
  svg {
    width: var(--space-4);
    height: var(--space-4);
  }
`;

const LaterButton = styled(Button)`
  color: var(--color-text-muted);
`;
