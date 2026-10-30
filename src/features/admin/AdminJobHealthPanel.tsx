"use client";
import styled from "@emotion/styled";
import { JOB_IDS, type JobHealthReport } from "@/shared/api/jobHealth";
const labels = { rights: "권리 대응", privacy: "개인정보 정리", ledger: "삭제 원장 백업", retention: "백업 보관기간", "core-backup": "핵심 데이터 백업" };
const states = { healthy: "정상 종료 관측", failed: "실패", overdue: "예정 시간 초과", running: "실행 중", disabled: "예약 비활성", unknown: "확인 불가" };
const format = (value: string | null) => value ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value)) : "관측 없음";
export function AdminJobHealthPanel({ report }: { report?: JobHealthReport }) {
  return <Panel aria-label="개인정보·백업 예약 작업"><h3>예약 작업 상태</h3><p>{report?.fresh ? `${format(report.capturedAt)} 관측` : "상태 수집기가 설치되지 않았거나 관측이 오래됐습니다. 정상으로 간주하지 않습니다."}</p>
    <Rows>{JOB_IDS.map(id => { const job = report?.jobs.find(item => item.id === id), state = report?.fresh ? job?.state ?? "unknown" : "unknown"; return <li key={id} data-state={state}><div><strong>{labels[id]}</strong><span>{states[state]}</span></div><small>최근 정상 종료 {format(job?.lastSuccessAt ?? null)} · 최근 시도 {format(job?.lastAttemptAt ?? null)}</small>{job?.nextAt && <small>다음 예정 {format(job.nextAt)}</small>}</li>; })}</Rows>
    <p>systemd 서비스 종료 상태의 관측입니다. 잠금으로 실행을 건너뛴 정상 종료도 포함할 수 있어 실제 파기·통지 완료·백업 무결성의 증거는 아닙니다. 실패·지연은 NAS에서 확인해주세요. 이 화면은 작업 실행·재시작·삭제를 수행하지 않습니다.</p></Panel>;
}
const Panel = styled.section`min-width:0;padding:22px;background:#fff;border:1px solid #e3eae6;border-radius:14px;h3{margin:0;font-size:18px;font-weight:600;}p{font-size:12px;color:#667777;line-height:1.9;}`;
const Rows = styled.ul`list-style:none;margin:16px 0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px;li{padding:14px;border:1px solid #e3eae6;border-radius:10px;min-width:0;}li[data-state=failed],li[data-state=overdue]{border-color:#d8a5a1;background:#fff8f7;}li>div{display:flex;justify-content:space-between;gap:14px;align-items:center;}strong{font-size:14px;font-weight:600;}span{font-size:12px;white-space:nowrap;}small{display:block;font-size:11px;line-height:1.9;color:#667777;margin-top:6px;}`;
