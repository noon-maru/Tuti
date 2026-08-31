"use client";

import styled from "@emotion/styled";
import { BellRing, ChevronLeft, Clock3, ShieldCheck } from "lucide-react";
import { BaseButton, PrimaryButton } from "@/features/tuti/components/buttons";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import type {
  DailyNotificationStyle,
  LocalNotificationStatus,
} from "@/features/tuti/notifications/localNotifications";
import type { PushNotificationStatus } from "@/features/tuti/notifications/pushNotifications";

export function NotificationSettingsScreen({
  enabled,
  time,
  dailyReminderStyle,
  status,
  inquiryReplyEnabled,
  pushStatus,
  busy,
  message,
  onBack,
  onEnabledChange,
  onTimeChange,
  onStyleChange,
  onPreview,
  onInquiryReplyEnabledChange,
}: {
  enabled: boolean;
  time: string;
  dailyReminderStyle: DailyNotificationStyle;
  status: LocalNotificationStatus | null;
  inquiryReplyEnabled: boolean;
  pushStatus: PushNotificationStatus | null;
  busy: boolean;
  message: string | null;
  onBack: () => void;
  onEnabledChange: (enabled: boolean) => Promise<void>;
  onTimeChange: (time: string) => Promise<void>;
  onStyleChange: (style: DailyNotificationStyle) => Promise<void>;
  onPreview: () => Promise<void>;
  onInquiryReplyEnabledChange: (enabled: boolean) => Promise<void>;
}) {
  const supported = status?.supported ?? true;
  const permissionDenied = status?.permission === "denied";

  return (
    <Frame>
      <Header>
        <BackButton type="button" aria-label="메인으로 돌아가기" onClick={onBack}>
          <ChevronLeft aria-hidden="true" />
        </BackButton>
        <h1>알림 설정</h1>
        <HeaderSpacer aria-hidden="true" />
      </Header>

      <ScrollContent data-scroll-region>
        <IntroCard>
          <IntroIcon aria-hidden="true">
            <BellRing />
          </IntroIcon>
          <div>
            <strong>오늘의 공기를 원하는 방식으로 떠올려드려요.</strong>
            <p>
              정해둔 시간에 하루 한 번만 알려드리고, 원할 때 바로 끌 수
              있어요.
            </p>
          </div>
        </IntroCard>

        {!supported ? (
          <UnsupportedCard>
            <strong>앱에서 사용할 수 있어요.</strong>
            <p>
              로컬 알림은 iPhone과 Android에 설치한 Tuti 앱에서 설정할 수
              있어요.
            </p>
          </UnsupportedCard>
        ) : (
          <SettingsCard>
            <SettingRow>
              <SettingCopy>
                <strong>오늘의 Tuti</strong>
                <p>하루를 시작하기 좋은 시간을 직접 정해보세요.</p>
              </SettingCopy>
              <Switch>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="오늘의 Tuti 알림"
                  checked={enabled}
                  disabled={busy}
                  onChange={(event) =>
                    void onEnabledChange(event.currentTarget.checked)
                  }
                />
                <span aria-hidden="true" />
              </Switch>
            </SettingRow>

            <TimeRow $enabled={enabled}>
              <Clock3 aria-hidden="true" />
              <label htmlFor="daily-tuti-time">알림 시간</label>
              <input
                id="daily-tuti-time"
                type="time"
                value={time}
                disabled={!enabled || busy}
                onChange={(event) => void onTimeChange(event.currentTarget.value)}
              />
            </TimeRow>

            <StyleFieldset disabled={!enabled || busy}>
              <legend>알림 방식</legend>
              <StyleOptions>
                <StyleOption $selected={dailyReminderStyle === "quiet"}>
                  <input
                    type="radio"
                    name="daily-notification-style"
                    value="quiet"
                    checked={dailyReminderStyle === "quiet"}
                    onChange={() => void onStyleChange("quiet")}
                  />
                  <span>
                    <strong>조용히</strong>
                    <small>알림함에 가볍게 남겨요.</small>
                  </span>
                </StyleOption>
                <StyleOption $selected={dailyReminderStyle === "prominent"}>
                  <input
                    type="radio"
                    name="daily-notification-style"
                    value="prominent"
                    checked={dailyReminderStyle === "prominent"}
                    onChange={() => void onStyleChange("prominent")}
                  />
                  <span>
                    <strong>팝업으로</strong>
                    <small>바로 알아볼 수 있게 띄워요.</small>
                  </span>
                </StyleOption>
              </StyleOptions>
            </StyleFieldset>

            {enabled && (
              <PreviewButton
                type="button"
                disabled={busy}
                onClick={() => void onPreview()}
              >
                5초 뒤 테스트 알림 받기
              </PreviewButton>
            )}
          </SettingsCard>
        )}

        {pushStatus?.supported && (
          <SettingsCard>
            <SettingRow>
              <SettingCopy>
                <strong>문의 답변</strong>
                <p>남겨둔 1:1 문의에 답변이 도착했을 때만 알려드려요.</p>
              </SettingCopy>
              <Switch>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="문의 답변 알림"
                  checked={inquiryReplyEnabled}
                  disabled={busy}
                  onChange={(event) =>
                    void onInquiryReplyEnabledChange(event.currentTarget.checked)
                  }
                />
                <span aria-hidden="true" />
              </Switch>
            </SettingRow>
          </SettingsCard>
        )}

        {permissionDenied && (
          <PermissionNotice role="alert">
            <strong>기기에서 알림이 꺼져 있어요.</strong>
            <p>
              시스템 설정에서 Tuti 알림을 허용한 뒤 이 화면으로 돌아와 다시
              켜주세요.
            </p>
          </PermissionNotice>
        )}

        {message && <Feedback role="status">{message}</Feedback>}

        <PrivacySummary>
          <ShieldCheck aria-hidden="true" />
          <div>
            <strong>알림 선택은 언제든 바꿀 수 있어요.</strong>
            <p>
              오늘의 Tuti 시간과 알림 방식은 이 기기에만 보관해요. 문의 답변
              알림을 켜면 알림 전송에 필요한 기기 식별값만 서버에 보관하고,
              끄면 연결을 바로 해제해요.
            </p>
          </div>
        </PrivacySummary>
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
    text-align: center;
  }
`;

const BackButton = styled(BaseButton)`
  width: var(--space-12);
  height: var(--space-12);
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-muted);

  svg {
    width: 30px;
    height: 30px;
  }
