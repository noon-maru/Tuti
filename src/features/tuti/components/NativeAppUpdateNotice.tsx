"use client";

import { Preferences } from "@capacitor/preferences";
import styled from "@emotion/styled";
import { ArrowUpRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  fetchNativeAppUpdatePolicy,
  openNativeAppStore,
} from "@/lib/appUpdate";
import type { AppUpdatePolicyResponse } from "@/shared/api/appUpdate";
import { Button } from "@/features/tuti/components/buttons";

const UPDATE_SNOOZE_DURATION_MS = 24 * 60 * 60 * 1_000;

export function NativeAppUpdateNotice() {
  const [policy, setPolicy] = useState<AppUpdatePolicyResponse | null>(null);
  const [openingStore, setOpeningStore] = useState(false);

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

  useEffect(() => {
    let disposed = false;

    void fetchNativeAppUpdatePolicy()
      .then(async (nextPolicy) => {
        if (disposed || !nextPolicy?.updateAvailable || !nextPolicy.storeUrl) {
          return;
        }

        if (!nextPolicy.required && nextPolicy.latestVersion) {
          const { value } = await Preferences.get({
            key: getSnoozeKey(nextPolicy),
          });
          const snoozedUntil = Number(value);
          if (Number.isFinite(snoozedUntil) && snoozedUntil > Date.now()) {
            return;
          }
        }

        if (!disposed) setPolicy(nextPolicy);
      })
      .catch(() => {
        // 업데이트 확인 장애가 앱 사용을 막지 않도록 조용히 건너뜁니다.
      });

    return () => {
      disposed = true;
    };
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

  if (!policy?.updateAvailable || !policy.latestVersion || !policy.storeUrl) {
    return null;
  }

  const title = policy.required
    ? "새 버전으로 이어서 사용할 수 있어요."
    : "새로운 Tuti가 준비됐어요.";
  const description = policy.required
    ? "안정적인 이용을 위해 최신 버전으로 업데이트해주세요."
    : "지금의 기록은 그대로 두고, 더 안정적인 버전으로 가볍게 옮겨갈 수 있어요.";

  return (
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
      </Dialog>
    </Backdrop>
  );
}

function getSnoozeKey(policy: AppUpdatePolicyResponse) {
  return `tuti-app-update-snooze:${policy.platform}:${policy.latestVersion}`;
}

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
