"use client";

import styled from "@emotion/styled";
import {
  BellRing,
  ChevronRight,
  FileLock2,
  LogOut,
  MapPin,
  MessageCircleQuestion,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { BackButton, BaseButton } from "@/features/tuti/components/buttons";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import type { CardDisplayPreferences } from "@/store/tuti";

type SettingsDestination =
  | "account"
  | "location"
  | "notifications"
  | "inquiry"
  | "legal";

export function SettingsScreen({
  accountConnected,
  accountLabel,
  notificationsAvailable,
  cardDisplayPreferences,
  onBack,
  onNavigate,
  onCardDisplayPreferenceChange,
  onLogout,
}: {
  accountConnected: boolean;
  accountLabel?: string;
  notificationsAvailable: boolean;
  cardDisplayPreferences: CardDisplayPreferences;
  onBack: () => void;
  onNavigate: (destination: SettingsDestination) => void;
  onCardDisplayPreferenceChange: (
    key: keyof CardDisplayPreferences,
    enabled: boolean,
  ) => void;
  onLogout: () => Promise<void>;
}) {
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const logout = async () => {
    if (logoutPending) return;

    setLogoutPending(true);
    setLogoutError(null);

    try {
      await onLogout();
    } catch (error) {
      setLogoutError(
        error instanceof Error ? error.message : "로그아웃하지 못했어요.",
      );
      setLogoutPending(false);
    }
  };

  return (
    <Frame>
      <Header>
        <BackButton aria-label="메인으로 돌아가기" onClick={onBack} />
        <h1>설정</h1>
        <HeaderSpacer aria-hidden="true" />
      </Header>

      <ScrollContent data-scroll-region>
        <AccountSummary>
          <AccountMark aria-hidden="true">T</AccountMark>
          <div>
            <strong>{accountLabel ?? "기기에 저장된 Tuti"}</strong>
            <p>
              {accountConnected
                ? "계정과 기록을 한곳에서 관리할 수 있어요."
                : "로그인하면 다른 기기에서도 기록을 이어볼 수 있어요."}
            </p>
          </div>
        </AccountSummary>

        <SettingsSection aria-labelledby="settings-account-heading">
          <SectionLabel id="settings-account-heading">내 정보</SectionLabel>
          <SettingsList>
            <SettingsRow
              type="button"
              onClick={() => onNavigate("account")}
            >
              <RowIcon $tone="brand"><UserRound aria-hidden="true" /></RowIcon>
              <RowCopy>
                <strong>{accountConnected ? "계정 관리" : "계정 및 데이터"}</strong>
                <span>
                  {accountConnected
                    ? "이름과 로그인 수단, 저장된 데이터를 관리해요."
                    : "계정을 연결하거나 기기의 데이터를 관리해요."}
                </span>
              </RowCopy>
              <ChevronRight aria-hidden="true" />
            </SettingsRow>
          </SettingsList>
        </SettingsSection>

        <SettingsSection aria-labelledby="settings-service-heading">
          <SectionLabel id="settings-service-heading">서비스 설정</SectionLabel>
          <SettingsList>
            <SettingsRow
              type="button"
              onClick={() => onNavigate("location")}
            >
              <RowIcon $tone="secondary"><MapPin aria-hidden="true" /></RowIcon>
              <RowCopy>
                <strong>위치 설정</strong>
                <span>현재 위치 사용과 동의 내역을 확인해요.</span>
              </RowCopy>
              <ChevronRight aria-hidden="true" />
            </SettingsRow>
            {notificationsAvailable && (
              <SettingsRow
                type="button"
                onClick={() => onNavigate("notifications")}
              >
                <RowIcon $tone="bridge"><BellRing aria-hidden="true" /></RowIcon>
                <RowCopy>
                  <strong>알림 설정</strong>
                  <span>오늘의 Tuti와 문의 답변 알림을 정해요.</span>
                </RowCopy>
                <ChevronRight aria-hidden="true" />
              </SettingsRow>
            )}
          </SettingsList>
        </SettingsSection>

        <SettingsSection aria-labelledby="settings-card-heading">
          <SectionLabel id="settings-card-heading">추천 카드에 표시</SectionLabel>
          <ToggleList>
            <ToggleRow>
              <ToggleLabel htmlFor="settings-show-place-name">
                장소명
              </ToggleLabel>
              <Switch>
                <input
                  id="settings-show-place-name"
                  type="checkbox"
                  role="switch"
                  checked={cardDisplayPreferences.showPlaceName}
                  onChange={(event) =>
                    onCardDisplayPreferenceChange(
                      "showPlaceName",
                      event.currentTarget.checked,
                    )
                  }
                />
                <span aria-hidden="true" />
              </Switch>
            </ToggleRow>
            <ToggleRow>
              <ToggleLabel htmlFor="settings-show-transit-time">
                대중교통 이동시간
              </ToggleLabel>
              <Switch>
                <input
                  id="settings-show-transit-time"
                  type="checkbox"
                  role="switch"
                  checked={cardDisplayPreferences.showPublicTransitTime}
                  onChange={(event) =>
                    onCardDisplayPreferenceChange(
                      "showPublicTransitTime",
                      event.currentTarget.checked,
                    )
                  }
                />
                <span aria-hidden="true" />
              </Switch>
            </ToggleRow>
          </ToggleList>
        </SettingsSection>

        <SettingsSection aria-labelledby="settings-help-heading">
          <SectionLabel id="settings-help-heading">도움말과 정책</SectionLabel>
          <SettingsList>
            <SettingsRow
              type="button"
              onClick={() => onNavigate("inquiry")}
            >
              <RowIcon $tone="neutral">
                <MessageCircleQuestion aria-hidden="true" />
              </RowIcon>
              <RowCopy>
                <strong>1:1 문의</strong>
                <span>문의하고 답변 내역을 확인해요.</span>
              </RowCopy>
              <ChevronRight aria-hidden="true" />
            </SettingsRow>
            <SettingsRow
              type="button"
              onClick={() => onNavigate("legal")}
            >
              <RowIcon $tone="neutral"><FileLock2 aria-hidden="true" /></RowIcon>
              <RowCopy>
                <strong>약관 및 개인정보</strong>
                <span>서비스 약관과 개인정보 처리방침을 확인해요.</span>
              </RowCopy>
              <ChevronRight aria-hidden="true" />
            </SettingsRow>
          </SettingsList>
        </SettingsSection>

        {accountConnected && (
          <AccountActions>
            <LogoutButton
              type="button"
              disabled={logoutPending}
              onClick={() => void logout()}
            >
              <LogOut aria-hidden="true" />
              {logoutPending ? "로그아웃 중..." : "로그아웃"}
            </LogoutButton>
            {logoutError && <Feedback role="alert">{logoutError}</Feedback>}
          </AccountActions>
        )}
      </ScrollContent>
    </Frame>
  );
}

const Frame = styled(ScreenFrame)`
  z-index: 40;
  padding-right: 0;
  padding-bottom: 0;
  padding-left: 0;
  background: var(--color-surface);
`;

const Header = styled.header`
  min-height: var(--space-12);
  display: grid;
  grid-template-columns: var(--space-12) 1fr var(--space-12);
  align-items: center;
  padding-inline: var(--space-5);

  h1 {
    font-size: var(--font-size-500);
    font-weight: 700;
    text-align: center;
  }
`;

const HeaderSpacer = styled.span`
  width: var(--space-12);
`;

const ScrollContent = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
  padding: var(--space-5) var(--space-5)
    calc(var(--space-10) + var(--app-safe-area-bottom, 0px));
`;

const AccountSummary = styled.section`
  display: flex;
  align-items: center;
  gap: var(--space-4);
  min-width: 0;
  padding: var(--space-5);
  border: 1px solid var(--color-brand-200);
  border-radius: 20px;
  background: var(--color-brand-100);

  > div:last-of-type {
    min-width: 0;
    display: grid;
    gap: var(--space-1);
  }

  strong {
    overflow: hidden;
    font-size: var(--font-size-300);
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    line-height: var(--line-height-subtitle);
  }
`;

const AccountMark = styled.span`
  width: var(--space-12);
  height: var(--space-12);
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: var(--color-secondary-300);
  color: var(--color-brand-900);
  font-size: var(--font-size-400);
  font-weight: 800;
`;

const SettingsSection = styled.section`
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-7);
`;

const SectionLabel = styled.h2`
  padding-inline: var(--space-1);
  color: var(--color-brand-700);
  font-size: var(--font-size-100);
  font-weight: 700;