`;

const HeaderSpacer = styled.span`
  width: var(--space-12);
`;

const ScrollContent = styled.div`
  flex: 1;
  min-height: 0;
  display: grid;
  align-content: start;
  gap: var(--space-5);
  padding: var(--space-6) var(--space-5)
    calc(var(--space-8) + var(--app-safe-area-bottom, 0px));
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
`;

const IntroCard = styled.section`
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-5);
  border: 1px solid var(--color-secondary-400);
  border-radius: 20px;
  background: var(--color-secondary-100);

  > div:last-of-type {
    display: grid;
    gap: var(--space-1);
  }

  strong {
    font-size: var(--font-size-300);
  }

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const IntroIcon = styled.div`
  width: var(--space-12);
  height: var(--space-12);
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: var(--color-brand-200);
  color: var(--color-brand-800);

  svg {
    width: 24px;
    height: 24px;
  }
`;

const SettingsCard = styled.section`
  display: grid;
  gap: var(--space-5);
  padding: var(--space-5);
  border: 1px solid var(--color-neutral-300);
  border-radius: 20px;
  background: var(--color-surface);
  box-shadow: 0 12px 30px color-mix(in srgb, var(--color-neutral-1300) 7%, transparent);
`;

const SettingRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
`;

const SettingCopy = styled.div`
  display: grid;
  gap: var(--space-1);

  strong {
    font-size: var(--font-size-300);
  }

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const Switch = styled.label`
  position: relative;
  width: 52px;
  height: 30px;
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
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--color-white);
    box-shadow: 0 2px 7px color-mix(in srgb, var(--color-neutral-1300) 18%, transparent);
    transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  input:checked + span {
    background: var(--color-secondary-600);
  }

  input:checked + span::after {
    transform: translateX(22px);
  }

  input:focus-visible + span {
    outline: 3px solid var(--color-brand-300);
    outline-offset: 2px;
  }

  input:disabled + span {
    cursor: wait;
    opacity: 0.6;
  }
`;

