"use client";

import styled from "@emotion/styled";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { adminJsonRequest, fetchAdminJson } from "@/lib/adminApi";
import { BackButton, Button } from "@/shared/ui/buttons";
import type { AdminProcessingCase, AdminUserItem, AdminUserJournalsResponse } from "@/shared/api/admin";
import { ADMIN_JOURNAL_ACCESS_PURPOSES, parseAdminJournalAccess, type AdminJournalAccessPurpose } from "@/shared/legal/adminJournalAccess";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  dateStyle: "medium",
  timeStyle: "medium",
});
const visitFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  dateStyle: "medium",
});
const statusLabels = {
  private: "비공개",
  pending: "공개 대기",
  published: "공개 중",
  hidden: "숨김",
};

type PanelProps = {
  user: AdminUserItem;
  onBack: () => void;
  backLabel: string;
};

export function AdminUserJournalsPanel(props: PanelProps) {
  return <UserJournalsPanel key={props.user.id} {...props} />;
}

function UserJournalsPanel({ user, onBack, backLabel }: PanelProps) {
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<AdminUserJournalsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [purpose, setPurpose] = useState<AdminJournalAccessPurpose>("support");
  const [reference, setReference] = useState("");
  const [cases, setCases] = useState<AdminProcessingCase[]>([]);
  const [caseLoading, setCaseLoading] = useState(true);
  const [caseError, setCaseError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const scopeRef = useRef(user.id);
  const [authorization, setAuthorization] = useState<{ purpose: AdminJournalAccessPurpose; reference: string; userId: string } | null>(null);
  const selectedCase = cases.find((item) => item.reference === reference);
  const access = parseAdminJournalAccess(selectedCase);

  useEffect(() => {
    let active = true;
    scopeRef.current = user.id;
    void fetchAdminJson<{ cases: AdminProcessingCase[] }>(`processing-cases?${new URLSearchParams({ userId: user.id })}`, { cache: "no-store" })
      .then((response) => {
        if (!active) return;
        setCases(response.cases);
        setReference(response.cases[0]?.reference ?? "");
      }).catch(() => { if (active) setCaseError("처리 요청을 불러오지 못했어요. 화면을 다시 열어주세요."); })
      .finally(() => { if (active) setCaseLoading(false); });
    return () => { active = false; scopeRef.current = ""; };
  }, [user.id]);

  const createCase = async () => {
    if (creatingRef.current || caseLoading || caseError) return;
    const subjectId = user.id;
    creatingRef.current = true;
    setCreating(true);
    try {
      const response = await fetchAdminJson<{ processingCase: AdminProcessingCase }>(
        `processing-cases?${new URLSearchParams({ userId: subjectId })}`, adminJsonRequest("POST", { purpose }),
      );
      if (scopeRef.current !== subjectId) return;
      setCases((current) => [response.processingCase, ...current].slice(0, 100));
      setReference(response.processingCase.reference);
      setCaseError(null);
    } catch {
      if (scopeRef.current === subjectId) setCaseError("처리 요청을 만들지 못했어요. 화면을 다시 열어 등록 여부를 확인해주세요.");
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ block: "start" });
  }, []);

  useEffect(() => {
    if (!authorization || authorization.userId !== user.id) return;
    let active = true;
    void fetchAdminJson<AdminUserJournalsResponse>(
      `user-journals?${new URLSearchParams({ userId: user.id, page: String(page) })}`,
      { ...adminJsonRequest("POST", authorization), cache: "no-store" },
    ).then((response) => {
      if (active) setData(response);
    }).catch((fetchError) => {
      if (active) setError(fetchError instanceof Error ? fetchError.message : "기록을 불러오지 못했습니다.");
    });
    return () => { active = false; };
  }, [attempt, authorization, page, user.id]);

  const changePage = (nextPage: number) => {
    setData(null);
    setError(null);
    setPage(nextPage);
  };

  return (
    <Panel aria-labelledby="admin-user-journals-heading">
      <Header>
        <BackButton aria-label={backLabel} onClick={onBack} />
        <div>
          <h2 id="admin-user-journals-heading" tabIndex={-1} ref={headingRef}>
            {user.displayName || user.email || "익명 사용자"}의 기록
          </h2>
          <UserId>{user.id}</UserId>
        </div>
      </Header>
      {!authorization || authorization.userId !== user.id ? (
        <AccessForm onSubmit={(event) => {
          event.preventDefault();
          if (access && !creating && !caseLoading) setAuthorization({ ...access, userId: user.id });
        }}>
          <p>업무에 필요한 기록만 확인해주세요. 조회 목적과 처리 번호가 감사 기록에 남습니다.</p>
          <label htmlFor="journal-access-reference">등록된 처리 요청</label>
          <select id="journal-access-reference" value={reference} onChange={(event) => setReference(event.target.value)} disabled={caseLoading || creating} aria-describedby="journal-access-help">
            <option value="">{caseLoading ? "처리 요청을 불러오는 중…" : "처리 요청을 선택해주세요"}</option>
            {cases.map((item) => <option key={item.reference} value={item.reference}>{item.reference} · {ADMIN_JOURNAL_ACCESS_PURPOSES[item.purpose]} · {dateFormatter.format(new Date(item.createdAt))}</option>)}
          </select>
          <Meta id="journal-access-help">같은 문의·사고의 후속 조회라면 기존 요청을 선택해주세요. 최근 2년 내 요청을 최대 100개 표시합니다.</Meta>
          <label htmlFor="journal-access-purpose">새 처리 요청의 목적</label>
          <select id="journal-access-purpose" value={purpose} onChange={(event) => setPurpose(event.target.value as AdminJournalAccessPurpose)}>
            {Object.entries(ADMIN_JOURNAL_ACCESS_PURPOSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <Button type="button" $size="compact" disabled={creating || caseLoading || !!caseError} onClick={() => void createCase()}>{creating ? "처리 번호 발급 중…" : "새 요청 등록·번호 자동 발급"}</Button>
          {caseError && <p role="alert">{caseError}</p>}
          <Button type="submit" $size="compact" disabled={!access || creating || caseLoading}>선택한 요청으로 기록 조회</Button>
        </AccessForm>
      ) : error ? (
        <State role="alert">
          <p>{error}</p>
          <Button $size="compact" onClick={() => {
            setError(null);
            setAttempt((current) => current + 1);
          }}>다시 시도</Button>
        </State>
      ) : !data ? (
        <State role="status">기록을 불러오고 있어요.</State>
      ) : (
        <>
          <Meta>처리 번호 {authorization.reference} · {ADMIN_JOURNAL_ACCESS_PURPOSES[authorization.purpose]}</Meta>
          <Button $size="compact" onClick={() => { setAuthorization(null); setData(null); setError(null); }}>다른 처리 요청 선택</Button>
          <Meta>전체 {data.total.toLocaleString("ko-KR")}개 · 최신 작성순 · 한국 시간 기준</Meta>
          {data.entries.length === 0 ? (
            <State>남긴 기록이 없습니다.</State>
          ) : data.entries.map((entry, index) => (
            <Entry key={entry.id} open={index === 0}>
              <summary>
                <EntrySummary>
                  <strong>{entry.title || "제목 없는 기록"}</strong>
                  <Meta>{entry.placeName} · 작성 {dateFormatter.format(new Date(entry.createdAt))}</Meta>
                </EntrySummary>
                <Status>{statusLabels[entry.publicationStatus]}</Status>
              </summary>
              <EntryBody>
                {entry.image && (
                  <Photo
                    src={entry.image}
                    alt={`${entry.placeName} 기록 사진`}
                    width={960}
                    height={720}
                    unoptimized
                    referrerPolicy="no-referrer"
                  />
                )}
                <Content>{entry.content || "작성된 본문이 없습니다."}</Content>
                <Facts>
                  <div><dt>방문일</dt><dd>{visitFormatter.format(new Date(entry.visitedAt))}</dd></div>
                  <div><dt>작성 시각</dt><dd>{dateFormatter.format(new Date(entry.createdAt))}</dd></div>
                  <div><dt>최종 수정</dt><dd>{dateFormatter.format(new Date(entry.updatedAt))}</dd></div>
                  <div><dt>기록 ID</dt><dd>{entry.id}</dd></div>
                </Facts>
              </EntryBody>
            </Entry>
          ))}
          {data.totalPages > 1 && (
            <Pagination aria-label="사용자 기록 페이지">
              <Button $size="compact" disabled={data.page <= 1} onClick={() => changePage(data.page - 1)}>이전</Button>
              <span>{data.page} / {data.totalPages}</span>
              <Button $size="compact" disabled={data.page >= data.totalPages} onClick={() => changePage(data.page + 1)}>다음</Button>
            </Pagination>
          )}
        </>
      )}
    </Panel>
  );
}

const Panel = styled.section`
  display: grid;
  gap: var(--space-4);
  min-width: 0;
  margin-bottom: var(--space-5);
  padding: 24px;
  border: 1px solid var(--color-border);
  border-radius: var(--admin-card-radius);
  background: var(--admin-card-background);

  @media (max-width: 768px) {
    padding: 18px 14px;
  }
`;

const Header = styled.header`
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  align-items: start;
  gap: var(--space-3);

  > div { min-width: 0; }
  h2 {
    scroll-margin-top: var(--space-5);
    overflow-wrap: anywhere;
    font-size: var(--font-size-400);
  }
  > button { flex: none; }
`;

const Meta = styled.p`
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  line-height: 1.6;
  overflow-wrap: anywhere;
`;

const UserId = styled(Meta)`
  margin-top: var(--space-1);
`;

const State = styled.div`
  display: grid;
  justify-items: start;
  gap: var(--space-3);
  padding-block: var(--space-4);
`;

const AccessForm = styled.form`
  display: grid;
  justify-items: stretch;
  gap: var(--space-3);
  max-width: 520px;
  min-width: 0;
  font-size: var(--font-size-200);
  line-height: 1.6;
  label { font-weight: 600; }
  input, select {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--space-2);
    background: var(--color-neutral-100);
    color: var(--color-text);
    font: inherit;
  }
  input:focus-visible, select:focus-visible {
    outline: 2px solid var(--color-brand-600);
    outline-offset: 2px;
  }
  button { justify-self: start; }
`;

const Entry = styled.details`
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--space-3);
  overflow: hidden;

  > summary {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-4);
    cursor: pointer;
    list-style: none;
  }
  > summary::-webkit-details-marker { display: none; }
  > summary::after { content: "+"; color: var(--color-text-muted); }
  &[open] > summary::after { content: "−"; }
  > summary:focus-visible { outline: 2px solid var(--color-brand-600); outline-offset: -2px; }

  @media (max-width: 560px) {
    > summary { flex-wrap: wrap; }
  }
`;

const EntrySummary = styled.div`
  min-width: 0;
  flex: 1;
  overflow-wrap: anywhere;
  strong { font-size: var(--font-size-200); font-weight: 600; }
`;

const Status = styled.span`
  flex: none;
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;

const EntryBody = styled.div`
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4);
  border-top: 1px solid var(--color-border);
`;

const Photo = styled(Image)`
  width: 100%;
  max-width: 640px;
  height: auto;
  max-height: 480px;
  object-fit: contain;
  object-position: left center;
  border-radius: var(--space-2);
`;

const Content = styled.p`
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: var(--font-size-200);
  line-height: 1.8;
`;

const Facts = styled.dl`
  display: grid;
  gap: var(--space-2);
  font-size: var(--font-size-100);

  > div { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: var(--space-2); }
  dt { color: var(--color-text-muted); }
  dd { margin: 0; overflow-wrap: anywhere; }
`;

const Pagination = styled.nav`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: var(--space-4);
  font-size: var(--font-size-100);
`;
