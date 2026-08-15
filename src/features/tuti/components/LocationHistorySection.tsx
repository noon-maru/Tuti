"use client";

import styled from "@emotion/styled";
import { useState } from "react";
import { BaseButton } from "@/features/tuti/components/buttons";
import { fetchLocationHistory } from "@/lib/tutiApi";
import type {
  LocationConsentHistoryItem,
  LocationHistoryResponse,
  LocationUsageHistoryItem,
} from "@/shared/api/locationHistory";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function LocationHistorySection() {
  const [history, setHistory] = useState<LocationHistoryResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (history || loading) return;
    setLoading(true);
    setError(null);
    try {
      setHistory(await fetchLocationHistory());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "위치정보 이용내역을 불러오지 못했어요.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <HistoryArea>
      <HistoryButton type="button" aria-expanded={open} onClick={() => void toggle()}>
        <span>내 위치정보 이용내역</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </HistoryButton>
      {open && (
        <HistoryContent>
          {loading && <StateText>이용내역을 확인하고 있어요.</StateText>}
          {error && <ErrorText role="alert">{error}</ErrorText>}
          {history && (
            <>
              <HistoryNotice>{history.notice}</HistoryNotice>
              <HistoryGroup>
                <h3>동의 상태 변경</h3>
                {history.consentEvents.length ? (
                  history.consentEvents.map((item) => (
                    <ConsentRow key={item.id} item={item} />
                  ))
                ) : (
                  <StateText>기록된 동의 상태가 없어요.</StateText>
                )}
              </HistoryGroup>
              <HistoryGroup>
                <h3>위치 이용·외부 전달</h3>
                <small>최근 {history.usageLogs.length}건 · 전체 {history.usageLogTotal}건</small>
                {history.usageLogs.length ? (
                  history.usageLogs.map((item) => (
                    <UsageRow key={item.id} item={item} />
                  ))
                ) : (
                  <StateText>위치정보를 이용한 기록이 없어요.</StateText>
                )}
              </HistoryGroup>
            </>
          )}
        </HistoryContent>
      )}
    </HistoryArea>
  );
}

function ConsentRow({ item }: { item: LocationConsentHistoryItem }) {
  const labels = {
    accepted: "동의",
    paused: "일시중지",
    declined: "미동의",
    withdrawn: "철회",
  } as const;
  return (
    <HistoryRow>
      <div>
        <strong>{labels[item.status]}</strong>
        <span>약관 {item.termsVersion} · {platformLabel(item.clientPlatform)}</span>
      </div>
      <time>{formatDate(item.createdAt)}</time>
    </HistoryRow>
  );
}

function UsageRow({ item }: { item: LocationUsageHistoryItem }) {
  return (
    <HistoryRow>
      <div>
        <strong>
          {item.kind === "external_transfer"
            ? `${item.externalRecipient ?? "외부 서비스"} 전달`
            : serviceLabel(item.service)}
        </strong>
        <span>
          {item.acquisitionSource === "photo_exif" ? "사진 촬영 위치" : "기기 현재 위치"}
          {item.externalPurpose ? ` · ${item.externalPurpose}` : ""}
        </span>
      </div>
      <time>{formatDate(item.occurredAt)}</time>
    </HistoryRow>
  );
}

function serviceLabel(service: LocationUsageHistoryItem["service"]) {
  return {
    recommendation: "장소 추천",
    travel_time: "이동시간 확인",
    departure_plan: "출발 계획",
    photo_nearby: "사진 주변 장소 찾기",
  }[service];
}

function platformLabel(platform: string) {
  return platform === "ios" ? "iOS" : platform === "android" ? "Android" : "웹";
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

const HistoryArea = styled.section`
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 20px;
  background: var(--color-surface);
`;

const HistoryButton = styled(BaseButton)`
  width: 100%;
  min-height: var(--space-12);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  color: var(--color-text-primary);
  font-size: var(--font-size-100);
  font-weight: 600;
`;

const HistoryContent = styled.div`
  display: grid;
  gap: var(--space-5);
  padding: 0 var(--space-4) var(--space-4);
`;

const HistoryNotice = styled.p`
  padding: var(--space-3);
  border-radius: 12px;
  background: var(--color-neutral-200);
  color: var(--color-text-secondary);
  font-size: var(--font-size-100);
  line-height: var(--line-height-body);
`;

const HistoryGroup = styled.div`
  display: grid;
  gap: var(--space-2);

  h3 {
    font-size: var(--font-size-100);
  }

  > small {
    color: var(--color-text-secondary);
    font-size: var(--font-size-100);
  }
`;

const HistoryRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding-block: var(--space-3);
  border-bottom: 1px solid var(--color-neutral-300);

  div {
    min-width: 0;
    display: grid;
    gap: var(--space-1);
  }

  strong {
    font-size: var(--font-size-100);
  }

  span,
  time {
    color: var(--color-text-secondary);
    font-size: var(--font-size-100);
    line-height: var(--line-height-body);
  }

  time {
    flex: none;
    white-space: nowrap;
  }
`;

const StateText = styled.p`
  color: var(--color-text-secondary);
  font-size: var(--font-size-100);
`;

const ErrorText = styled(StateText)`
  color: var(--color-error);
`;
