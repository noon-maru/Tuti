"use client";

import styled from "@emotion/styled";
import type {
  AdminNotificationDeliveryStatus,
  AdminNotificationPlatform,
  AdminNotificationsResponse,
} from "@/shared/api/admin";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function AdminNotificationsPanel({
  data,
}: {
  data: AdminNotificationsResponse | null;
}) {
  if (!data) {
    return <EmptyState>아직 확인할 알림 운영 데이터가 없습니다.</EmptyState>;
  }

  const deliveryTotal = data.summary.sent24h + data.summary.failed24h;
  const deliveryWidth =
    deliveryTotal === 0
      ? 0
      : (data.summary.sent24h / deliveryTotal) * 100;

  return (
    <PanelRoot>
      <PulseHero>
        <PulseCopy>
          <StatusKicker>알림 전달 상태</StatusKicker>
          <h2>{getNotificationHeadline(data)}</h2>
          <p>
            최근 24시간 전송 결과와 앱별 등록 상태를 한곳에서 확인합니다.
            토큰 원문은 운영 화면에 표시하지 않습니다.
          </p>
        </PulseCopy>
        <HeroMetrics>
          <HeroMetric>
            <span>알림 사용자</span>
            <strong>{data.summary.activeUsers.toLocaleString("ko-KR")}</strong>
          </HeroMetric>
          <HeroMetric>
            <span>활성 기기</span>
            <strong>{data.summary.activeDevices.toLocaleString("ko-KR")}</strong>
          </HeroMetric>
          <HeroMetric>
            <span>전달 성공률</span>
            <strong>
              {data.summary.successRate === null
                ? "—"
                : `${data.summary.successRate}%`}
            </strong>
          </HeroMetric>
        </HeroMetrics>
        <DeliveryTrack
          role="progressbar"
          aria-label="최근 24시간 알림 전달 성공 비율"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={data.summary.successRate ?? undefined}
          aria-valuetext={
            data.summary.successRate === null
              ? "최근 24시간 전송 없음"
              : `${data.summary.successRate}% 성공`
          }
        >
          <DeliverySuccess style={{ width: `${deliveryWidth}%` }} />
        </DeliveryTrack>
        <DeliveryLegend>
          <span>성공 {data.summary.sent24h.toLocaleString("ko-KR")}</span>
          <span>실패·무효 {data.summary.failed24h.toLocaleString("ko-KR")}</span>
          <time>
            마지막 성공 {formatOptionalDate(data.summary.lastSentAt)}
          </time>
          <time>집계 {formatDate(data.generatedAt)}</time>
        </DeliveryLegend>
      </PulseHero>

      <OperationsSection>
        <SectionHeading>
          <div>
            <h3>플랫폼 비교</h3>
            <p>발송 설정과 등록 기기, 최근 전달 결과를 같은 기준으로 비교합니다.</p>
          </div>
        </SectionHeading>
        <TableViewport>
          <NotificationTable>
            <thead>
              <tr>
                <th scope="col">플랫폼</th>
                <th scope="col">발송 범위</th>
                <th scope="col">활성</th>
                <th scope="col">해제</th>
                <th scope="col">무효</th>
                <th scope="col">24시간 성공</th>
                <th scope="col">24시간 실패</th>
                <th scope="col">마지막 성공</th>
              </tr>
            </thead>
            <tbody>
              {data.platforms.map((summary) => {
                const configuration = data.configuration[summary.platform];
                return (
                  <tr key={summary.platform}>
                    <td data-label="플랫폼">
                      <PlatformIdentity>
                        <PlatformMark $platform={summary.platform} aria-hidden="true">
                          {summary.platform === "android" ? "A" : "i"}
                        </PlatformMark>
                        <strong>{getPlatformLabel(summary.platform)}</strong>
                      </PlatformIdentity>
                    </td>
                    <td data-label="발송 범위">
                      <ConfigurationBadge
                        $state={
                          configuration.enabled
                            ? "enabled"
                            : configuration.testMode
                              ? "test"
                              : "disabled"
                        }
                      >
                        {configuration.enabled
                          ? "전체 사용"
                          : configuration.testMode
                            ? "내부 테스트"
                            : "꺼짐"}
                      </ConfigurationBadge>
                      <TableHint>{getConfigurationLabel(configuration)}</TableHint>
                    </td>
                    <td data-label="활성">{summary.activeDevices}</td>
                    <td data-label="해제">{summary.disabledDevices}</td>
                    <td data-label="무효">{summary.invalidatedDevices}</td>
                    <td data-label="24시간 성공">{summary.sent24h}</td>
                    <td data-label="24시간 실패">
                      {summary.failed24h + summary.invalidated24h}
                    </td>
                    <td data-label="마지막 성공">
                      {formatOptionalDate(summary.lastSentAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </NotificationTable>
        </TableViewport>
      </OperationsSection>

      <ContentGrid>
        <OperationsSection>
          <SectionHeading>
            <div>
              <h3>최근 공급자 오류</h3>
              <p>최근 7일 동안 반복된 오류부터 확인합니다.</p>
            </div>
            <CountBadge>{data.errors.length}</CountBadge>
          </SectionHeading>
          {data.errors.length === 0 ? (
            <QuietState>
              <strong>반복되는 오류가 없어요.</strong>
              <span>최근 전송 기록에서 공급자 오류가 발견되지 않았습니다.</span>
            </QuietState>
          ) : (
            <TableViewport>
              <NotificationTable>
                <thead>
                  <tr>
                    <th scope="col">플랫폼</th>
                    <th scope="col">오류 코드</th>
                    <th scope="col">횟수</th>
                    <th scope="col">마지막 발생</th>
                  </tr>
                </thead>
                <tbody>
                  {data.errors.map((error) => (
                    <tr key={`${error.platform}:${error.code}`}>
                      <td data-label="플랫폼">{getPlatformLabel(error.platform)}</td>
                      <td data-label="오류 코드"><code>{error.code}</code></td>
                      <td data-label="횟수"><ErrorCount>{error.count}회</ErrorCount></td>
                      <td data-label="마지막 발생">{formatDate(error.lastOccurredAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </NotificationTable>
            </TableViewport>
          )}
        </OperationsSection>

        <OperationsSection>
          <SectionHeading>
            <div>
              <h3>등록 상태</h3>
              <p>검색 조건에 맞는 최근 기기 최대 60개입니다.</p>
            </div>
            <CountBadge>{data.devices.length}</CountBadge>
          </SectionHeading>
          <DeviceTableViewport
            role="region"
            tabIndex={0}
            aria-label="등록 기기 목록, 최대 60개"
          >
            <NotificationTable>
              <thead>
                <tr>
                  <th scope="col">플랫폼</th>
                  <th scope="col">계정</th>
                  <th scope="col">앱·언어</th>
                  <th scope="col">상태</th>
                  <th scope="col">최근 확인</th>
                </tr>
              </thead>
              <tbody>
                {data.devices.map((device) => (
                  <tr key={device.id}>
                    <td data-label="플랫폼">{getPlatformLabel(device.platform)}</td>
                    <td data-label="계정">
                      <strong>{device.email ?? shortenId(device.userId)}</strong>
                      <TableHint>{shortenId(device.userId)}</TableHint>
                    </td>
                    <td data-label="앱·언어">
                      {device.appVersion ? `v${device.appVersion}` : "버전 미확인"}
                      {device.locale ? ` · ${device.locale}` : ""}
                    </td>
                    <td data-label="상태">
                      <DeviceStatus
                        $state={
                          device.invalidatedAt
                            ? "invalidated"
                            : device.enabled
                              ? "active"
                              : "disabled"
                        }
                      >
                        {device.invalidatedAt
                          ? "토큰 무효"
                          : device.enabled
                            ? "활성"
                            : "해제"}
                      </DeviceStatus>
                    </td>
                    <td data-label="최근 확인">{formatDate(device.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </NotificationTable>
          </DeviceTableViewport>
        </OperationsSection>
      </ContentGrid>

      <OperationsSection>
        <SectionHeading>
          <div>
            <h3>최근 전송 기록</h3>
            <p>검색·필터 조건에 맞는 기록 최대 60개입니다.</p>
          </div>
          <CountBadge>{data.recent.length}</CountBadge>
        </SectionHeading>
        {data.recent.length === 0 ? (
          <QuietState>
            <strong>표시할 전송 기록이 없어요.</strong>
            <span>새 알림이 발송되면 결과가 이곳에 쌓입니다.</span>
          </QuietState>
        ) : (
          <TableViewport>
            <NotificationTable>
              <thead>
                <tr>
                  <th scope="col">결과</th>
                  <th scope="col">알림</th>
                  <th scope="col">계정</th>
                  <th scope="col">플랫폼·공급자</th>
                  <th scope="col">앱 버전</th>
                  <th scope="col">오류</th>
                  <th scope="col">발송 시각</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((delivery) => (
                  <tr key={delivery.id}>
                    <td data-label="결과">
                      <DeliveryStatus $status={delivery.status}>
                        {getDeliveryStatusLabel(delivery.status)}
                      </DeliveryStatus>
                    </td>
                    <td data-label="알림">
                      <strong>{getMessageTypeLabel(delivery.messageType)}</strong>
                    </td>
                    <td data-label="계정">
                      {delivery.email ?? shortenId(delivery.userId)}
                    </td>
                    <td data-label="플랫폼·공급자">
                      {getPlatformLabel(delivery.platform)} · {delivery.provider}
                    </td>
                    <td data-label="앱 버전">{delivery.appVersion ?? "—"}</td>
                    <td data-label="오류">
                      {delivery.errorCode || delivery.errorMessage ? (
                        <DeliveryError>
                          <summary>
                            {delivery.errorCode ?? "오류 상세"}
                          </summary>
                          {delivery.errorMessage && (
                            <span>{delivery.errorMessage}</span>
                          )}
                        </DeliveryError>
                      ) : "—"}
                    </td>
                    <td data-label="발송 시각">{formatDate(delivery.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </NotificationTable>
          </TableViewport>
        )}
      </OperationsSection>
    </PanelRoot>
  );
}

function getNotificationHeadline(data: AdminNotificationsResponse) {
  if (data.summary.failed24h > 0) {
    return `전달하지 못한 알림이 ${data.summary.failed24h}건 있어요.`;
  }
  if (data.summary.sent24h > 0) {
    return `최근 24시간 알림 ${data.summary.sent24h}건을 안정적으로 전달했어요.`;
  }
  return "새 알림을 기다리는 중이에요.";
}

function getConfigurationLabel(configuration: {
  enabled: boolean;
  testMode: boolean;
}) {
  if (configuration.enabled) return "등록된 모든 사용자에게 발송 가능";
  if (configuration.testMode) return "허용된 테스트 계정에만 발송";
  return "서버 발송이 비활성화된 상태";
}

function getPlatformLabel(platform: AdminNotificationPlatform) {
  return platform === "android" ? "Android" : "iOS";
}

function getDeliveryStatusLabel(status: AdminNotificationDeliveryStatus) {
  if (status === "sent") return "전달 성공";
  if (status === "invalidated") return "토큰 무효";
  return "전달 실패";
}

function getMessageTypeLabel(messageType: string) {
  if (messageType === "inquiry-answered") return "문의 답변";
  return messageType;
}

function shortenId(value: string | null) {
  if (!value) return "사용자 연결 없음";
  return `${value.slice(0, 8)}…`;
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function formatOptionalDate(value: string | null) {
  return value ? formatDate(value) : "기록 없음";
}

const PanelRoot = styled.div`
  display: grid;
  gap: var(--space-6);
`;

const PulseHero = styled.section`
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-6);
  padding: var(--space-5);
  border: 1px solid var(--color-brand-200);
  border-radius: 8px;
  background: var(--color-white);
  box-shadow: none;

  &::before {
    position: absolute;
    inset: 0 0 auto;
    height: 3px;
    background: linear-gradient(
      90deg,
      var(--color-brand-500),
      var(--color-accent-bridge) 52%,
      var(--color-secondary-500)
    );
    content: "";
  }

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
    gap: var(--space-5);
    padding: var(--space-5);
    border-radius: 8px;
  }
`;

const PulseCopy = styled.div`
  max-width: 680px;

  h2 {
    margin-top: var(--space-2);
    font-size: clamp(var(--font-size-500), 2.2vw, var(--font-size-700));
    line-height: 1.3;
    letter-spacing: var(--letter-spacing-heading);
  }

  p {
    max-width: 56ch;
    margin-top: var(--space-3);
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    line-height: 1.65;
  }
`;

const StatusKicker = styled.span`
  color: var(--color-brand-800);
  font-size: var(--font-size-100);
  font-weight: 700;
`;

const HeroMetrics = styled.div`
  display: flex;
  align-items: stretch;
  gap: var(--space-2);
`;

const HeroMetric = styled.div`
  min-width: 112px;
  display: grid;
  align-content: center;
  gap: var(--space-1);
  padding: var(--space-4);
  border-radius: 6px;
  background: var(--color-neutral-100);

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  strong {
    font-size: var(--font-size-600);
    line-height: 1;
  }

  @media (max-width: 480px) {
    min-width: 0;
    flex: 1;
  }
`;

const DeliveryTrack = styled.div`
  grid-column: 1 / -1;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--color-neutral-300);
`;

const DeliverySuccess = styled.div`
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    var(--color-brand-500),
    var(--color-accent-bridge),
    var(--color-secondary-500)
  );
  transition: width 320ms ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const DeliveryLegend = styled.div`
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);

  time {
    margin-left: auto;
  }

  @media (max-width: 520px) {
    time {
      width: 100%;
      margin-left: 0;
    }
  }
`;

const PlatformIdentity = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-3);

  h3 {
    font-size: var(--font-size-300);
  }

  p {
    margin-top: 2px;
    color: var(--color-text-muted);
    font-size: 12px;
  }
`;

const PlatformMark = styled.span<{ $platform: AdminNotificationPlatform }>`
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: ${({ $platform }) =>
    $platform === "android"
      ? "var(--color-secondary-300)"
      : "var(--color-brand-200)"};
  color: var(--color-text);
  font-size: var(--font-size-200);
  font-weight: 800;
`;

const ConfigurationBadge = styled.span<{
  $state: "enabled" | "test" | "disabled";
}>`
  flex: 0 0 auto;
  padding: 6px 10px;
  border-radius: 999px;
  background: ${({ $state }) =>
    $state === "enabled"
      ? "var(--color-secondary-300)"
      : $state === "test"
        ? "var(--color-brand-200)"
        : "var(--color-neutral-300)"};
  color: var(--color-text);
  font-size: 11px;
  font-weight: 700;
`;

const ContentGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(280px, 0.8fr) minmax(0, 1.2fr);
  align-items: start;
  gap: var(--space-4);

  @media (max-width: 940px) {
    grid-template-columns: 1fr;
  }
`;

const OperationsSection = styled.section`
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-white);
  box-shadow: none;
`;

const SectionHeading = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border);

  h3 {
    font-size: var(--font-size-300);
  }

  p {
    margin-top: var(--space-1);
    color: var(--color-text-muted);
    font-size: 12px;
  }
`;

const CountBadge = styled.span`
  min-width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--color-brand-100);
  color: var(--color-brand-800);
  font-size: 12px;
  font-weight: 700;
`;

const QuietState = styled.div`
  min-height: 128px;
  display: grid;
  align-content: center;
  gap: var(--space-1);
  padding: var(--space-5);
  color: var(--color-text-muted);

  strong {
    color: var(--color-text);
    font-size: var(--font-size-200);
  }

  span {
    font-size: 12px;
  }
`;

const ErrorCount = styled.strong`
  color: var(--color-error);
`;

const DeviceStatus = styled.span<{
  $state: "active" | "disabled" | "invalidated";
}>`
  padding: 5px 8px;
  border-radius: 999px;
  background: ${({ $state }) =>
    $state === "active"
      ? "var(--color-secondary-200)"
      : $state === "invalidated"
        ? "color-mix(in srgb, var(--color-error) 9%, var(--color-white))"
        : "var(--color-neutral-200)"};
  color: ${({ $state }) =>
    $state === "invalidated" ? "var(--color-error)" : "var(--color-text)"};
  font-size: 10px;
  font-weight: 700;
`;

const DeliveryStatus = styled.span<{
  $status: AdminNotificationDeliveryStatus;
}>`
  padding: 5px 8px;
  border-radius: 999px;
  background: ${({ $status }) =>
    $status === "sent"
      ? "var(--color-secondary-200)"
      : "color-mix(in srgb, var(--color-error) 9%, var(--color-white))"};
  color: ${({ $status }) =>
    $status === "sent" ? "var(--color-text)" : "var(--color-error)"};
  font-weight: 700;
`;

const DeliveryError = styled.details`
  max-width: 240px;
  color: var(--color-error);
  font-size: 11px;

  summary {
    min-height: 44px;
    display: flex;
    align-items: center;
    overflow: hidden;
    cursor: pointer;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    display: block;
    padding-bottom: var(--space-2);
    color: var(--color-text-muted);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
`;

const TableViewport = styled.div`
  overflow-x: auto;
`;

const DeviceTableViewport = styled(TableViewport)`
  max-height: min(480px, 58dvh);
  overflow: auto;
  overscroll-behavior: contain;

  thead th {
    position: sticky;
    z-index: 1;
    top: 0;
  }
`;

const NotificationTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-100);
  font-variant-numeric: tabular-nums;

  th,
  td {
    padding: 12px var(--space-4);
    border-bottom: 1px solid var(--color-border);
    text-align: left;
    vertical-align: middle;
  }

  th {
    background: var(--color-neutral-200);
    color: var(--color-text-muted);
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }

  tbody tr:hover {
    background: var(--color-brand-100);
  }

  code {
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 11px;
  }

  @media (max-width: 680px) {
    display: block;

    thead {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    tbody,
    tr {
      display: grid;
    }

    tr {
      border-bottom: 1px solid var(--color-border);
    }

    tr:last-child {
      border-bottom: 0;
    }

    td {
      display: grid;
      grid-template-columns: minmax(92px, 34%) minmax(0, 1fr);
      align-items: center;
      gap: var(--space-3);
      padding: 10px var(--space-4);
      border-bottom: 1px solid var(--color-neutral-300);
      overflow-wrap: anywhere;

      &::before {
        color: var(--color-text-muted);
        font-size: 11px;
        font-weight: 700;
        content: attr(data-label);
      }

      > * {
        grid-column: 2;
      }
    }

    tr td:last-child {
      border-bottom: 0;
    }

    tbody tr:last-child td {
      border-bottom: 1px solid var(--color-neutral-300);
    }

    tbody tr:last-child td:last-child {
      border-bottom: 0;
    }
  }
`;

const TableHint = styled.span`
  display: block;
  margin-top: 3px;
  color: var(--color-text-muted);
  font-size: 11px;
`;

const EmptyState = styled.div`
  min-height: 240px;
  display: grid;
  place-items: center;
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-white);
  color: var(--color-text-muted);
`;
