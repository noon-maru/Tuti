"use client";

import styled from "@emotion/styled";
import type {
  AdminUserActivityItem,
  AdminUserActivityResponse,
  AdminUserActivityStage,
} from "@/shared/api/admin";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

const dayFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "numeric",
  day: "numeric",
});

export function AdminUserActivityPanel({
  data,
  days,
  mutatingId,
  onDaysChange,
  onToggleExcluded,
}: {
  data: AdminUserActivityResponse | null;
  days: number;
  mutatingId: string | null;
  onDaysChange: (days: number) => void;
  onToggleExcluded: (user: AdminUserActivityItem) => void;
}) {
  if (!data) return <Empty>사용자 활동 데이터가 아직 없습니다.</Empty>;

  const maximumActivity = Math.max(
    1,
    ...data.daily.map((day) => day.activeUsers),
  );

  return (
    <Layout>
      <PeriodControls>
        <PeriodSelect
          value={days}
          onChange={(event) => onDaysChange(Number(event.target.value))}
          aria-label="사용자 활동 조회 기간"
        >
          <option value={7}>최근 7일</option>
          <option value={30}>최근 30일</option>
          <option value={90}>최근 90일</option>
        </PeriodSelect>
      </PeriodControls>

      <Summary aria-label="사용자 활동 요약">
        <SummaryPrimary>
          <span>의미 있는 사용자</span>
          <strong>{formatNumber(data.summary.meaningfulUsers)}</strong>
          <small>추천 결과까지 도달</small>
        </SummaryPrimary>
        <SummaryItem>
          <span>관측 사용자</span>
          <strong>{formatNumber(data.summary.observedUsers)}</strong>
        </SummaryItem>
        <SummaryItem>
          <span>신규 사용자</span>
          <strong>{formatNumber(data.summary.newUsers)}</strong>
        </SummaryItem>
        <SummaryItem>
          <span>재방문</span>
          <strong>{formatNumber(data.summary.returningUsers)}</strong>
        </SummaryItem>
        <SummaryItem>
          <span>출발·기록 전환</span>
          <strong>{formatNumber(data.summary.convertedUsers)}</strong>
        </SummaryItem>
        <SummaryItem>
          <span>로그인 사용자</span>
          <strong>{formatNumber(data.summary.authenticatedUsers)}</strong>
        </SummaryItem>
        <SummaryItem>
          <span>분석 제외</span>
          <strong>{formatNumber(data.summary.excludedUsers)}</strong>
        </SummaryItem>
      </Summary>

      <ActivitySection>
        <SectionHeading>
          <h3>날짜별 활동</h3>
          {data.trackingStartedAt && (
            <TrackingStart>
              세션 관측 시작 {formatDate(data.trackingStartedAt)}
            </TrackingStart>
          )}
        </SectionHeading>
        <ActivityRail>
          {data.daily.map((day, index) => (
            <ActivityDay key={day.date} title={`${day.date} · 활동 ${day.activeUsers}명`}>
              <BarArea>
                <ActiveBar
                  style={{
                    height: day.activeUsers
                      ? `${Math.max(4, (day.activeUsers / maximumActivity) * 100)}%`
                      : 0,
                  }}
                />
                <MeaningfulBar
                  style={{ height: `${Math.max(0, (day.meaningfulUsers / maximumActivity) * 100)}%` }}
                />
              </BarArea>
              {(days <= 7 || index === 0 || index === data.daily.length - 1) && (
                <DayLabel>{formatDay(day.date)}</DayLabel>
              )}
            </ActivityDay>
          ))}
        </ActivityRail>
      </ActivitySection>

      <UserSection>
        <SectionHeading>
          <h3>사용자별 이용 단계</h3>
          <StageLegend>생성 → 방문 → 추천 → 탐색 → 전환</StageLegend>
        </SectionHeading>
        {data.users.length === 0 ? (
          <Empty>조회 기간에 관측된 사용자가 없습니다.</Empty>
        ) : (
          <TableViewport>
            <Table>
              <thead>
                <tr>
                  <th scope="col">사용자</th>
                  <th scope="col">최종 단계</th>
                  <th scope="col">환경</th>
                  <th scope="col">세션</th>
                  <th scope="col">추천</th>
                  <th scope="col">후속 행동</th>
                  <th scope="col">마지막 활동</th>
                  <th scope="col">분석</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((user) => (
                  <tr key={user.userId} data-excluded={user.excluded}>
                    <td data-label="사용자">
                      <UserIdentity>
                        <strong>{shortUserId(user.userId)}</strong>
                        <small>{getAccountTypeLabel(user.accountType)}</small>
                      </UserIdentity>
                    </td>
                    <td data-label="최종 단계">
                      <StageBadge data-stage={user.stage}>
                        {getStageLabel(user.stage)}
                      </StageBadge>
                    </td>
                    <td data-label="환경">
                      {getPlatformLabel(user.platform)}
                      {user.appVersion && <Subtle>v{user.appVersion}</Subtle>}
                    </td>
                    <td data-label="세션">{formatNumber(user.sessionCount)}</td>
                    <td data-label="추천">{formatNumber(user.recommendationRuns)}</td>
                    <td data-label="후속 행동">
                      {formatNumber(user.recommendationActions)}
                      {user.journalCount > 0 && <Subtle>기록 {user.journalCount}</Subtle>}
                    </td>
                    <td data-label="마지막 활동">{formatDate(user.lastActivityAt)}</td>
                    <td data-label="분석">
                      {user.accountType === "admin" ? (
                        <ExcludedLabel>항상 제외</ExcludedLabel>
                      ) : (
                        <ExcludeButton
                          type="button"
                          disabled={mutatingId === user.userId}
                          data-excluded={user.excluded}
                          onClick={() => onToggleExcluded(user)}
                        >
                          {mutatingId === user.userId
                            ? "저장 중"
                            : user.excluded
                              ? "다시 포함"
                              : "내부·QA 제외"}
                        </ExcludeButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableViewport>
        )}
      </UserSection>
      <Footnote>
        ‘재방문’은 조회 기간에 서로 다른 클라이언트 세션이 두 번 이상 관측된
        경우입니다. 활동 수집 도입 이전 방문은 일부 집계되지 않을 수 있습니다.
      </Footnote>
    </Layout>
  );
}

function getStageLabel(stage: AdminUserActivityStage) {
  if (stage === "converted") return "전환";
  if (stage === "engaged") return "탐색";
  if (stage === "recommended") return "추천";
  if (stage === "visited") return "방문";
  return "계정 생성";
}

function getAccountTypeLabel(type: AdminUserActivityItem["accountType"]) {
  if (type === "authenticated") return "로그인 계정";
  if (type === "admin") return "관리자";
  return "익명 계정";
}

function getPlatformLabel(platform: AdminUserActivityItem["platform"]) {
  if (platform === "android") return "Android";
  if (platform === "ios") return "iOS";
  if (platform === "web") return "Web";
  return "수집 전";
}

function shortUserId(userId: string) {
  return `익명 ${userId.slice(0, 8)}`;
}

function formatNumber(value: number) {
  return value.toLocaleString("ko-KR");
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function formatDay(value: string) {
  return dayFormatter.format(new Date(`${value}T00:00:00+09:00`));
}

const Layout = styled.section`
  display: grid;
  gap: var(--space-5);
`;

const PeriodControls = styled.header`
  display: flex;
  align-items: end;
  justify-content: flex-end;
  gap: var(--space-5);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--color-border);

  h2 {
    font-size: var(--font-size-500);
    letter-spacing: var(--letter-spacing-heading);
  }

  p {
    max-width: 66ch;
    margin-top: var(--space-2);
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    line-height: 1.6;
  }

  @media (max-width: 640px) {
    align-items: stretch;
    flex-direction: column;
  }
`;

const PeriodSelect = styled.select`
  min-height: 42px;
  padding: 0 var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;
  font-size: var(--font-size-100);
`;

const Summary = styled.div`
  display: grid;
  grid-template-columns: 1.45fr repeat(6, minmax(100px, 1fr));
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-white);

  @media (max-width: 900px) {
    grid-template-columns: repeat(3, 1fr);
  }

  @media (max-width: 520px) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

const SummaryItem = styled.div`
  min-height: 104px;
  display: grid;
  align-content: center;
  gap: var(--space-2);
  padding: var(--space-4);
  border-right: 1px solid var(--color-border);

  span,
  small {
    color: var(--color-text-muted);
    font-size: 11px;
  }

  strong {
    font-size: var(--font-size-600);
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 900px) {
    border-bottom: 1px solid var(--color-border);
  }
`;

const SummaryPrimary = styled(SummaryItem)`
  position: relative;
  background: var(--color-brand-100);

  &::before {
    position: absolute;
    inset: 0 auto 0 0;
    width: 4px;
    background: linear-gradient(
      var(--color-brand-500),
      var(--color-accent-bridge),
      var(--color-secondary-500)
    );
    content: "";
  }
`;

const ActivitySection = styled.section`
  display: grid;
  gap: var(--space-3);
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-white);
`;

const UserSection = styled.section`
  display: grid;
  gap: var(--space-3);
`;

const SectionHeading = styled.header`
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: var(--space-4);

  h3 {
    font-size: var(--font-size-300);
  }

  p,
  span {
    margin-top: 2px;
    color: var(--color-text-muted);
    font-size: 11px;
  }

  @media (max-width: 640px) {
    align-items: start;
    flex-direction: column;
  }
`;

const TrackingStart = styled.span`
  white-space: nowrap;
`;

const StageLegend = styled.span`
  word-spacing: var(--space-1);
`;

const ActivityRail = styled.div`
  height: 156px;
  display: flex;
  align-items: stretch;
  gap: 3px;
  padding-top: var(--space-3);
  overflow-x: auto;
  border-bottom: 1px solid var(--color-border);
`;

const ActivityDay = styled.div`
  min-width: 3px;
  flex: 1;
  display: grid;
  grid-template-rows: 1fr 24px;
  gap: var(--space-1);
`;

const BarArea = styled.div`
  position: relative;
  display: flex;
  align-items: end;
  overflow: hidden;
  border-radius: 3px 3px 0 0;
  background: var(--color-neutral-100);
`;

const ActiveBar = styled.i`
  position: absolute;
  inset: auto 0 0;
  min-height: 4px;
  background: var(--color-brand-300);
`;

const MeaningfulBar = styled.i`
  position: absolute;
  inset: auto 0 0;
  background: var(--color-secondary-500);
`;

const DayLabel = styled.span`
  color: var(--color-text-muted);
  font-size: 9px;
  text-align: center;
  white-space: nowrap;
`;

const TableViewport = styled.div`
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-white);
`;

const Table = styled.table`
  width: 100%;
  min-width: 940px;
  border-collapse: collapse;
  font-size: var(--font-size-100);

  th,
  td {
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--color-border);
    text-align: left;
    vertical-align: middle;
  }

  th {
    color: var(--color-text-muted);
    font-size: 11px;
    font-weight: 700;
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }

  tbody tr[data-excluded="true"] {
    opacity: 0.48;
  }

  @media (max-width: 700px) {
    min-width: 0;

    thead {
      display: none;
    }

    tbody,
    tr,
    td {
      display: block;
    }

    tr {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      padding: var(--space-4);
      border-bottom: 1px solid var(--color-border);
    }

    td {
      min-width: 0;
      padding: var(--space-2) 0;
      border: 0;
    }

    td::before {
      display: block;
      margin-bottom: 2px;
      color: var(--color-text-muted);
      font-size: 10px;
      content: attr(data-label);
    }
  }
`;

const UserIdentity = styled.div`
  display: grid;
  gap: 2px;

  strong {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
  }

  small {
    color: var(--color-text-muted);
    font-size: 10px;
  }
`;

const StageBadge = styled.span`
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  padding: 0 var(--space-2);
  border-radius: 999px;
  background: var(--color-neutral-200);
  font-size: 11px;
  font-weight: 700;

  &[data-stage="recommended"] {
    background: var(--color-brand-100);
    color: var(--color-brand-900);
  }

  &[data-stage="engaged"] {
    background: color-mix(in srgb, var(--color-accent-bridge) 32%, white);
  }

  &[data-stage="converted"] {
    background: var(--color-secondary-200);
  }
`;

const Subtle = styled.small`
  display: block;
  margin-top: 2px;
  color: var(--color-text-muted);
  font-size: 10px;
`;

const ExcludeButton = styled.button`
  min-height: 34px;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: 5px;
  background: var(--color-white);
  color: var(--color-text-muted);
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;

  &[data-excluded="true"] {
    border-color: var(--color-brand-300);
    color: var(--color-brand-900);
  }

  &:disabled {
    cursor: wait;
  }
`;

const ExcludedLabel = styled.span`
  color: var(--color-text-muted);
  font-size: 11px;
`;

const Footnote = styled.p`
  color: var(--color-text-muted);
  font-size: 11px;
  line-height: 1.6;
`;

const Empty = styled.div`
  min-height: 180px;
  display: grid;
  place-items: center;
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-white);
  color: var(--color-text-muted);
`;
