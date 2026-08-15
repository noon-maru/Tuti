"use client";

import styled from "@emotion/styled";
import {
  ChevronLeft,
  LocateFixed,
  MapPinOff,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import {
  BaseButton,
  PrimaryButton,
} from "@/features/tuti/components/buttons";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import type {
  LocationConsentRecord,
  LocationPermissionStatus,
} from "@/shared/tuti/types";
import { locationTerms } from "@/shared/location/terms";

export function LocationSettingsScreen({
  consent,
  locationAvailable,
  permissionStatus,
  requesting,
  onBack,
  onEnable,
  onWithdraw,
}: {
  consent?: LocationConsentRecord;
  locationAvailable: boolean;
  permissionStatus: LocationPermissionStatus;
  requesting: boolean;
  onBack: () => void;
  onEnable: () => Promise<boolean>;
  onWithdraw: () => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const state = resolveLocationState({
    consent,
    locationAvailable,
    permissionStatus,
  });

  const enableLocation = async () => {
    setMessage(null);
    const enabled = await onEnable();

    if (!enabled) {
      setMessage(
        permissionStatus === "denied"
          ? "기기 설정에서 Tuti의 위치 권한을 허용한 뒤 다시 시도해주세요."
          : "괜찮아요. 위치 없이도 장소를 계속 둘러볼 수 있어요.",
      );
    }
  };

  return (
    <Frame>
      <Header>
        <BackButton type="button" aria-label="메인으로 돌아가기" onClick={onBack}>
          <ChevronLeft aria-hidden="true" />
        </BackButton>
        <h1>위치 설정</h1>
        <HeaderSpacer aria-hidden="true" />
      </Header>

      <ScrollContent data-scroll-region>
        <StatusCard $active={locationAvailable}>
          <StatusIcon aria-hidden="true">
            {locationAvailable ? <LocateFixed /> : <MapPinOff />}
          </StatusIcon>
          <div>
            <strong>{state.title}</strong>
            <p>{state.description}</p>
          </div>
        </StatusCard>

        {message && <Feedback role="status">{message}</Feedback>}

        <Actions>
          {!locationAvailable && (
            <EnableButton
              type="button"
              disabled={requesting}
              onClick={() => void enableLocation()}
            >
              {requesting ? "현재 위치를 확인하고 있어요" : "현재 위치 사용하기"}
            </EnableButton>
          )}
          {consent?.status === "accepted" && (
            <WithdrawButton type="button" onClick={onWithdraw}>
              위치정보 이용 동의 철회
            </WithdrawButton>
          )}
        </Actions>

        <PrivacySummary>
          <ShieldCheck aria-hidden="true" />
          <div>
            <strong>위치는 필요한 순간에만 사용해요.</strong>
            <p>
              백그라운드에서 추적하지 않고, 계정이나 지난 공간에 현재
              좌표를 남기지 않아요.
            </p>
          </div>
        </PrivacySummary>

        <TermsArea>
          <TermsHeading>
            <div>
              <h2>위치기반서비스 이용약관</h2>
              <p>시행일 {locationTerms.effectiveDate}</p>
            </div>
            <span>{consent?.termsVersion ?? "미동의"}</span>
          </TermsHeading>

          <ProviderInfo>
            <strong>
              {locationTerms.provider.businessName} · {locationTerms.provider.serviceName}
            </strong>
            <span>대표 {locationTerms.provider.representative}</span>
            <span>{locationTerms.provider.phone}</span>
            <span>{locationTerms.provider.email}</span>
            <span>{locationTerms.provider.address}</span>
          </ProviderInfo>

          {locationTerms.sections.map((section) => (
            <TermsSection key={section.title}>
              <h3>{section.title}</h3>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </TermsSection>
          ))}
          <TermsAppendix>
            {locationTerms.appendix.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </TermsAppendix>
        </TermsArea>
      </ScrollContent>
    </Frame>
  );
}

function resolveLocationState({
  consent,
  locationAvailable,
  permissionStatus,
}: {
  consent?: LocationConsentRecord;
  locationAvailable: boolean;
  permissionStatus: LocationPermissionStatus;
}) {
  if (locationAvailable) {
    return {
      title: "현재 위치를 사용하고 있어요.",
      description: "가까운 장소와 이동 부담을 현재 위치에 맞춰 계산해요.",
    };
  }

  if (permissionStatus === "denied") {
    return {
      title: "기기의 위치 권한이 꺼져 있어요.",
      description: "위치 없이 추천하며, 정확한 거리와 이동 시간은 표시하지 않아요.",
    };
  }

  if (consent?.status === "withdrawn") {
    return {
      title: "위치 사용을 중지했어요.",
      description: "다시 동의하기 전에는 현재 위치를 요청하지 않아요.",
    };
  }

  if (consent?.status === "declined") {
    return {
      title: "위치 없이 추천하고 있어요.",
      description: "원할 때 언제든 현재 위치를 다시 사용할 수 있어요.",
    };
  }

  return {
    title: "아직 현재 위치를 사용하지 않았어요.",
    description: "위치 없이도 Tuti의 장소와 기록 기능을 이용할 수 있어요.",
  };
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
  min-height: 0;
  display: grid;
  align-content: start;
  gap: var(--space-5);
  padding: var(--space-6) var(--space-5)
    calc(var(--space-8) + var(--app-safe-area-bottom, 0px));
  overflow-y: auto;
  overscroll-behavior: contain;
`;

const StatusCard = styled.section<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-5);
  border: 1px solid
    ${({ $active }) =>
      $active ? "var(--color-secondary-400)" : "var(--color-neutral-300)"};
  border-radius: 20px;
  background: ${({ $active }) =>
    $active ? "var(--color-secondary-100)" : "var(--color-neutral-200)"};

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

const StatusIcon = styled.div`
  width: var(--space-12);
  height: var(--space-12);
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: var(--color-secondary-200);
  color: var(--color-secondary-900);

  svg {
    width: 24px;
    height: 24px;
  }
`;

const Actions = styled.div`
  display: grid;
  gap: var(--space-2);
`;

const EnableButton = styled(PrimaryButton)`
  width: 100%;
  background: var(--color-brand-700);

  &:not(:disabled):hover {
    background: var(--color-brand-800);
  }
`;

const WithdrawButton = styled(BaseButton)`
  min-height: var(--space-12);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-error);
  font-size: var(--font-size-100);
  font-weight: 600;
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

const TermsArea = styled.section`
  display: grid;
  gap: var(--space-5);
  padding-top: var(--space-3);
`;

const TermsHeading = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);

  h2 {
    font-size: var(--font-size-400);
  }

  p,
  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  p {
    margin-top: var(--space-1);
  }

  span {
    flex: none;
  }
`;

const ProviderInfo = styled.div`
  display: grid;
  gap: var(--space-1);
  padding: var(--space-4);
  border-radius: 16px;
  background: var(--color-brand-100);
  font-size: var(--font-size-100);

  span {
    color: var(--color-text-muted);
  }
`;

const TermsSection = styled.section`
  display: grid;
  gap: var(--space-2);

  h3 {
    font-size: var(--font-size-200);
  }

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const TermsAppendix = styled.div`
  display: grid;
  gap: var(--space-1);
  padding: var(--space-4);
  border-radius: 14px;
  background: var(--color-secondary-100);
  color: var(--color-secondary-1000);
  font-size: var(--font-size-100);
`;
