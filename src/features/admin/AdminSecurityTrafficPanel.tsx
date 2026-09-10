"use client";

import styled from "@emotion/styled";
import type {
  AdminSecurityTrafficResponse,
  AdminTrafficFinding,
} from "@/shared/api/admin";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});
const dayFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "numeric",
  day: "numeric",
});

export function AdminSecurityTrafficPanel({
  data,
  days,
  onDaysChange,
}: {
  data: AdminSecurityTrafficResponse | null;
  days: number;
  onDaysChange: (days: number) => void;
}) {
  if (!data) return <Empty>트래픽 관측 데이터가 아직 없습니다.</Empty>;

  const safeRequests = Math.max(1, data.summary.requests);
  const humanRate = (data.summary.likelyHumanRequests / safeRequests) * 100;
  const botRate = (data.summary.botRequests / safeRequests) * 100;
  const unknownRate = (data.summary.unknownRequests / safeRequests) * 100;
  const maximumDailyRequests = Math.max(1, ...data.daily.map((day) => day.requests));

  return (
    <Layout>
      <PeriodControls>
        <PeriodSelect
          value={days}
          onChange={(event) => onDaysChange(Number(event.target.value))}
          aria-label="보안 관제 조회 기간"
        >
          <option value={7}>최근 7일</option>
          <option value={30}>최근 30일</option>
          <option value={90}>최근 90일</option>
        </PeriodSelect>
      </PeriodControls>

      <SignalBoard>
        <SignalLead>
          <span>앱 활동 확인 사용자</span>
          <strong>{formatNumber(data.summary.activityConfirmedUsers)}</strong>
          <small>화면 실행 이벤트가 저장된 계정</small>
        </SignalLead>
        <SignalItem>
          <span>관측 요청</span>
          <strong>{formatNumber(data.summary.requests)}</strong>
        </SignalItem>
        <SignalItem>
          <span>일일 방문 식별자</span>
          <strong>{formatNumber(data.summary.dailyVisitors)}</strong>
        </SignalItem>
        <SignalItem data-alert={data.summary.riskyRequests > 0}>
          <span>위험 신호 요청</span>
          <strong>{formatNumber(data.summary.riskyRequests)}</strong>
        </SignalItem>
        <SignalItem data-alert={data.summary.rateLimitedRequests > 0}>
          <span>요청 제한</span>
          <strong>{formatNumber(data.summary.rateLimitedRequests)}</strong>
        </SignalItem>
      </SignalBoard>

      <CompositionSection>
        <SectionHeading>
          <h3>트래픽 구성</h3>
          <TrackingLabel>
            {data.trackingStartedAt
              ? `관측 시작 ${formatDate(data.trackingStartedAt)}`
              : "배포 후부터 관측"}
          </TrackingLabel>
        </SectionHeading>
        <CompositionRail aria-label="트래픽 추정 구성">
          <CompositionPart
            data-kind="human"
            style={{ width: `${humanRate}%` }}
            title={`사람 가능성 높음 ${formatRate(humanRate)}`}
          />
          <CompositionPart
            data-kind="bot"
            style={{ width: `${botRate}%` }}
            title={`봇·자동화 ${formatRate(botRate)}`}
          />
          <CompositionPart
            data-kind="unknown"
            style={{ width: `${unknownRate}%` }}
            title={`판단 보류 ${formatRate(unknownRate)}`}
          />
        </CompositionRail>
        <Legend>
          <LegendItem data-kind="human">
            <i /> 사람 가능성 높음 <strong>{formatRate(humanRate)}</strong>
          </LegendItem>
          <LegendItem data-kind="bot">
            <i /> 자칭 검색봇·자동화 <strong>{formatRate(botRate)}</strong>
          </LegendItem>
          <LegendItem data-kind="unknown">
            <i /> 판단 보류 <strong>{formatRate(unknownRate)}</strong>
          </LegendItem>
        </Legend>
      </CompositionSection>

      <DailySection>
        <SectionHeading>
          <h3>날짜별 요청 흐름</h3>
        </SectionHeading>
        <DailyRail>
          {data.daily.map((day, index) => {
            const height = day.requests
              ? Math.max(5, (day.requests / maximumDailyRequests) * 100)
              : 0;
            const humanShare = day.requests
              ? (day.likelyHuman / day.requests) * 100
              : 0;
            const botShare = day.requests
              ? ((day.declaredBots + day.automation) / day.requests) * 100
              : 0;
            return (
              <DailyColumn
                key={day.date}
                title={`${day.date} · ${formatNumber(day.requests)}건`}
              >
                <DailyBar style={{ height: `${height}%` }}>
                  <DailySegment data-kind="unknown" style={{ flex: Math.max(0, 100 - humanShare - botShare) }} />
                  <DailySegment data-kind="bot" style={{ flex: botShare }} />
                  <DailySegment data-kind="human" style={{ flex: humanShare }} />
                  {day.risky > 0 && <RiskTick aria-label={`위험 신호 ${day.risky}건`} />}
                </DailyBar>
                {(days <= 7 || index === 0 || index === data.daily.length - 1) && (
                  <DayLabel>{formatDay(day.date)}</DayLabel>
                )}
              </DailyColumn>
            );
          })}
        </DailyRail>
      </DailySection>

      <DataGrid>
        <TableSection>
          <SectionHeading>
            <h3>확인할 공격 징후</h3>
          </SectionHeading>
          {data.findings.length === 0 ? (
            <CalmState>조회 기간에 분류된 공격 징후가 없습니다.</CalmState>
          ) : (
            <TableViewport>
              <Table>
                <thead>
                  <tr>
                    <th>위험도</th>
                    <th>신호</th>
                    <th>경로</th>
                    <th>요청</th>
                    <th>일일 식별자</th>
                    <th>최근 관측</th>
                  </tr>
                </thead>
                <tbody>
                  {data.findings.map((finding) => (
                    <tr key={`${finding.signal}:${finding.pathGroup}:${finding.riskLevel}`}>
                      <td data-label="위험도">
                        <RiskBadge data-risk={finding.riskLevel}>
                          {getRiskLabel(finding.riskLevel)}
                        </RiskBadge>
                      </td>
                      <td data-label="신호">{getSignalLabel(finding.signal)}</td>
                      <td data-label="경로"><CodeText>{finding.pathGroup}</CodeText></td>
                      <td data-label="요청">
                        {formatNumber(finding.requestCount)}
                        {finding.rateLimitedCount > 0 && (
                          <Subtle>제한 {formatNumber(finding.rateLimitedCount)}</Subtle>
                        )}
                      </td>
                      <td data-label="일일 식별자">{formatNumber(finding.dailyVisitors)}</td>
                      <td data-label="최근 관측">{formatDate(finding.lastSeenAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableViewport>
          )}
        </TableSection>

        <TableSection>
          <SectionHeading>
            <h3>요청이 모인 경로</h3>
          </SectionHeading>
          {data.routes.length === 0 ? (
            <Empty>아직 관측된 요청이 없습니다.</Empty>
          ) : (
            <RouteList>
              {data.routes.slice(0, 10).map((route) => {
                const automated = route.declaredBots + route.automation;
                return (
                  <RouteRow key={route.pathGroup}>
                    <CodeText>{route.pathGroup}</CodeText>
                    <RouteMeter>
                      <span data-kind="human" style={{ flex: route.likelyHuman }} />
                      <span data-kind="bot" style={{ flex: automated }} />
                      <span data-kind="unknown" style={{ flex: route.unknown }} />
                    </RouteMeter>
                    <strong>{formatNumber(route.total)}</strong>
                  </RouteRow>
                );
              })}
            </RouteList>
          )}
        </TableSection>
      </DataGrid>

      <Footnote>
        ‘일일 방문 식별자’는 IP와 User-Agent를 서버에서 즉시 HMAC 처리한 뒤 하루마다
        바뀌는 값입니다. 같은 사람의 여러 기기·네트워크는 별도로 잡힐 수 있고,
        자칭 검색봇은 명칭을 위조할 수 있으므로 확정 방문자 수로 사용하지 않습니다.
      </Footnote>
    </Layout>
  );
}

function getRiskLabel(risk: AdminTrafficFinding["riskLevel"]) {
  return risk === "high" ? "높음" : risk === "medium" ? "주의" : "낮음";
}

function getSignalLabel(signal: string) {
  if (signal === "scanner_path") return "취약 경로 탐색";
  if (signal === "injection_probe") return "주입 패턴 탐색";
  if (signal === "prohibited_method") return "비허용 메서드";
  if (signal === "rate_limited") return "요청 제한 도달";
  if (signal === "missing_user_agent") return "클라이언트 정보 없음";
  if (signal === "automation_agent") return "자동화 도구";
  return signal;
}

function formatNumber(value: number) {
  return value.toLocaleString("ko-KR");
}

function formatRate(value: number) {
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
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
  h2 { font-size: var(--font-size-500); letter-spacing: var(--letter-spacing-heading); }
  p { max-width: 70ch; margin-top: var(--space-2); color: var(--color-text-muted); font-size: var(--font-size-100); line-height: 1.6; }
  @media (max-width: 640px) { align-items: stretch; flex-direction: column; }
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

const SignalBoard = styled.div`
  display: grid;
  grid-template-columns: 1.45fr repeat(4, 1fr);
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-white);
  @media (max-width: 820px) { grid-template-columns: repeat(2, 1fr); }
`;

const SignalItem = styled.div`
  min-height: 102px;
  display: grid;
  align-content: center;
  gap: var(--space-2);
  padding: var(--space-4);
  border-right: 1px solid var(--color-border);
  span, small { color: var(--color-text-muted); font-size: 11px; }
  strong { font-size: var(--font-size-600); font-variant-numeric: tabular-nums; }
  &[data-alert="true"] strong { color: var(--color-danger-600, #c54848); }
  @media (max-width: 820px) { border-bottom: 1px solid var(--color-border); }
`;

const SignalLead = styled(SignalItem)`
  position: relative;
  background: var(--color-brand-100);
  &::before { position: absolute; inset: 0 auto 0 0; width: 4px; background: linear-gradient(var(--color-brand-500), var(--color-accent-bridge), var(--color-secondary-500)); content: ""; }
`;

const CompositionSection = styled.section`
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-white);
`;

const DailySection = styled(CompositionSection)``;

const SectionHeading = styled.header`
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: var(--space-4);
  h3 { font-size: var(--font-size-300); }
  p, span { margin-top: 2px; color: var(--color-text-muted); font-size: 11px; }
  @media (max-width: 640px) { align-items: start; flex-direction: column; }
`;

const TrackingLabel = styled.span`
  white-space: nowrap;
`;

const CompositionRail = styled.div`
  height: 18px;
  display: flex;
  overflow: hidden;
  border-radius: 3px;
  background: var(--color-neutral-200);
`;

const CompositionPart = styled.span`
  min-width: 0;
  transition: width 240ms ease;
  &[data-kind="human"] { background: var(--color-brand-500); }
  &[data-kind="bot"] { background: var(--color-secondary-500); }
  &[data-kind="unknown"] { background: var(--color-neutral-400); }
`;

const Legend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3) var(--space-5);
`;

const LegendItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: 12px;
  i { width: 8px; height: 8px; border-radius: 2px; background: var(--color-neutral-400); }
  &[data-kind="human"] i { background: var(--color-brand-500); }
  &[data-kind="bot"] i { background: var(--color-secondary-500); }
  strong { color: var(--color-text); font-variant-numeric: tabular-nums; }
`;

const DailyRail = styled.div`
  height: 170px;
  display: flex;
  align-items: stretch;
  gap: clamp(3px, 0.6vw, 9px);
  padding-top: var(--space-2);
`;

const DailyColumn = styled.div`
  min-width: 3px;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: end;
  gap: var(--space-2);
`;

const DailyBar = styled.div`
  position: relative;
  width: 100%;
  max-width: 28px;
  min-height: 2px;
  display: flex;
  flex-direction: column;
  overflow: visible;
  border-radius: 3px 3px 1px 1px;
`;

const DailySegment = styled.span`
  min-height: 0;
  &[data-kind="human"] { background: var(--color-brand-500); }
  &[data-kind="bot"] { background: var(--color-secondary-500); }
  &[data-kind="unknown"] { background: var(--color-neutral-400); }
  &:first-of-type { border-radius: 3px 3px 0 0; }
`;

const RiskTick = styled.i`
  position: absolute;
  top: -5px;
  left: 50%;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-danger-500, #df6666);
  transform: translateX(-50%);
`;

const DayLabel = styled.span`
  min-height: 15px;
  color: var(--color-text-muted);
  font-size: 10px;
  white-space: nowrap;
`;

const DataGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(300px, 0.8fr);
  gap: var(--space-5);
  align-items: start;
  @media (max-width: 980px) { grid-template-columns: 1fr; }
`;

const TableSection = styled.section`
  min-width: 0;
  display: grid;
  gap: var(--space-3);
`;

const TableViewport = styled.div`
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-white);
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  th, td { padding: 13px var(--space-3); border-bottom: 1px solid var(--color-border); text-align: left; vertical-align: middle; }
  th { color: var(--color-text-muted); font-size: 11px; font-weight: 600; white-space: nowrap; }
  tbody tr:last-child td { border-bottom: 0; }
  @media (max-width: 680px) {
    thead { display: none; }
    tbody, tr, td { display: block; }
    tr { padding: var(--space-3); border-bottom: 1px solid var(--color-border); }
    tbody tr:last-child { border-bottom: 0; }
    td { display: flex; justify-content: space-between; gap: var(--space-4); padding: 6px 0; border: 0; text-align: right; }
    td::before { flex: none; color: var(--color-text-muted); content: attr(data-label); }
  }
`;

const RiskBadge = styled.span`
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  padding: 0 9px;
  border-radius: 999px;
  background: var(--color-neutral-200);
  font-size: 11px;
  font-weight: 600;
  &[data-risk="medium"] { background: #fff1cf; color: #815b00; }
  &[data-risk="high"] { background: #ffe2e2; color: #a73737; }
`;

const CodeText = styled.code`
  overflow-wrap: anywhere;
  color: var(--color-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
`;

const Subtle = styled.small`
  display: block;
  margin-top: 2px;
  color: var(--color-text-muted);
  font-size: 10px;
`;

const CalmState = styled.div`
  padding: var(--space-6);
  border: 1px solid var(--color-secondary-300);
  border-radius: 8px;
  background: var(--color-secondary-100);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;

const RouteList = styled.div`
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-white);
`;

const RouteRow = styled.div`
  display: grid;
  grid-template-columns: minmax(110px, 1fr) minmax(90px, 0.8fr) auto;
  align-items: center;
  gap: var(--space-3);
  padding: 13px var(--space-3);
  border-bottom: 1px solid var(--color-border);
  &:last-child { border-bottom: 0; }
  strong { font-size: 12px; font-variant-numeric: tabular-nums; }
`;

const RouteMeter = styled.span`
  height: 6px;
  display: flex;
  overflow: hidden;
  border-radius: 2px;
  background: var(--color-neutral-200);
  span[data-kind="human"] { background: var(--color-brand-500); }
  span[data-kind="bot"] { background: var(--color-secondary-500); }
  span[data-kind="unknown"] { background: var(--color-neutral-400); }
`;

const Empty = styled.div`
  padding: var(--space-7);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-white);
  color: var(--color-text-muted);
  text-align: center;
`;

const Footnote = styled.p`
  color: var(--color-text-muted);
  font-size: 11px;
  line-height: 1.65;
`;
