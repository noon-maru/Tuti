"use client";
import { useEffect, useState } from "react";
import styled from "@emotion/styled";
import Link from "next/link";
import { fetchAdminJson } from "@/lib/adminApi";
import type { AdminOverview, AdminNotificationsResponse } from "@/shared/api/admin";
import type { LifelogMetricsResponse } from "@/shared/api/lifelogMetrics";
import type { AdminTab } from "./adminNavigation";
import { AdminJobHealthPanel } from "./AdminJobHealthPanel";

export function AdminOperationsHome({ overview, notifications, onNavigate, onNavigatePendingPlaces }: {
  overview: AdminOverview | null; notifications: AdminNotificationsResponse | null;
  onNavigate: (tab: AdminTab) => void; onNavigatePendingPlaces: () => void;
}) {
  const [days, setDays] = useState(7), [attempt, setAttempt] = useState(0);
  const [metrics, setMetrics] = useState<LifelogMetricsResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let active = true;
    fetchAdminJson<LifelogMetricsResponse>(`lifelog-metrics?days=${days}`).then(data => {
      if (active) { setMetrics(data); setStatus("ready"); }
    }).catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [days, attempt]);
  const jobs = overview?.jobs;
  const failures = jobs?.fresh ? jobs.jobs.filter(job => ["failed", "overdue"].includes(job.state)).length : null;
  const unknownJobs = !jobs?.fresh || jobs.jobs.some(job => ["unknown", "disabled"].includes(job.state));
  const rights = overview?.rights;
  const a = metrics?.activity;
  const observed = status === "ready" && Boolean(a?.retainedSince);
  const number = (n?: number) => n == null ? "미확인" : n.toLocaleString("ko-KR");
  const value = (n?: number) => !observed || n == null ? "미계측" : number(n);
  return <Layout>
    {(failures || unknownJobs || (rights?.dueCases ?? 0) > 0) ? <Attention role="status">
      {failures ? `예약 작업 실패·지연 ${failures}개. ` : ""}{unknownJobs ? "예약 작업 관측 확인 필요. " : ""}
      {(rights?.dueCases ?? 0) > 0 ? `검토 기한 도달 권리 요청 ${rights!.dueCases}건.` : ""}
    </Attention> : null}
    <Columns>
      <Section aria-labelledby="product-signal-heading">
        <Heading><h2 id="product-signal-heading">제품 성과</h2><label>관측 기간<select value={days} onChange={e => { setStatus("loading"); setMetrics(null); setDays(Number(e.target.value)); }}>{[7, 30, 90].map(d => <option key={d} value={d}>최근 {d}일</option>)}</select></label></Heading>
        {status === "loading" ? <State role="status">제품 성과를 불러오고 있어요.</State> : status === "error" ? <State role="alert">제품 성과를 불러오지 못했어요. 처리 업무는 계속 확인할 수 있어요.<button type="button" onClick={() => { setStatus("loading"); setAttempt(n => n + 1); }}>다시 불러오기</button></State> : <>
          <Ledger>
            <div><dt>첫 마디 저장 전환</dt><dd>{observed && a?.activation.rate != null ? `${a.activation.rate}%` : "집계 중"}</dd><small>7일 관측 완료 {number(a?.activation.eligible)}계정 · 대기 {number(a?.activation.pending)}계정</small></div>
            <div><dt>다른 날짜 재열람</dt><dd>{value(a?.laterReaderUsers)}</dd><small>기존 본인 마디 · 참여 책 · {days}일 고유 계정</small></div>
            <div><dt>반복 기록 사용자</dt><dd>{value(a?.repeatWriters30d)}</dd><small>30일 내 서로 다른 2일 이상 저장</small></div>
            <div><dt>실제 공동작성 하루마디</dt><dd>{number(metrics?.stock.collaborativeBooks)}권</dd><small>현재 서로 다른 작성자 2명 이상</small></div>
          </Ledger>
          <Meta>{metrics && new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(metrics.asOf))} 기준 · 관리자·분석 제외 계정 제외</Meta>
          <Links><button type="button" onClick={() => onNavigate("business")}>제품 성과 자세히</button><button type="button" onClick={() => onNavigate("funnel")}>나들이 연결</button></Links>
        </>}
      </Section>
      <Section aria-labelledby="operations-queue-heading">
        <Heading><h2 id="operations-queue-heading">지금 처리할 일</h2></Heading>
        <Queue>
          <li><span>기록</span><button type="button" onClick={() => onNavigate("business")}>저장 오류 관측 계정 · {days}일<strong>{status === "ready" && a?.saveFailedUsers != null ? number(a.saveFailedUsers) : "미확인"}</strong></button></li>
          <li><span>기한</span><Link href="/admin/journal-rights">검토 기한 도달 권리 요청<strong>{number(rights?.dueCases)}</strong></Link></li>
          <li><span>기한</span><Link href="/admin/journal-rights">7일 내 검토 예정<strong>{number(rights?.upcomingCases)}</strong></Link></li>
          <li><span>통지</span><Link href="/admin/journal-rights">전달 확인 대기<strong>{number(rights?.pendingNotices)}</strong></Link></li>
          <li><span>서비스</span><a href="#admin-job-status">예약 작업 실패·지연<strong>{number(failures ?? undefined)}</strong></a></li>
          <li><span>서비스</span><button type="button" onClick={() => onNavigate("notifications")}>알림 실패 · 24시간<strong>{number(notifications?.summary.failed24h)}</strong></button></li>
          <li><span>지원</span><button type="button" onClick={() => onNavigate("inquiries")}>답변 대기 문의<strong>{number(overview?.pendingInquiries)}</strong></button></li>
          <li><span>지원</span><button type="button" onClick={() => onNavigate("reports")}>확인할 신고<strong>{number(overview?.pendingReports)}</strong></button></li>
          <li><span>장소</span><button type="button" onClick={onNavigatePendingPlaces}>검토 대기 장소<strong>{number(overview?.pendingPlaces)}</strong></button></li>
        </Queue>
      </Section>
    </Columns>
    <details id="admin-job-status"><summary>예약 작업 상태·관측 근거</summary><AdminJobHealthPanel report={jobs} /></details>
    <Links><button type="button" onClick={() => onNavigate("location")}>위치정보 감사</button><Link href="/admin/tourism-data">원천 데이터·수집</Link></Links>
  </Layout>;
}
const Layout = styled.div`display:grid;gap:28px;min-width:0;summary{cursor:pointer;min-height:44px;padding:12px 0;font-size:14px;}`;
const Columns = styled.div`display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:32px;@media(max-width:1000px){grid-template-columns:1fr;}`;
const Section = styled.section`min-width:0;border-top:3px solid var(--color-accent-bridge);padding-top:18px;`;
const Heading = styled.div`display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:18px;h2{font-size:18px;margin:0;}label{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--color-text-muted);}select{min-height:44px;padding:8px;border:1px solid var(--color-border);border-radius:10px;background:white;color:var(--color-text);font:inherit;}`;
const Ledger = styled.dl`display:grid;grid-template-columns:repeat(2,minmax(0,1fr));margin:0;>div{padding:20px 12px 20px 0;border-bottom:1px solid var(--color-border);}dt,small{font-size:12px;line-height:1.8;color:var(--color-text-muted);}dd{margin:8px 0;font-size:26px;font-weight:600;font-variant-numeric:tabular-nums;}@media(max-width:380px){grid-template-columns:1fr;}`;
const Queue = styled.ul`list-style:none;padding:0;margin:0;li{display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--color-border);}li>span{width:44px;flex:none;font-size:12px;color:var(--color-text-muted);}a,button{display:flex;justify-content:space-between;align-items:center;gap:16px;flex:1;min-width:0;min-height:52px;padding:10px 0;border:0;background:none;color:var(--color-text);font:inherit;font-size:14px;text-decoration:none;text-align:left;cursor:pointer;}strong{font-variant-numeric:tabular-nums;white-space:nowrap;}a:hover,button:hover{color:var(--color-accent-primary);text-decoration:underline;}`;
const Attention = styled.div`padding:14px 16px;border:1px solid #d8a5a1;border-radius:12px;background:#fff8f7;color:#783e39;font-size:14px;line-height:1.7;`;
const Meta = styled.p`font-size:12px;color:var(--color-text-muted);line-height:1.8;`;
const Links = styled.div`display:flex;gap:18px;flex-wrap:wrap;button,a{display:inline-flex;align-items:center;min-height:44px;border:0;background:none;padding:8px 0;color:var(--color-accent-primary);font:inherit;font-size:14px;cursor:pointer;text-decoration:underline;text-underline-offset:4px;}`;
const State = styled.div`min-height:160px;display:grid;align-content:center;gap:12px;font-size:14px;line-height:1.8;button{justify-self:start;min-height:44px;cursor:pointer;}`;
