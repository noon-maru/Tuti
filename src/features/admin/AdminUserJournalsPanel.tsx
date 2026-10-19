"use client";

import styled from "@emotion/styled";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { adminJsonRequest, fetchAdminJson } from "@/lib/adminApi";
import { BackButton, Button } from "@/shared/ui/buttons";
import type { AdminUserItem, AdminUserJournalsResponse } from "@/shared/api/admin";
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

export function AdminUserJournalsPanel({ user, onBack, backLabel }: {
  user: AdminUserItem;
  onBack: () => void;
  backLabel: string;
}) {
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<AdminUserJournalsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [purpose, setPurpose] = useState<AdminJournalAccessPurpose>("support");
  const [reference, setReference] = useState("");
  const [authorization, setAuthorization] = useState<ReturnType<typeof parseAdminJournalAccess>>(null);
  const access = parseAdminJournalAccess({ purpose, reference });

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ block: "start" });
  }, []);

  useEffect(() => {
    if (!authorization) return;
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
      {!authorization ? (
        <AccessForm onSubmit={(event) => {
          event.preventDefault();
          if (access) setAuthorization(access);
        }}>
          <p>업무에 필요한 기록만 확인해주세요. 조회 목적과 처리 번호가 감사 기록에 남습니다.</p>
          <label htmlFor="journal-access-purpose">조회 목적</label>
          <select id="journal-access-purpose" value={purpose} onChange={(event) => setPurpose(event.target.value as AdminJournalAccessPurpose)}>
            {Object.entries(ADMIN_JOURNAL_ACCESS_PURPOSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label htmlFor="journal-access-reference">문의·사고·법적 요청 처리 번호</label>
          <input id="journal-access-reference" value={reference} onChange={(event) => setReference(event.target.value)} required minLength={3} maxLength={80} pattern="[a-zA-Z0-9_-]{3,80}" aria-describedby="journal-access-help" />
          <Meta id="journal-access-help">등록된 처리 번호를 입력해주세요. 이름·이메일이나 기록 내용은 입력하지 마세요.</Meta>
          <Button type="submit" $size="compact" disabled={!access}>목적 확인 후 기록 조회</Button>
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
                  <div><dt>혼잡도 / 난이도</dt><dd>{entry.crowd} / {entry.difficulty}</dd></div>
                  <div><dt>테마</dt><dd>{entry.theme}</dd></div>
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
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--space-3);
  background: var(--color-neutral-200);

  @media (max-width: 768px) {
    padding: var(--space-3);
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
