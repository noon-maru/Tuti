"use client";

import { Preferences } from "@capacitor/preferences";
import styled from "@emotion/styled";
import { BellRing, ChevronRight, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BaseButton } from "@/features/tuti/components/buttons";
import {
  PRIVACY_POLICY_UPDATE_EFFECTIVE_AT,
  PRIVACY_POLICY_UPDATE_NOTICE_ID,
  PRIVACY_POLICY_UPDATE_PATH,
} from "@/shared/legal/privacyPolicyUpdate";
import { useTutiStore } from "@/store/tuti";

const NOTICE_STORAGE_KEY = `tuti-legal-notice:${PRIVACY_POLICY_UPDATE_NOTICE_ID}`;

export function PrivacyUpdateNotice() {
  const router = useRouter();
  const pathname = usePathname();
  const hasHydrated = useTutiStore((state) => state.hasHydrated);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!hasHydrated || pathname !== "/") {
      return;
    }

    let disposed = false;
    void Preferences.get({ key: NOTICE_STORAGE_KEY }).then(({ value }) => {
      if (!disposed && value !== "acknowledged") setVisible(true);
    });

    return () => {
      disposed = true;
    };
  }, [hasHydrated, pathname]);

  const acknowledge = async () => {
    setVisible(false);
    await Preferences.set({ key: NOTICE_STORAGE_KEY, value: "acknowledged" });
  };

  const openUpdate = async () => {
    await acknowledge();
    router.push(PRIVACY_POLICY_UPDATE_PATH);
  };

  if (!visible || !hasHydrated || pathname !== "/") return null;

  return (
    <Notice role="region" aria-label="개인정보 처리방침 개정 안내">
      <NoticeIcon aria-hidden="true">
        <BellRing />
      </NoticeIcon>
      <NoticeCopy>
        <strong>개인정보 처리방침이 바뀔 예정이에요.</strong>
        <p>
          문의 답변 알림을 위한 처리 내용을 추가해요. 시행일은 {" "}
          {PRIVACY_POLICY_UPDATE_EFFECTIVE_AT}이에요.
        </p>
        <DetailsButton type="button" onClick={() => void openUpdate()}>
          개정 내용 보기
          <ChevronRight aria-hidden="true" />
        </DetailsButton>
      </NoticeCopy>
      <DismissButton
        type="button"
        aria-label="개인정보 처리방침 개정 안내 확인"
        onClick={() => void acknowledge()}
      >
        <X aria-hidden="true" />
      </DismissButton>
    </Notice>
  );
}

const Notice = styled.aside`
  position: absolute;
  z-index: 150;
  top: calc(var(--app-safe-area-top, 0px) + var(--space-4));
  right: var(--space-4);
  left: var(--space-4);
  display: grid;
  grid-template-columns: var(--space-10) minmax(0, 1fr) var(--space-9);
  gap: var(--space-3);
  align-items: start;
  padding: var(--space-4);
  border: 1px solid var(--color-secondary-400);
  border-radius: 20px;
  background: var(--color-surface);
  box-shadow: 0 16px 44px rgb(var(--color-black-rgb) / 0.16);
  animation: notice-enter 360ms cubic-bezier(0.22, 1, 0.36, 1) both;

  @keyframes notice-enter {
    from {
      opacity: 0;
      transform: translateY(-12px);
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

const NoticeIcon = styled.span`
  width: var(--space-10);
  height: var(--space-10);
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--color-secondary-200);
  color: var(--color-secondary-800);

  svg {
    width: var(--space-5);
    height: var(--space-5);
  }
`;

const NoticeCopy = styled.div`
  min-width: 0;
  display: grid;
  gap: var(--space-1);

  strong {
    font-size: var(--font-size-200);
    line-height: var(--line-height-subtitle);
  }

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    line-height: var(--line-height-body);
  }
`;

const DetailsButton = styled(BaseButton)`
  width: fit-content;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  margin-top: var(--space-1);
  padding: var(--space-1) 0;
  background: transparent;
  color: var(--color-brand-700);
  font-size: var(--font-size-100);
  font-weight: 700;

  svg {
    width: var(--space-4);
    height: var(--space-4);
  }
`;

const DismissButton = styled(BaseButton)`
  width: var(--space-9);
  height: var(--space-9);
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-muted);

  svg {
    width: var(--space-5);
    height: var(--space-5);
  }
`;
