"use client";

import styled from "@emotion/styled";
import type { AdminBusinessMetricsResponse } from "@/shared/api/admin";

const dayFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "numeric",
  day: "numeric",
});

export function AdminBusinessMetricsPanel({
  data,
  days,
  onDaysChange,
}: {
  data: AdminBusinessMetricsResponse | null;
  days: number;
  onDaysChange: (days: number) => void;
}) {
  if (!data) return <Empty>사업 지표를 계산할 데이터가 아직 없습니다.</Empty>;
  const maximumDaily = Math.max(1, ...data.daily.map((day) => day.activeUsers));

  return (
    <Layout>
      <Controls>
        <Observation>
          관측 시작 {data.trackingStartedAt ? formatDate(data.trackingStartedAt) : "기록 없음"}
        </Observation>
        <PeriodSelect
          value={days}
          onChange={(event) => onDaysChange(Number(event.target.value))}
          aria-label="사업 지표 추이 기간"
        >
          <option value={30}>최근 30일 추이</option>
          <option value={90}>최근 90일 추이</option>
        </PeriodSelect>
      </Controls>

      <NorthStarPanel>
        <NorthStarIdentity>
          <MetricLabel>월간 행동전환 사용자</MetricLabel>
          <NorthStarValue>
            {formatNumber(data.northStar.monthlyActionUsers)}
            <span>명</span>
          </NorthStarValue>
        </NorthStarIdentity>
        <NorthStarRate>
          <strong>{formatRate(data.northStar.monthlyActionUserRate)}</strong>
          <span>MAU 중 출발 준비·길찾기·방문 확인·기록에 도달</span>
        </NorthStarRate>
      </NorthStarPanel>

      <AudienceLedger aria-label="핵심 활성 사용자 지표">
        <MauMetric>
          <MetricLabel>월간 활성 사용자</MetricLabel>
          <MetricValue>{formatNumber(data.audience.mau)}</MetricValue>
          <MetricUnit>MAU · 최근 30일</MetricUnit>
        </MauMetric>
        <Metric>
          <MetricLabel>오늘 활성</MetricLabel>
          <MetricValue>{formatNumber(data.audience.dau)}</MetricValue>
          <MetricUnit>DAU</MetricUnit>
        </Metric>
        <Metric>
          <MetricLabel>주간 활성</MetricLabel>
          <MetricValue>{formatNumber(data.audience.wau)}</MetricValue>
          <MetricUnit>WAU · 최근 7일</MetricUnit>
        </Metric>
        <Metric>
          <MetricLabel>일간 활성도</MetricLabel>
          <MetricValue>{formatRate(data.audience.dauMauRate)}</MetricValue>
          <MetricUnit>DAU / MAU</MetricUnit>
        </Metric>
        <Metric>
          <MetricLabel>30일 재방문률</MetricLabel>
          <MetricValue>{formatRate(data.audience.returnRate30d)}</MetricValue>
          <MetricUnit>{formatNumber(data.audience.returningUsers30d)}명 · 2일 이상 방문</MetricUnit>
        </Metric>
        <Metric>
          <MetricLabel>신규 사용자</MetricLabel>
          <MetricValue>{formatNumber(data.audience.newUsers30d)}</MetricValue>
          <MetricUnit>익명 계정 포함 · 최근 30일</MetricUnit>
        </Metric>
        <Metric>
          <MetricLabel>신규 로그인 사용자</MetricLabel>
          <MetricValue>
            {formatNumber(data.audience.newAuthenticatedUsers30d)}
          </MetricValue>
          <MetricUnit>첫 로그인 연결 · 최근 30일</MetricUnit>
        </Metric>
        <Metric>
          <MetricLabel>신규 로그인 전환율</MetricLabel>
          <MetricValue>
            {formatRate(data.audience.newUserAuthenticationRate30d)}
          </MetricValue>
          <MetricUnit>신규 사용자 중 로그인 전환</MetricUnit>
        </Metric>
        <Metric>
          <MetricLabel>로그인 활성 사용자</MetricLabel>
          <MetricValue>{formatRate(data.audience.authenticatedMauRate)}</MetricValue>
          <MetricUnit>{formatNumber(data.audience.authenticatedMau)}명 / MAU</MetricUnit>
        </Metric>
      </AudienceLedger>

      <SignalGrid>
        <Panel>
          <SectionHeading>
            <h2>신규 사용자 활성화</h2>
            <SectionMeta>최근 30일</SectionMeta>
          </SectionHeading>
          <SignalLead>
            <strong>
              {formatRate(data.activation.firstRecommendationRate30d)}
            </strong>
            <span>
              신규 사용자 {formatNumber(data.audience.newUsers30d)}명 중{" "}
              {formatNumber(data.activation.firstRecommendationUsers30d)}명이
              첫 추천 확인
            </span>
          </SignalLead>
          <SignalRow>
            <span>첫 추천까지 걸린 시간</span>
            <strong>
              {formatDuration(
                data.activation.medianMinutesToFirstRecommendation,
              )}
            </strong>
          </SignalRow>
        </Panel>

        <Panel>
          <SectionHeading>
            <h2>반복 이용 강도</h2>
            <SectionMeta>최근 30일 · MAU 기준</SectionMeta>
          </SectionHeading>
          <SignalRows>
            <SignalRow>
              <span>사용자당 활성 일수</span>
              <strong>{formatDecimal(data.engagement.averageActiveDaysPerMau)}일</strong>
            </SignalRow>
            <SignalRow>
              <span>사용자당 추천 횟수</span>
              <strong>{formatDecimal(data.engagement.averageRecommendationsPerMau)}회</strong>
            </SignalRow>
            <SignalRow>
              <span>추천 2회 이상 사용자</span>
              <strong>
                {formatRate(data.engagement.repeatRecommendationRate30d)}
              </strong>
            </SignalRow>
          </SignalRows>
        </Panel>

        <Panel>
          <SectionHeading>
            <h2>직전 기간 대비</h2>
            <SectionMeta>각 {data.periodDays}일</SectionMeta>
          </SectionHeading>
          <ComparisonList>
            {data.comparison.map((item) => (
              <ComparisonRow key={item.key}>
                <span>{item.label}</span>
                <ComparisonValues>
                  <strong>{formatNumber(item.current)}</strong>
                  <small>이전 {formatNumber(item.previous)}</small>
                  <ChangeRate $value={item.changeRate}>
                    {formatChangeRate(item.changeRate)}
                  </ChangeRate>
                </ComparisonValues>
              </ComparisonRow>
            ))}
          </ComparisonList>
        </Panel>
      </SignalGrid>

      <Panel>
        <SectionHeading>
          <h2>활성 사용자 흐름</h2>
          <Legend aria-label="차트 범례">
            <span data-tone="active">활성</span>
            <span data-tone="returning">재방문</span>
            <span data-tone="new">신규 사용자</span>
            <span data-tone="authenticated">신규 로그인</span>
          </Legend>
        </SectionHeading>
        <DailyChart aria-label={`최근 ${data.periodDays}일 사용자 활동 추이`}>
          {data.daily.map((day, index) => (
            <DailyColumn
              key={day.date}
              title={`${day.date} · 활성 ${day.activeUsers}명 · 재방문 ${day.returningUsers}명 · 신규 사용자 ${day.newUsers}명 · 신규 로그인 ${day.newAuthenticatedUsers}명`}
            >
              <BarTrack>
                <ActiveBar
                  style={{
                    height: day.activeUsers
                      ? `${Math.max(4, (day.activeUsers / maximumDaily) * 100)}%`
                      : 0,
                  }}
                />
                <ReturningBar
                  style={{
                    height: day.returningUsers
                      ? `${Math.max(3, (day.returningUsers / maximumDaily) * 100)}%`
                      : 0,
                  }}
                />
                {day.newUsers > 0 && <NewMarker aria-hidden="true" />}
                {day.newAuthenticatedUsers > 0 && (
                  <NewAuthenticatedMarker aria-hidden="true" />
                )}
              </BarTrack>
              {(data.periodDays === 30
                ? index % 5 === 0 || index === data.daily.length - 1
                : index % 15 === 0 || index === data.daily.length - 1) && (
                <DayLabel>{formatDay(day.date)}</DayLabel>
              )}
            </DailyColumn>
          ))}
        </DailyChart>
      </Panel>

      <TwoColumn>
        <Panel>
          <SectionHeading>
            <h2>사용 단계</h2>
            <SectionMeta>사용자 기준 · 최근 {data.periodDays}일</SectionMeta>
          </SectionHeading>
          <StageList>
            {data.stages.map((stage, index) => (
              <StageRow key={stage.key}>
                <StageIdentity>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{stage.label}</strong>
                </StageIdentity>
                <StageMeasure>
                  <StageTrack>
                    <StageFill style={{ width: `${stage.rateFromActive}%` }} />
                  </StageTrack>
                  <StageNumbers>
                    <strong>{formatNumber(stage.users)}명</strong>
                    <span>
                      {index === 0
                        ? "기준"
                        : `이전 단계의 ${formatRate(stage.rateFromPrevious)}`}
                    </span>
                  </StageNumbers>
                </StageMeasure>
              </StageRow>
            ))}
          </StageList>
        </Panel>

        <Panel>
          <SectionHeading>
            <h2>MAU 이용 환경</h2>
            <SectionMeta>사용자의 최근 접속 환경</SectionMeta>
          </SectionHeading>
          <PlatformList>
            {data.platforms.map((platform) => (
              <PlatformRow key={platform.platform}>
                <span>{getPlatformLabel(platform.platform)}</span>
                <PlatformTrack>
                  <PlatformFill style={{ width: `${platform.rate}%` }} />
                </PlatformTrack>
                <strong>{formatNumber(platform.users)}명</strong>
                <small>{formatRate(platform.rate)}</small>
              </PlatformRow>
            ))}
          </PlatformList>
        </Panel>
      </TwoColumn>

      <Panel>
        <SectionHeading>
          <h2>첫 방문 주차별 재방문</h2>
          <SectionMeta>완료된 주차만 확정값으로 표시</SectionMeta>
        </SectionHeading>
        {data.cohorts.length === 0 ? (
          <Empty>주차별 재방문을 계산할 만큼 관측 기간이 쌓이지 않았습니다.</Empty>
        ) : (
          <CohortViewport>
            <CohortTable>
              <thead>
                <tr>
                  <th scope="col">첫 방문 주</th>
                  <th scope="col">사용자</th>
                  <th scope="col">첫 주</th>
                  <th scope="col">1주 후</th>
                  <th scope="col">2주 후</th>
                  <th scope="col">3주 후</th>
                  <th scope="col">4주 후</th>
                </tr>
              </thead>
              <tbody>
                {data.cohorts.map((cohort) => (
                  <tr key={cohort.cohortWeek}>
                    <th scope="row">{formatCohortWeek(cohort.cohortWeek)}</th>
                    <td>{formatNumber(cohort.newUsers)}명</td>
                    {cohort.retention.map((rate, index) => (
                      <RetentionCell
                        key={index}
                        data-band={retentionBand(rate)}
                      >
                        {rate === null ? "—" : formatRate(rate)}
                      </RetentionCell>
                    ))}
                  </tr>
                ))}
              </tbody>
            </CohortTable>
          </CohortViewport>
        )}
      </Panel>

      <Footnote>
        활성 사용자는 내부·QA 및 관리자 계정을 제외한 세션 시작 기준입니다.
        신규 로그인 사용자는 최초 로그인 수단이 연결된 날짜를 기준으로 합니다.
        재방문은 최근 30일 중 서로 다른 날짜에 2회 이상 방문한 사용자이며,
        코호트는 Tuti가 활동 관측을 시작한 이후의 첫 방문을 기준으로 계산합니다.
      </Footnote>
    </Layout>
  );
}