`;

const SettingsList = styled.div`
  overflow: hidden;
  border-block: 1px solid var(--color-neutral-400);

  > button + button {
    border-top: 1px solid var(--color-neutral-300);
  }
`;

const ToggleList = styled.div`
  overflow: hidden;
  border-block: 1px solid var(--color-neutral-400);
`;

const ToggleRow = styled.div`
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-1);

  & + & {
    border-top: 1px solid var(--color-neutral-300);
  }
`;

const ToggleLabel = styled.label`
  color: var(--color-text);
  font-size: var(--font-size-200);
  font-weight: 650;
  cursor: pointer;
`;

const Switch = styled.label`
  position: relative;
  width: 50px;
  height: 29px;
  flex: none;

  input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  span {
    position: absolute;
    inset: 0;
    border-radius: 999px;
    background: var(--color-neutral-500);
    cursor: pointer;
    transition: background 180ms ease;
  }

  span::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 23px;
    height: 23px;
    border-radius: 50%;
    background: var(--color-white);
    box-shadow: 0 2px 7px
      color-mix(in srgb, var(--color-neutral-1300) 18%, transparent);
    transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  input:checked + span {
    background: var(--color-secondary-600);
  }

  input:checked + span::after {
    transform: translateX(21px);
  }

  input:focus-visible + span {
    outline: 3px solid var(--color-brand-300);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    span,
    span::after {
      transition: none;
    }
  }