const TimeRow = styled.div<{ $enabled: boolean }>`
  min-height: var(--space-12);
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: 16px;
  background: var(--color-neutral-200);
  opacity: ${({ $enabled }) => ($enabled ? 1 : 0.55)};
  transition: opacity 180ms ease;

  svg {
    width: 20px;
    height: 20px;
    color: var(--color-brand-700);
  }

  label {
    font-size: var(--font-size-100);
    font-weight: 600;
  }

  input {
    min-height: 36px;
    padding-inline: var(--space-2);
    border: 0;
    border-radius: 10px;
    background: var(--color-white);
    color: var(--color-text-primary);
    font: inherit;
    font-size: var(--font-size-100);
  }
`;

const StyleFieldset = styled.fieldset`
  display: grid;
  gap: var(--space-2);
  min-width: 0;
  border: 0;

  legend {
    margin-bottom: var(--space-2);
    font-size: var(--font-size-100);
    font-weight: 600;
  }

  &:disabled {
    opacity: 0.55;
  }
`;

const StyleOptions = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
`;

const StyleOption = styled.label<{ $selected: boolean }>`
  position: relative;
  min-width: 0;
  cursor: pointer;

  input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  > span {
    min-height: 76px;
    display: grid;
    align-content: center;
    gap: var(--space-1);
    padding: var(--space-3);
    border: 1px solid
      ${({ $selected }) =>
        $selected
          ? "var(--color-secondary-600)"
          : "var(--color-neutral-400)"};
    border-radius: 16px;
    background: ${({ $selected }) =>
      $selected ? "var(--color-secondary-100)" : "var(--color-white)"};
    transition:
      border-color 180ms ease,
      background 180ms ease;
  }

  strong,
  small {
    display: block;
  }

  strong {
    font-size: var(--font-size-100);
  }

  small {
    color: var(--color-text-muted);
    font-size: var(--font-size-50);
    line-height: 1.45;
  }

  input:focus-visible + span {
    outline: 3px solid var(--color-brand-300);
    outline-offset: 2px;
  }

  input:disabled + span {
    cursor: wait;
  }
`;

const PreviewButton = styled(PrimaryButton)`
  width: 100%;
  min-height: var(--space-12);
  background: var(--color-secondary-500);
  color: var(--color-neutral-1300);
  font-size: var(--font-size-100);
`;

const UnsupportedCard = styled.section`
  display: grid;
  gap: var(--space-2);
  padding: var(--space-5);
  border-radius: 20px;
  background: var(--color-neutral-200);

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const PermissionNotice = styled.section`
  display: grid;
  gap: var(--space-1);
  padding: var(--space-4);
  border: 1px solid color-mix(in srgb, var(--color-error) 34%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--color-error) 7%, var(--color-white));

  strong,
  p {
    font-size: var(--font-size-100);
  }

  p {
    color: var(--color-text-muted);
  }
`;

const Feedback = styled.p`
  padding: var(--space-3) var(--space-4);
  border-radius: 14px;
  background: var(--color-brand-100);
  color: var(--color-brand-1000);
  font-size: var(--font-size-100);
`;

const PrivacySummary = styled.section`
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: 18px;
  background: var(--color-secondary-100);

  svg {
    width: 22px;
    height: 22px;
    flex: none;
    color: var(--color-secondary-900);
  }

  div {
    display: grid;
    gap: var(--space-1);
  }

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;