function formatNumber(value: number) {
  return value.toLocaleString("ko-KR");
}

function formatRate(value: number) {
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
}

function formatDecimal(value: number) {
  return value.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
}

function formatDuration(value: number | null) {
  if (value === null) return "아직 계산할 수 없음";
  if (value < 1) return "1분 이내";
  if (value < 60) return `${formatDecimal(value)}분`;
  return `${formatDecimal(value / 60)}시간`;
}

function formatChangeRate(value: number | null) {
  if (value === null) return "새로 발생";
  if (value === 0) return "변화 없음";
  return `${value > 0 ? "+" : ""}${formatDecimal(value)}%`;
}

function formatDay(value: string) {
  return dayFormatter.format(new Date(`${value}T00:00:00+09:00`));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function formatCohortWeek(value: string) {
  return `${formatDay(value)} 시작`;
}

function getPlatformLabel(platform: "web" | "android" | "ios") {
  if (platform === "android") return "Android";
  if (platform === "ios") return "iOS";
  return "Web";
}

function retentionBand(rate: number | null) {
  if (rate === null) return "pending";
  if (rate >= 60) return "high";
  if (rate >= 30) return "medium";
  if (rate > 0) return "low";
  return "none";
}

const Layout = styled.section`
  display: grid;
  gap: var(--space-5);
`;

const Controls = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--color-border);
`;

const Observation = styled.span`
  color: var(--color-text-muted);
  font-size: 11px;
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

