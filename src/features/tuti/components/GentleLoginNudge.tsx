"use client";

import styled from "@emotion/styled";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LOGIN_NUDGE_EVENT,
  type LoginNudgeReason,
} from "@/features/tuti/auth/loginNudge";
import { useSession } from "@/features/tuti/hooks/useSession";
import { preferencesStorage } from "@/lib/storage/preferencesStorage";
import { recordProductActivity } from "@/lib/productActivity";

const STORAGE_KEY = "tuti-login-nudge-last-shown-at";
const NUDGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1_000;
const AUTO_DISMISS_MS = 9_000;

export function GentleLoginNudge() {
  const router = useRouter();
  const session = useSession();
  const [reason, setReason] = useState<LoginNudgeReason | null>(null);
  const checking = useRef(false);
  const accountConnected = Boolean(session?.account);

  const close = useCallback(() => setReason(null), []);

  useEffect(() => {
    const handleRequest = async (event: Event) => {
      if (accountConnected || checking.current || reason) return;
      checking.current = true;

      try {
        const stored = await preferencesStorage.getItem(STORAGE_KEY);
        const lastShownAt = stored ? Number(stored) : 0;
        if (
          Number.isFinite(lastShownAt) &&
          Date.now() - lastShownAt < NUDGE_COOLDOWN_MS
        ) {
          return;
        }

        const nextReason = (event as CustomEvent<LoginNudgeReason>).detail;
        if (nextReason !== "journal_created" && nextReason !== "place_saved") {
          return;
        }

        await preferencesStorage.setItem(STORAGE_KEY, String(Date.now()));
        setReason(nextReason);
        void recordProductActivity("login_nudge_shown").catch(() => {
          // 권유 노출 기록 실패는 사용자 흐름을 막지 않는다.
        });
      } catch {
        const nextReason = (event as CustomEvent<LoginNudgeReason>).detail;
        if (nextReason === "journal_created" || nextReason === "place_saved") {
          setReason(nextReason);
          void recordProductActivity("login_nudge_shown").catch(() => {
            // 권유 노출 기록 실패는 사용자 흐름을 막지 않는다.
          });
        }
      } finally {
        checking.current = false;
      }
    };

    window.addEventListener(LOGIN_NUDGE_EVENT, handleRequest);
    return () => window.removeEventListener(LOGIN_NUDGE_EVENT, handleRequest);
  }, [accountConnected, reason]);

  useEffect(() => {
    if (!reason) return;
    const timeout = window.setTimeout(close, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timeout);
  }, [close, reason]);

  if (!reason || accountConnected) return null;

  return (
    <Nudge role="status" aria-live="polite">
      <Copy>
        <strong>
          {reason === "journal_created"
            ? "이 기록, 다음에도 이어볼까요?"
            : "다음에 갈 공간을 담아뒀어요."}
        </strong>
        <span>
          {reason === "journal_created"
            ? "로그인해두면 기기를 바꿔도 다시 볼 수 있어요."
            : "지금은 이 기기에 남아 있어요. 기록을 오래 이어보려면 로그인해둘 수 있어요."}
        </span>
      </Copy>
      <Actions>
        <LaterButton type="button" onClick={close}>
          나중에
        </LaterButton>
        <LoginButton
          type="button"
          onClick={() => {
            void recordProductActivity("login_nudge_opened").catch(() => {
              // 권유 선택 기록 실패는 로그인을 막지 않는다.
            });
            close();
            router.push("/login");
          }}
        >
          로그인해두기
        </LoginButton>
      </Actions>
    </Nudge>
  );
}

const Nudge = styled.aside`
  position: absolute;
  z-index: 140;
  right: var(--space-4);
  bottom: calc(var(--app-safe-area-bottom) + 82px);
  left: var(--space-4);
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: rgb(var(--color-white-rgb) / 0.96);
  box-shadow: 0 12px 30px rgb(var(--color-black-rgb) / 0.12);
  backdrop-filter: blur(14px);
  animation: nudge-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both;

  @keyframes nudge-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const Copy = styled.div`
  display: grid;
  gap: 4px;

  strong {
    color: var(--color-text);
    font-size: var(--font-size-200);
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    line-height: var(--line-height-body);
  }
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
`;

const LaterButton = styled.button`
  min-height: 36px;
  padding: 0 var(--space-3);
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: var(--font-size-100);
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--color-brand-700);
    outline-offset: 2px;
  }
`;

const LoginButton = styled.button`
  min-height: 36px;
  padding: 0 var(--space-4);
  border: 0;
  border-radius: 999px;
  background: var(--color-secondary-500);
  color: var(--color-black);
  font: inherit;
  font-size: var(--font-size-100);
  font-weight: 700;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--color-brand-700);
    outline-offset: 2px;
  }
`;
