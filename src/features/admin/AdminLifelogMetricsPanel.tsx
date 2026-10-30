"use client";
import { useState } from "react";
import styled from "@emotion/styled";
import type { LifelogMetricsResponse } from "@/shared/api/lifelogMetrics";

const sections = [["summary", "사업 요약"], ["activation", "첫 경험·재방문"], ["records", "마디·하루마디"], ["together", "함께 채우기"], ["keepsake", "소장·구매 관심"]] as const;
type Section = typeof sections[number][0];
const number = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
const rate = (n: number, total: number) => total > 0 ? `${number(n / total * 100)}%` : "집계 불가";
const date = (value: string) => new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));

export function AdminLifelogMetricsPanel({ data, days, onDaysChange }: { data: LifelogMetricsResponse | null; days: number; onDaysChange: (days: number) => void }) {
  const [section, setSection] = useState<Section>("summary");
  if (!data) return <Notice role="status">라이프로그 지표를 불러오고 있어요.</Notice>;
  const s = data.stock, a = data.activity;
  const observed = Boolean(a?.retainedSince);
  const value = (n: number | undefined) => observed ? number(n) : "미계측";
  const partial = a?.retainedSince && new Date(a.retainedSince) > new Date(data.period.start);
  const metric = (label: string, amount: string, detail: string) => <Metric><dt>{label}</dt><dd>{amount}</dd><small>{detail}</small></Metric>;
  return <Layout>
    <Header><div><small>라이프로그 사업 지표</small><h2>남긴 하루가 다시 쌓이고 있나요?</h2><p>{date(data.asOf)} 기준 · 관리자·분석 제외 계정 제외</p></div>
      <label>활동 관측 기간<select value={days} onChange={event => onDaysChange(Number(event.target.value))}>{[7, 30, 90].map(day => <option key={day} value={day}>최근 {day}일</option>)}</select></label></Header>
    <Notice>현재 보유량과 기간 내 성공 사건은 다릅니다. {observed ? `보존된 관측 자료 시작: ${date(a!.retainedSince!)}.` : "새 라이프로그 계측 자료가 아직 없습니다."}
      {partial && " 선택 기간 일부만 관측됐습니다."} 구버전 앱·계측 전 활동은 소급하지 않으며, 계정 탈퇴·파기로 과거 수치가 달라질 수 있습니다.</Notice>
    <Navigation aria-label="라이프로그 지표 영역">{sections.map(([id, label]) => <button key={id} type="button" aria-pressed={section === id} onClick={() => setSection(id)}>{label}</button>)}</Navigation>
    <section aria-label={sections.find(([id]) => id === section)?.[1]}>
      {section === "summary" && <>
        <Ledger aria-label="핵심 제품 지표">
          {metric("첫 마디 저장 전환", observed && a?.activation.rate != null ? `${number(a.activation.rate)}%` : "집계 중", `7일 관측 완료 ${number(a?.activation.eligible)}계정 · 대기 ${number(a?.activation.pending)}계정`)}
          {metric("첫 저장까지", observed && a?.activation.medianMinutes != null ? `${number(a.activation.medianMinutes)}분` : "집계 중", "7일 내 전환한 신규 관측 계정 · 중앙값")}
          {metric(`마디 작성 사용자 · ${days}일`, value(a?.writerUsers), "새 원본 마디를 저장한 고유 계정")}
          {metric("반복 기록 사용자 · 30일", value(a?.repeatWriters30d), "서로 다른 2일 이상 저장 · 한국 시간")}
          {metric("실제 공동작성 하루마디", `${number(s.collaborativeBooks)}권`, "현재 서로 다른 작성자 2명 이상의 원본이 담긴 책")}
        </Ledger>
        <Panel><h3>마디에서 소장까지</h3><StockRail><div><span>남긴 마디</span><strong>{number(s.madis)}<small>개</small></strong></div><div><span>채워진 하루마디</span><strong>{number(s.filledBooks)}<small>권</small></strong></div><div><span>보관된 PDF</span><strong>{number(s.pdfs)}<small>개</small></strong></div></StockRail><p>현재 상태를 서로 다른 단위로 보여줍니다. 이 세 숫자는 단계별 전환율이 아닙니다.</p></Panel>
        <Panel><h3>최근 작성 흐름</h3>{a?.daily.length ? <TableWrap><table><thead><tr><th>한국 날짜</th><th>작성 계정</th><th>새 원본 마디</th></tr></thead><tbody>{a.daily.slice(-14).map(day => <tr key={day.day}><th>{day.day}</th><td>{number(day.writers)}</td><td>{number(day.madis)}</td></tr>)}</tbody></table></TableWrap> : <p>관측된 작성 사건이 없습니다. 과거 보유량을 신규 작성량으로 대신 표시하지 않습니다.</p>}<p>선택 기간 중 최근 최대 14개 활동일입니다. 빈 날짜를 이탈로 해석하지 않습니다.</p></Panel>
      </>}
      {section === "activation" && <>
        <Panel><h3>진입 경로별 7일 도달</h3><p>동일 계정의 관측 순서와 7일 창을 확인합니다. 기록은 같은 작성 흐름, 초대는 같은 책의 수락 이후 기여를 연결합니다. 경로는 상호 배타적이지 않으며 아직 7일이 지나지 않은 진입도 포함한 진행 현황입니다.</p>
          <TableWrap><table><thead><tr><th>진입면</th><th>관측 계정</th><th>작성 시작 / 수락</th><th>저장 / 첫 기여</th></tr></thead><tbody>{["home", "explore", "invite"].map(source => { const path = a?.paths.find(row => row.source === source); return <tr key={source}><th>{{ home: "바로 기록", explore: "작은 여행", invite: "초대" }[source]}</th><td>{value(path?.entrants ?? 0)}</td><td>{value(path?.starters ?? 0)}</td><td>{value(path?.successes ?? 0)}</td></tr>; })}</tbody></table></TableWrap>
          <p>작은 여행 경유는 실제 방문 인증이 아니며, 동의 이전 화면의 전체 이탈은 아직 측정하지 않습니다.</p></Panel>
        <Panel><h3>첫 마디 이후 재기록</h3><p>계측 시작 이후 생성된 잔존 계정의 첫 저장 주차입니다. W1은 첫 저장 후 7~13일, W4는 28~34일에 새 마디를 남긴 비율입니다. 전체 코호트의 관측 기간이 끝나기 전에는 집계 중입니다.</p>
          {a?.cohorts.length ? <TableWrap><table><thead><tr><th>첫 저장 주차</th><th>계정</th><th>W1 재기록</th><th>W4 재기록</th></tr></thead><tbody>{a.cohorts.map(cohort => <tr key={cohort.week}><th>{cohort.week}</th><td>{number(cohort.users)}</td><td>{cohort.w1 == null ? "집계 중" : `${number(cohort.w1)}%`}</td><td>{cohort.w4 == null ? "집계 중" : `${number(cohort.w4)}%`}</td></tr>)}</tbody></table></TableWrap> : <p>새 첫 저장 코호트가 아직 없습니다.</p>}</Panel>
      </>}
      {section === "records" && <Panel><h3>현재 남아 있는 마디와 하루마디</h3><Ledger>
        {metric("마디 보유 계정", number(s.writers), "현재 원본을 보유한 고유 계정")}{metric("사진 포함 마디", number(s.withPhoto), "원본 기준")}{metric("사진 없는 마디", number(s.textOnly), "글 중심 원본")}{metric("책에 담기지 않은 마디", number(s.unfiled), "어느 책에도 연결되지 않은 원본")}
        {metric("빈 하루마디", number(s.emptyBooks), "분석 대상 마디가 없는 책")}{metric("채워진 하루마디", number(s.filledBooks), "마디 1개 이상")}{metric("권당 마디 중앙값 / P90", `${number(s.medianEntries)} / ${number(s.p90Entries)}`, "빈 책 포함 · 고정 개수 제한 없음")}{metric(`마디가 추가된 책 · ${days}일`, value(a?.updatedBooks), "연결 추가 사건이 있는 현재 책")}
      </Ledger><p>첫 마디와 함께 자동 생성된 책을 독립적인 사용자 선택 성과로 계산하지 않습니다. 기존 사진의 방문 날짜를 작성 날짜로 사용하지 않습니다.</p></Panel>}
      {section === "together" && <Panel><h3>초대가 함께 쓴 하루로 이어지나요?</h3><Ledger>
        {metric("참여자를 받은 책", number(s.sharedBooks), "현재 활성 참여자가 있는 책")}{metric("실제 다중 작성자 책", number(s.collaborativeBooks), "서로 다른 작성자 2명 이상")}{metric(`활성 공동작성 책 · ${days}일`, value(a?.activeCollaborativeBooks), "현재 다중 작성자 책 중 기간 내 마디 추가")}
        {metric("초대 발급", value(a?.invites), "링크 발급이며 실제 발송·열람을 뜻하지 않음")}{metric("해당 초대의 수락", value(a?.acceptedInvites), "선택 기간에 발급된 초대와 연결")}{metric("7일 수락률", observed ? rate(a?.matureAccepted ?? 0, a?.matureInvites ?? 0) : "미계측", `7일 지난 발급 ${number(a?.matureInvites)}건 기준`)}
        {metric("첫 기여 계정", value(a?.firstContributors), "참여 세대별 첫 기여 사건의 고유 계정")}{metric("현재 참여 계정", number(s.participants), "초대받은 활성 참여자 · 책 간 중복 제거")}{metric("남아 있는 댓글·답글", number(s.comments), "삭제된 본문 제외")}
      </Ledger><p>초대 발급만으로 공동작성 성공으로 보지 않습니다. 한 책이 여러 책장에 보이더라도 책은 한 권입니다.</p></Panel>}
      {section === "keepsake" && <Panel><h3>소장과 실물 관심</h3><Ledger>
        {metric("현재 PDF 보유 계정", number(s.pdfOwners), "서버 보관본 기준")}{metric(`PDF 서버 저장 · ${days}일`, value(a?.pdfs), "기기 저장과 별개")}{metric("PDF 내보내기 관측 계정", value(a?.exporters), "다운로드 호출·공유 시트 결과 · 실제 파일 보유 보장 아님")}
        {metric("구매 버튼 노출 계정", value(a?.purchaseViewers), "완성본 버튼의 실제 노출")}{metric("노출 후 버튼 선택 계정", value(a?.purchaseClickers), "준비 중 안내를 연 관심 신호")}{metric("관심 버튼 선택률", observed ? rate(a?.purchaseClickers ?? 0, a?.purchaseViewers ?? 0) : "미계측", "같은 기간 노출 이후 선택한 계정 / 노출 계정")}
      </Ledger><Notice>현재 주문·결제·제작·배송 기능은 없습니다. 무료 PDF 생성과 준비 중 버튼 클릭을 구매·매출로 해석하지 않습니다.</Notice></Panel>}
    </section>
  </Layout>;
}
const Layout = styled.div`display:grid;gap:22px;color:var(--color-text,#1b2d32);min-width:0;`;
const Header = styled.header`display:flex;justify-content:space-between;align-items:end;gap:20px;flex-wrap:wrap;h2{font-size:25px;font-weight:600;letter-spacing:-.04em;margin:8px 0;line-height:1.5;}small{font-size:13px;color:#456749;}p{font-size:12px;color:#667777;margin:0;line-height:1.8;}label{display:grid;gap:8px;font-size:12px;color:#667777;}select{min-height:44px;padding:8px 12px;border:1px solid #d7e1dc;border-radius:10px;background:#fff;color:#1b2d32;font:inherit;}`;
const Notice = styled.div`padding:14px 18px;border:1px solid #e3eae6;background:#f6f9f5;border-radius:12px;color:#586b63;font-size:13px;line-height:1.9;`;
const Navigation = styled.nav`display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid #e3eae6;padding-bottom:12px;button{font:inherit;font-size:14px;min-height:44px;padding:9px 15px;border:1px solid transparent;border-radius:10px;background:transparent;color:#667777;cursor:pointer;}button[aria-pressed=true]{background:#eaf2df;border-color:#d6e5c1;color:#314e31;font-weight:600;}button:focus-visible{outline:2px solid #456749;outline-offset:2px;}`;
const Ledger = styled.dl`display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:0;margin:0;border-top:1px solid #e3eae6;border-bottom:1px solid #e3eae6;background:#fff;`;
const Metric = styled.div`padding:22px 18px;min-width:0;dt{font-size:13px;line-height:1.7;color:#586b63;}dd{font-size:30px;line-height:1.6;font-weight:600;font-variant-numeric:tabular-nums;margin:5px 0;letter-spacing:-.035em;overflow-wrap:anywhere;}small{display:block;font-size:12px;line-height:1.8;color:#667777;}@media(max-width:540px){padding:16px 12px;dd{font-size:25px;}}`;
const Panel = styled.section`padding:24px;background:#fff;border:1px solid #e3eae6;border-radius:14px;margin-top:20px;min-width:0;h3{font-size:18px;line-height:1.6;margin:0 0 14px;font-weight:600;letter-spacing:-.025em;}p{font-size:13px;line-height:1.9;color:#667777;margin:12px 0;}@media(max-width:540px){padding:18px 14px;}`;
const StockRail = styled.div`display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:18px 0;border-bottom:3px solid #d8edb7;div{display:grid;gap:10px;min-width:0;}span{font-size:13px;color:#667777;}strong{font-size:28px;font-weight:600;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;}small{font-size:13px;font-weight:400;margin-left:4px;}@media(max-width:420px){strong{font-size:22px;}span{font-size:12px;}}`;
const TableWrap = styled.div`overflow-x:auto;table{width:100%;border-collapse:collapse;font-size:13px;}th,td{text-align:left;padding:13px 10px;border-bottom:1px solid #e3eae6;white-space:nowrap;font-variant-numeric:tabular-nums;}thead th{color:#667777;font-size:12px;font-weight:500;}tbody th{font-weight:500;}`;