const AudienceLedger = styled.div`
  display: grid;
  grid-template-columns: 1.35fr repeat(4, minmax(120px, 1fr));
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--color-white);

  @media (max-width: 980px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const NorthStarPanel = styled.section`
  min-height: 124px;
  display: grid;
  grid-template-columns: minmax(210px, 0.7fr) minmax(280px, 1.3fr);
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-5) var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-brand-100);

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    gap: var(--space-3);
    padding: var(--space-5);
  }
`;

const NorthStarIdentity = styled.div`
  display: grid;
  gap: var(--space-1);
`;

const NorthStarValue = styled.strong`
  color: var(--color-text);
  font-size: clamp(32px, 4vw, 48px);
  font-weight: 800;
  letter-spacing: -0.05em;
  line-height: 1;

  span {
    margin-left: 5px;
    font-size: var(--font-size-200);
    font-weight: 700;
    letter-spacing: 0;
  }
`;

const NorthStarRate = styled.div`
  display: grid;
  gap: var(--space-2);

  strong {
    font-size: var(--font-size-600);
    font-weight: 800;
  }

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    line-height: var(--line-height-body);
  }
`;

const SignalGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);

  @media (max-width: 1050px) {
    grid-template-columns: 1fr;
  }
`;

const SignalLead = styled.div`
  display: grid;
  gap: var(--space-2);
  padding: var(--space-4) 0;
  border-bottom: 1px solid var(--color-border);

  > strong {
    font-size: clamp(28px, 3vw, 38px);
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 1;
  }

  > span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    line-height: var(--line-height-body);
  }
`;

