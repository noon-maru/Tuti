import type { EngagementMetrics } from "@/shared/api/engagementMetrics";
import { MetricsLedger as Ledger, MetricsValue as Metric, MetricsPanel as Panel, MetricsTable as Table } from "./AdminMetricsPrimitives";

const number = (value: number) => value.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
export function formatActiveSeconds(seconds: number | null, empty = "미계측") {
  if (seconds === null || !Number.isFinite(seconds)) return empty;
  const rounded = Math.round(seconds);
  if (rounded < 60) return `${rounded}초`;
  const minutes = Math.floor(rounded / 60), rest = rounded % 60;
  return `${number(minutes)}분${rest ? ` ${rest}초` : ""}`;
}
const percent = (n: number, total: number) => total ? `${number(n / total * 100)}%` : "집계 불가";
const metric = (label: string, value: string, detail: string) => <Metric key={label}><dt>{label}</dt><dd>{value}</dd><small>{detail}</small></Metric>;
const platforms: Record<string, string> = { web: "웹", android: "Android", ios: "iOS", unknown: "미상" };

export function AdminEngagementMetricsPanel({ data }: { data: EngagementMetrics | undefined }) {
  if (!data) return <Panel><h3>이용·리텐션</h3><p>미계측</p></Panel>;
  const c = data.coverage, s = data.sessions;
  const emptyDuration = c.measuredSince ? "집계 중" : "미계측";
  return <>
    <Panel><h3>계측 범위</h3><Ledger>
      {metric("활동 계정", number(c.activeUsers), "기존·신규 활동 로그 합집합")}
      {metric("새 활동 계측 계정", number(c.lifecycleUsers), "고유 계정")}
      {metric("활성 시간 계측 계정", number(c.measuredUsers), "진행 중 세션 포함")}
      {metric("활성 시간 계측률", c.rate == null ? "집계 불가" : `${number(c.rate)}%`, `${number(c.measuredUsers)} / ${number(c.activeUsers)}계정`)}
      {metric("기존 로그만 있는 계정", number(c.legacyOnlyUsers), "활성 시간 소급 불가")}
    </Ledger></Panel>
    <Panel><h3>활성 체류 시간 · 측정 {number(s.measured)} / 관측 {number(s.observed)}세션</h3><Ledger>
      {metric("평균", formatActiveSeconds(s.meanSeconds, emptyDuration), "전경 · 최근 1분 상호작용")}
      {metric("중앙값", formatActiveSeconds(s.medianSeconds, emptyDuration), "30분 무활동 세션 기준")}
      {metric("P90", formatActiveSeconds(s.p90Seconds, emptyDuration), `${number(s.measured)}세션 기준`)}
      {metric("10초 미만 활성 세션", s.measured ? percent(s.shortSessions, s.measured) : emptyDuration, `${number(s.shortSessions)} / ${number(s.measured)}세션`)}
      {metric("관측 활동 구간 평균", formatActiveSeconds(s.observedSpanMeanSeconds), `이벤트 간격 · ${number(s.observedSpanSessions)}세션`)}
      {metric("집계 보류 세션", number(s.incomplete), "시작 누락·최근 30분 활동")}
    </Ledger>
      <details><summary>활성 시간 분포</summary><Table><table><thead><tr><th>활성 시간</th><th>세션</th><th>비중</th></tr></thead><tbody>{data.distribution.map(row => <tr key={row.label}><th>{row.label}</th><td>{s.measured ? number(row.sessions) : emptyDuration}</td><td>{s.measured ? percent(row.sessions, s.measured) : "—"}</td></tr>)}</tbody></table></Table></details>
    </Panel>
    <Panel><h3>관측 방문 리텐션</h3><Ledger>{data.retention.map(row => metric(`D${row.day} 재방문`, row.rate == null ? row.pending ? "집계 중" : "집계 불가" : `${number(row.rate)}%`, `관측 완료 ${number(row.eligible)}계정 · 대기 ${number(row.pending)}계정`))}</Ledger>
      <details><summary>첫 관측일별 리텐션 · 한국 날짜 기준</summary>{data.cohorts.length ? <Table><table><thead><tr><th>첫 관측일</th><th>계정</th><th>D1</th><th>D7</th><th>D30</th></tr></thead><tbody>{data.cohorts.map(row => <tr key={row.day}><th>{row.day}</th><td>{number(row.users)}</td>{[row.d1, row.d7, row.d30].map((value, i) => <td key={i}>{value == null ? "집계 중" : `${number(value)}%`}</td>)}</tr>)}</tbody></table></Table> : <p>첫 관측 코호트 없음</p>}</details>
    </Panel>
    <Panel><h3>환경·버전별 비교</h3>{data.environments.length ? <Table><table><thead><tr><th>환경</th><th>버전</th><th>활동 계정</th><th>시간 계측 계정</th><th>계측률</th><th>측정 세션</th><th>활성 평균</th><th>중앙값</th></tr></thead><tbody>{data.environments.map(row => <tr key={`${row.platform}:${row.appVersion}`}><th>{platforms[row.platform] ?? "미상"}</th><td>{row.appVersion === "unknown" ? "미상" : row.appVersion}</td><td>{number(row.users)}</td><td>{number(row.measuredUsers)}</td><td>{percent(row.measuredUsers, row.users)}</td><td>{number(row.measuredSessions)}</td><td>{formatActiveSeconds(row.meanSeconds, "—")}</td><td>{formatActiveSeconds(row.medianSeconds, "—")}</td></tr>)}</tbody></table></Table> : <p>관측 내역 없음</p>}</Panel>
  </>;
}
