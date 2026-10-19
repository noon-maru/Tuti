"use client";

import styled from "@emotion/styled";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminJsonRequest, fetchAdminJson } from "@/lib/adminApi";
import { RIGHTS_STATES, type RightsCasesResponse } from "@/shared/legal/journalRights";
import { BackLink, Button as BaseButton } from "@/shared/ui/buttons";

const actionLabels: Record<string, string> = { temporary_block: "임시조치", copyright_suspend: "저작권 중단", record_counter: "재개 요청 접수", schedule_resume: "재개 예정일 지정", record_lawsuit: "소 제기 통보 접수", close_release: "차단 해제·종결", resolve_hide: "위반 확인·공개 숨김", confirm_notice: "통지 완료 근거 등록" };
export function JournalRightsScreen() {
  const [data, setData] = useState<RightsCasesResponse>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState("");
  const [action, setAction] = useState("close_release");
  const current = data?.cases.find((item) => item.id === selected);
  const refresh = useCallback(async () => {
    setBusy(true);
    try { setData(await fetchAdminJson<RightsCasesResponse>("journal-rights")); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "목록을 불러오지 못했어요."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { let active = true; void fetchAdminJson<RightsCasesResponse>("journal-rights").then((result) => { if (active) setData(result); }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "목록을 불러오지 못했어요."); }); return () => { active = false; }; }, []);
  async function submit(event: FormEvent<HTMLFormElement>, create: boolean) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const body: Record<string, unknown> = { ...values, action: create ? "create" : action, evidenceVerified: values.evidenceVerified === "on", rightsVerified: values.rightsVerified === "on", formAndDeliveryVerified: values.formAndDeliveryVerified === "on" };
    for (const name of ["receivedAt", "resumeAt", "sentAt"]) if (typeof body[name] === "string" && body[name]) body[name] = new Date(body[name] as string).toISOString();
    if (!create && current) { body.id = current.id; body.revision = current.revision; }
    setBusy(true); setError("");
    try { setData(await fetchAdminJson<RightsCasesResponse>("journal-rights", adminJsonRequest("POST", body))); form.reset(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "처리하지 못했어요. 새로고침해주세요."); }
    finally { setBusy(false); }
  }
  return <Page aria-busy={busy}>
    <BackLink href="/admin" aria-label="운영센터로 돌아가기" />
    <Header><h1>공개 기록 권리 보호</h1><BaseButton disabled={busy} $tone="neutral" onClick={() => void refresh()}>새로고침</BaseButton></Header>
    {error && <p role="alert">{error}</p>}
    {data && !data.enabled && <Panel>절차가 아직 비활성 상태예요. 마이그레이션·통지 서식·담당자·기한 점검 설정을 확인한 뒤 활성화해주세요.</Panel>}
    {data?.enabled && <>
      <Panel><h2>사건 접수</h2><Form onSubmit={(event) => void submit(event, true)}>
        <label>신고 번호<input name="reportId" required maxLength={100} /></label>
        <label>사건 번호<input name="reference" required pattern="[A-Za-z0-9_-]{3,100}" /></label>
        <label>소명 자료 근거 번호<input name="proofReference" required pattern="[A-Za-z0-9_-]{3,100}" /></label>
        <label>실제 접수일 (미입력 시 신고 접수일)<input name="receivedAt" type="datetime-local" /></label>
        <label className="check"><input name="evidenceVerified" type="checkbox" required />권리 침해 소명 자료 확인</label>
        <BaseButton disabled={busy} type="submit">접수</BaseButton>
      </Form></Panel>
      <Panel><h2>사건 목록</h2><TableWrap><table><thead><tr><th>사건</th><th>상태</th><th>확인 기한</th><th>미완료 통지</th><th>처리</th></tr></thead><tbody>
        {data.cases.map((item) => <tr key={item.id}><td>{item.reference}</td><td>{RIGHTS_STATES[item.state]}</td><td>{new Date(item.nextReviewAt).toLocaleString("ko-KR")}{item.overdue && <strong> · 확인 필요</strong>}</td><td>{item.notices.filter((notice) => notice.status === "manual_required").length}</td><td><BaseButton $size="compact" $tone="neutral" disabled={busy} onClick={() => { setSelected(item.id); setAction("close_release"); }}>선택</BaseButton></td></tr>)}
        {!data.cases.length && <tr><td colSpan={5}>접수된 사건이 없어요.</td></tr>}
      </tbody></table></TableWrap><p>최근 기한 순 최대 200건 표시 · 임시조치 만료는 공개 여부와 별도로 적용돼요.</p></Panel>
      {current && <Panel key={current.id}><h2>{current.reference}</h2><p>증빙 원문·연락처는 이 화면에 입력하지 마세요. 통지에는 사건별 사유와 권리 행사 방법을 포함하고, 저작권 절차는 법정 서식·필요 첨부 자료까지 확인해주세요.</p>
        <Form onSubmit={(event) => void submit(event, false)}>
          <label>조치<select value={action} onChange={(event) => setAction(event.target.value)}>{Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>판단·전달 근거 번호<input name="proofReference" required pattern="[A-Za-z0-9_-]{3,100}" /></label>
          {action === "temporary_block" && <label>임시조치 기간 (일)<input name="days" type="number" min={1} max={30} defaultValue={30} required /></label>}
          {["record_counter", "record_lawsuit"].includes(action) && <label>실제 접수일<input name="receivedAt" type="datetime-local" required /></label>}
          {action === "schedule_resume" && <><label>재개 예정일<input name="resumeAt" type="datetime-local" required /></label><label className="check"><input name="rightsVerified" type="checkbox" required />정당한 이용 권리 소명 확인</label></>}
          {action === "confirm_notice" && <><label>통지 작업<select name="noticeId" required><option value="">선택</option>{current.notices.filter((notice) => notice.status === "manual_required").map((notice) => <option key={notice.id} value={notice.id}>{notice.kind} · {notice.recipientRole === "author" ? "게시자" : "신청인"}{notice.requiresFormalNotice ? " · 법정 서식" : ""}</option>)}</select></label><label>실제 전달일<input name="sentAt" type="datetime-local" required /></label><label className="check"><input name="formAndDeliveryVerified" type="checkbox" required />서식·첨부 자료·실제 전달 근거 확인</label></>}
          <BaseButton disabled={busy || !current} type="submit">조치 저장</BaseButton>
        </Form>
      </Panel>}
    </>}
  </Page>;
}
const Page = styled.main`max-width: 1180px; margin: auto; padding: 28px 24px calc(112px + env(safe-area-inset-bottom)); color: var(--color-text-primary, #17212b); h1 {font-size: 24px;} h2 {font-size: 17px; margin: 0 0 20px;} p {font-size: 13px; line-height: 1.7;} @media(max-width:600px){padding-inline:16px;}`;
const Header = styled.header`display:flex; gap:16px; justify-content:space-between; align-items:center; margin:20px 0;`;
const Panel = styled.section`background:var(--color-surface, #fff); border:1px solid #e1e8f0; border-radius:12px; padding:24px; margin-bottom:20px;`;
const Form = styled.form`display:flex; flex-wrap:wrap; gap:16px; align-items:end; label {display:flex; flex-direction:column; gap:8px; font-size:13px; min-width:0; flex:1 1 220px;} input,select {font:inherit; padding:10px; border:1px solid #d4dfeb; border-radius:8px; min-width:0; background:#fff; color:inherit;} .check {flex-direction:row; align-items:center; align-self:center;} input[type=checkbox] {flex:none;} button {flex-shrink:0;}`;
const TableWrap = styled.div`overflow-x:auto; table {width:100%; border-collapse:collapse; font-size:13px;} th,td {padding:14px 12px; text-align:left; border-bottom:1px solid #e6edf5; white-space:nowrap;} th {font-weight:600; background:#f5f8fc;} strong {font-weight:600; color:#9b3c26;}`;