const SignalRows = styled.div`
  display: grid;
`;

const SignalRow = styled.div`
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  border-bottom: 1px solid var(--color-border);

  &:last-of-type {
    border-bottom: 0;
  }

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  strong {
    font-size: var(--font-size-200);
    font-weight: 800;
    white-space: nowrap;
  }
`;

const ComparisonList = styled.div`
  display: grid;
`;

const ComparisonRow = styled.div`
  min-height: 48px;
  display: grid;
  grid-template-columns: minmax(90px, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  border-bottom: 1px solid var(--color-border);

  &:last-of-type {
    border-bottom: 0;
  }

  > span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const ComparisonValues = styled.div`
  display: grid;
  grid-template-columns: minmax(28px, auto) minmax(52px, auto) minmax(68px, auto);
  align-items: baseline;
  gap: var(--space-2);
  text-align: right;

  strong {
    font-size: var(--font-size-200);
    font-weight: 800;
  }

  small {
    color: var(--color-text-muted);
    font-size: 10px;
  }
`;

const ChangeRate = styled.span<{ $value: number | null }>`
  color: ${({ $value }) =>
    $value === null || $value === 0
      ? "var(--color-text-muted)"
      : $value > 0
        ? "var(--color-success)"
        : "var(--color-error)"};
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
`;

const Metric = styled.div`
  min-height: 116px;
  display: grid;
  align-content: center;
  gap: 5px;
  padding: var(--space-4) var(--space-5);
  border-right: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
`;

const MauMetric = styled(Metric)`
  background: var(--color-brand-100);
`;

const MetricLabel = styled.span`
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 600;
`;

const MetricValue = styled.strong`
  color: var(--color-text);
  font-size: clamp(26px, 3vw, 38px);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.04em;
  line-height: 1;
`;

const MetricUnit = styled.small`
  color: var(--color-text-muted);
  font-size: 10px;
  line-height: 1.4;
`;

const Panel = styled.section`
  min-width: 0;
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-white);
`;

const TwoColumn = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.65fr);
  gap: var(--space-5);

  @media (max-width: 940px) {
    grid-template-columns: 1fr;
  }
`;

const SectionHeading = styled.header`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-4);

  h2 {
    margin: 0;
    font-size: var(--font-size-300);
    font-weight: 700;
  }
`;

const SectionMeta = styled.span`
  color: var(--color-text-muted);
  font-size: 11px;
`;

const Legend = styled.div`
  display: flex;
  gap: var(--space-3);

  span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--color-text-muted);
    font-size: 10px;
  }

  span::before {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: var(--color-brand-300);
    content: "";
  }

  span[data-tone="returning"]::before {
    background: var(--color-secondary-500);
  }

  span[data-tone="new"]::before {
    border-radius: 50%;
    background: var(--color-brand-800);
  }

  span[data-tone="authenticated"]::before {
    border-radius: 50%;
    background: var(--color-secondary-700);
  }
`;