`;

const SettingsRow = styled(BaseButton)`
  width: 100%;
  min-width: 0;
  min-height: 68px;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 20px;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-1);
  border-radius: 0;
  background: var(--color-surface);
  text-align: left;

  > svg {
    width: 19px;
    height: 19px;
    color: var(--color-neutral-700);
  }

  &:hover {
    background: var(--color-neutral-200);
  }

  &:focus-visible {
    position: relative;
    z-index: 1;
    outline: 2px solid var(--color-brand-500);
    outline-offset: -2px;
  }
`;

const RowIcon = styled.span<{
  $tone: "brand" | "secondary" | "bridge" | "neutral";
}>`
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background: ${({ $tone }) =>
    $tone === "brand"
      ? "var(--color-brand-200)"
      : $tone === "secondary"
        ? "var(--color-secondary-200)"
        : $tone === "bridge"
          ? "color-mix(in srgb, var(--color-accent-bridge) 34%, white)"
          : "var(--color-neutral-300)"};
  color: ${({ $tone }) =>
    $tone === "secondary"
      ? "var(--color-secondary-900)"
      : $tone === "neutral"
        ? "var(--color-neutral-1000)"
        : "var(--color-brand-900)"};

  svg {
    width: 19px;
    height: 19px;
    stroke-width: 1.8;
  }
`;

const RowCopy = styled.span`
  min-width: 0;
  display: grid;
  gap: 2px;

  strong {
    font-size: var(--font-size-200);
    font-weight: 650;
  }

  span {
    overflow: hidden;
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    line-height: var(--line-height-subtitle);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @container app-viewport (max-width: 340px) {
    span {
      white-space: normal;
    }
  }
`;

const AccountActions = styled.div`
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-8);
`;

const LogoutButton = styled(BaseButton)`
  min-height: var(--space-12);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border: 1px solid var(--color-neutral-500);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-error);
  font-size: var(--font-size-100);
  font-weight: 600;

  svg {
    width: 18px;
    height: 18px;
  }
`;

const Feedback = styled.p`
  color: var(--color-error);
  font-size: var(--font-size-100);
  text-align: center;
`;