const DailyChart = styled.div`
  height: 190px;
  display: flex;
  align-items: stretch;
  gap: 3px;
  overflow-x: auto;
  padding-top: var(--space-3);
  border-bottom: 1px solid var(--color-border);
`;

const DailyColumn = styled.div`
  min-width: 4px;
  flex: 1;
  display: grid;
  grid-template-rows: 1fr 26px;
  gap: var(--space-1);
`;

const BarTrack = styled.div`
  position: relative;
  display: flex;
  align-items: end;
  background: var(--color-neutral-100);
`;

const ActiveBar = styled.i`
  position: absolute;
  inset: auto 0 0;
  min-height: 4px;
  background: var(--color-brand-300);
`;

const ReturningBar = styled.i`
  position: absolute;
  inset: auto 0 0;
  background: var(--color-secondary-500);
`;

const NewMarker = styled.i`
  position: absolute;
  top: -3px;
  left: 36%;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-brand-800);
  transform: translateX(-50%);
`;

const NewAuthenticatedMarker = styled(NewMarker)`
  left: 64%;
  background: var(--color-secondary-700);
`;

const DayLabel = styled.span`
  color: var(--color-text-muted);
  font-size: 9px;
  text-align: center;
  white-space: nowrap;
`;

const StageList = styled.ol`
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const StageRow = styled.li`
  display: grid;
  grid-template-columns: minmax(130px, 0.55fr) minmax(180px, 1fr);
  gap: var(--space-4);
  align-items: center;
  min-height: 56px;
  border-top: 1px solid var(--color-border);

  @media (max-width: 540px) {
    grid-template-columns: 1fr;
    gap: var(--space-2);
    padding: var(--space-3) 0;
  }
`;

const StageIdentity = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-3);

  span {
    color: var(--color-brand-700);
    font-size: 10px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  strong {
    font-size: var(--font-size-100);
  }
`;

const StageMeasure = styled.div`
  display: grid;
  grid-template-columns: minmax(80px, 1fr) 128px;
  gap: var(--space-3);
  align-items: center;
`;

const StageTrack = styled.div`
  height: 7px;
  overflow: hidden;
  background: var(--color-neutral-200);
`;

const StageFill = styled.i`
  display: block;
  height: 100%;
  background: var(--color-accent-bridge);
`;

const StageNumbers = styled.div`
  display: grid;
  grid-template-columns: 48px 1fr;
  gap: var(--space-2);
  align-items: baseline;

  strong {
    font-size: var(--font-size-100);
    font-variant-numeric: tabular-nums;
  }

  span {
    color: var(--color-text-muted);
    font-size: 10px;
  }
`;

const PlatformList = styled.div`
  display: grid;
`;

const PlatformRow = styled.div`
  display: grid;
  grid-template-columns: 64px minmax(70px, 1fr) 42px 46px;
  gap: var(--space-3);
  align-items: center;
  min-height: 54px;
  border-top: 1px solid var(--color-border);
  font-size: var(--font-size-100);

  strong,
  small {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  small {
    color: var(--color-text-muted);
  }
`;

const PlatformTrack = styled.div`
  height: 7px;
  background: var(--color-neutral-200);
`;

const PlatformFill = styled.i`
  display: block;
  height: 100%;
  background: var(--color-brand-500);
`;

const CohortViewport = styled.div`
  overflow-x: auto;
`;

const CohortTable = styled.table`
  width: 100%;
  min-width: 700px;
  border-collapse: collapse;
  font-size: var(--font-size-100);

  th,
  td {
    height: 46px;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border);
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  thead th,
  tbody th {
    background: var(--color-neutral-100);
    color: var(--color-text-muted);
    font-size: 10px;
    font-weight: 700;
  }

  tbody th {
    text-align: left;
  }
`;

const RetentionCell = styled.td`
  &[data-band="pending"] {
    color: var(--color-text-muted);
    background: var(--color-neutral-100);
  }

  &[data-band="low"] {
    background: var(--color-brand-100);
  }

  &[data-band="medium"] {
    background: var(--color-accent-bridge);
  }

  &[data-band="high"] {
    background: var(--color-secondary-500);
    font-weight: 700;
  }
`;

const Footnote = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 10px;
  line-height: 1.7;
`;

const Empty = styled.div`
  min-height: 96px;
  display: grid;
  place-items: center;
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  text-align: center;
`;
