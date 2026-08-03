"use client";

import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  BaseButton,
  PrimaryButton,
} from "@/features/tuti/components/buttons";
import { LoadingIndicator } from "@/features/tuti/components/LoadingIndicator";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { useSession } from "@/features/tuti/hooks/useSession";
import { fetchWithSession } from "@/lib/auth/session";
import type {
  CreateInquiryResponse,
  InquiryCategory,
  UserInquiryItem,
  UserInquiriesResponse,
} from "@/shared/api/inquiry";

export function InquiryScreen({ onBack }: { onBack: () => void }) {
  const session = useSession();
  const queryClient = useQueryClient();
  const [view, setView] = useState<"write" | "history">("write");
  const [category, setCategory] = useState<InquiryCategory>("service");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inquiriesQuery = useQuery({
    queryKey: ["customer-inquiries"],
    queryFn: async () => {
      const response = await fetchWithSession("inquiries");
      const body = (await response.json()) as
        | UserInquiriesResponse
        | { error?: unknown };

      if (!response.ok || !("inquiries" in body)) {
        throw new Error(
          "error" in body && typeof body.error === "string"
            ? body.error
            : "문의 내역을 불러오지 못했어요.",
        );
      }

      return body.inquiries;
    },
    refetchInterval: view === "history" ? 30_000 : false,
  });
  const canSubmit =
    subject.trim().length >= 2 && message.trim().length >= 10;

  const submitInquiry = async () => {
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetchWithSession("inquiries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category,
          subject,
          message,
          email,
        }),
      });
      const body = (await response.json()) as
        | CreateInquiryResponse
        | { error?: unknown };

      if (!response.ok || !("inquiry" in body)) {
        throw new Error(
          "error" in body && typeof body.error === "string"
            ? body.error
            : "문의를 접수하지 못했어요.",
        );
      }

      setSubmittedId(body.inquiry.id);
      await queryClient.invalidateQueries({
        queryKey: ["customer-inquiries"],
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "문의를 접수하지 못했어요.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Frame>
      <Header>
        <BackButton type="button" aria-label="메인으로 돌아가기" onClick={onBack}>
          ‹
        </BackButton>
        <h1>1:1 문의</h1>
        <HeaderSpacer />
      </Header>

      <ViewTabs aria-label="문의 메뉴">
        <ViewTab
          type="button"
          $active={view === "write"}
          onClick={() => setView("write")}
        >
          문의하기
        </ViewTab>
        <ViewTab
          type="button"
          $active={view === "history"}
          onClick={() => setView("history")}
        >
          내 문의
          {inquiriesQuery.data?.length
            ? ` ${inquiriesQuery.data.length}`
            : ""}
        </ViewTab>
      </ViewTabs>

      {view === "history" ? (
        <InquiryHistory
          inquiries={inquiriesQuery.data ?? []}
          loading={inquiriesQuery.isLoading}
          error={
            inquiriesQuery.error instanceof Error
              ? inquiriesQuery.error.message
              : null
          }
        />
      ) : submittedId ? (
        <Complete>
          <Mark aria-hidden="true">✓</Mark>
          <h2>문의를 접수했어요.</h2>
          <p>
            남겨주신 내용을 확인한 뒤 답변이 필요하면 이메일로 안내드릴게요.
          </p>
          <InquiryNumber>문의 번호 {submittedId.slice(0, 8)}</InquiryNumber>
          <CompleteActions>
            <HistoryButton
              type="button"
              onClick={() => setView("history")}
            >
              문의 내역 보기
            </HistoryButton>
            <PrimaryButton type="button" onClick={onBack}>
              메인으로 돌아가기
            </PrimaryButton>
          </CompleteActions>
        </Complete>
      ) : (
        <>
          <Intro>
            <h2>어떤 도움이 필요하신가요?</h2>
            <p>서비스 이용 중 궁금하거나 불편했던 점을 알려주세요.</p>
          </Intro>

          <Form>
            <Field>
              <span>문의 유형</span>
              <Select
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as InquiryCategory)
                }
              >
                <option value="service">서비스 이용</option>
                <option value="account">계정 및 로그인</option>
                <option value="place">장소 정보</option>
                <option value="privacy">개인정보 및 신고</option>
                <option value="other">기타</option>
              </Select>
            </Field>

            <Field>
              <span>제목</span>
              <Input
                value={subject}
                maxLength={120}
                placeholder="문의 내용을 간단히 적어주세요."
                onChange={(event) => setSubject(event.target.value)}
              />
            </Field>

            <Field>
              <span>내용</span>
              <TextArea
                value={message}
                maxLength={4000}
                placeholder="확인에 필요한 내용을 자세히 알려주세요."
                onChange={(event) => setMessage(event.target.value)}
              />
              <Counter>{message.length} / 4,000</Counter>
            </Field>

            <Field>
              <span>답변받을 이메일 · 선택</span>
              <Input
                type="email"
                value={email}
                maxLength={254}
                placeholder={
                  session?.account?.email ??
                  "답변이 필요하다면 이메일을 입력해주세요."
                }
                onChange={(event) => setEmail(event.target.value)}
              />
              {session?.account?.email && !email && (
                <Hint>
                  비워두면 로그인 계정의 이메일로 답변을 받을 수 있어요.
                </Hint>
              )}
            </Field>

            {error && <ErrorMessage role="alert">{error}</ErrorMessage>}
          </Form>

          <SubmitButton
            type="button"
            disabled={!canSubmit || submitting}
            onClick={() => void submitInquiry()}
          >
            {submitting ? "접수 중..." : "문의 보내기"}
          </SubmitButton>
        </>
      )}
    </Frame>
  );
}

function InquiryHistory({
  inquiries,
  loading,
  error,
}: {
  inquiries: UserInquiryItem[];
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <HistoryState>
        <LoadingIndicator
          label="문의 내역을 불러오고 있어요."
          compact
        />
      </HistoryState>
    );
  }

  if (error) {
    return <HistoryError role="alert">{error}</HistoryError>;
  }

  if (inquiries.length === 0) {
    return <HistoryState>아직 남긴 문의가 없어요.</HistoryState>;
  }

  return (
    <HistoryList data-scroll-region>
      {inquiries.map((inquiry) => (
        <InquiryCard key={inquiry.id}>
          <InquiryCardTop>
            <Status $status={inquiry.status}>
              {getInquiryStatusLabel(inquiry.status)}
            </Status>
            <time>{formatInquiryDate(inquiry.createdAt)}</time>
          </InquiryCardTop>
          <small>{getInquiryCategoryLabel(inquiry.category)}</small>
          <h2>{inquiry.subject}</h2>
          <UserMessage>{inquiry.message}</UserMessage>
          {inquiry.adminResponse ? (
            <Answer>
              <strong>Tuti 답변</strong>
              <p>{inquiry.adminResponse}</p>
              {inquiry.handledAt && (
                <time>{formatInquiryDate(inquiry.handledAt)}</time>
              )}
            </Answer>
          ) : (
            <Waiting>
              내용을 확인하고 있어요. 답변이 등록되면 이곳에서 볼 수 있어요.
            </Waiting>
          )}
        </InquiryCard>
      ))}
    </HistoryList>
  );
}

function getInquiryStatusLabel(status: UserInquiryItem["status"]) {
  if (status === "pending") return "접수";
  if (status === "reviewing") return "확인 중";
  if (status === "answered") return "답변 완료";
  return "종결";
}

function getInquiryCategoryLabel(category: InquiryCategory) {
  if (category === "account") return "계정 및 로그인";
  if (category === "service") return "서비스 이용";
  if (category === "place") return "장소 정보";
  if (category === "privacy") return "개인정보 및 신고";
  return "기타";
}

function formatInquiryDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

const Frame = styled(ScreenFrame)`
  z-index: 1;
  gap: var(--space-6);
  background: var(--color-surface);
`;

const Header = styled.header`
  min-height: var(--space-11);
  display: grid;
  grid-template-columns: var(--space-11) 1fr var(--space-11);
  align-items: center;

  h1 {
    font-size: var(--font-size-500);
    font-weight: 700;
    text-align: center;
  }
`;

const BackButton = styled(BaseButton)`
  width: var(--space-11);
  height: var(--space-11);
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-muted);
  font-size: calc(var(--font-size-700) + var(--space-2));
  font-weight: 400;
  line-height: 0;
`;

const HeaderSpacer = styled.span`
  width: var(--space-11);
`;

const ViewTabs = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
  padding: var(--space-1);
  border-radius: var(--space-3);
  background: var(--color-neutral-200);
`;

const ViewTab = styled(BaseButton)<{ $active: boolean }>`
  min-height: var(--space-10);
  border-radius: var(--space-2);
  background: ${({ $active }) =>
    $active ? "var(--color-white)" : "transparent"};
  color: ${({ $active }) =>
    $active ? "var(--color-text)" : "var(--color-text-muted)"};
  font-size: var(--font-size-100);
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
  box-shadow: ${({ $active }) =>
    $active
      ? "0 4px 12px rgb(var(--color-black-rgb) / 0.06)"
      : "none"};
`;

const Intro = styled.div`
  display: grid;
  gap: var(--space-2);
  padding-top: var(--space-3);

  h2 {
    font-size: var(--font-size-600);
    line-height: var(--line-height-heading);
  }

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-200);
  }
`;

const Form = styled.div`
  min-height: 0;
  display: grid;
  gap: var(--space-4);
  overflow-y: auto;
  padding-right: var(--space-1);
`;

const Field = styled.label`
  display: grid;
  gap: var(--space-2);

  > span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    font-weight: 600;
  }
`;

const fieldStyle = css`
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--space-3);
  outline: 0;
  background: var(--color-white);
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: var(--font-size-200);

  &:focus {
    border-color: var(--color-brand-600);
    box-shadow: 0 0 0 3px var(--color-brand-200);
  }
`;

const Input = styled.input`
  ${fieldStyle}
  min-height: var(--space-11);
  padding: 0 var(--space-4);
`;

const Select = styled.select`
  ${fieldStyle}
  min-height: var(--space-11);
  padding: 0 var(--space-4);
`;

const TextArea = styled.textarea`
  ${fieldStyle}
  min-height: 144px;
  resize: vertical;
  padding: var(--space-4);
  line-height: var(--line-height-body);
`;

const Counter = styled.small`
  justify-self: end;
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;

const Hint = styled.small`
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;

const ErrorMessage = styled.p`
  color: var(--color-error);
  font-size: var(--font-size-100);
`;

const SubmitButton = styled(PrimaryButton)`
  width: 100%;
  min-height: var(--space-12);
  margin-top: auto;
`;

const Complete = styled.div`
  flex: 1;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: var(--space-4);
  text-align: center;

  h2 {
    font-size: var(--font-size-600);
  }

  p {
    max-width: 280px;
    color: var(--color-text-muted);
    line-height: var(--line-height-body);
  }

  button {
    width: 100%;
  }
`;

const Mark = styled.div`
  width: var(--space-14);
  height: var(--space-14);
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--color-secondary-500);
  font-size: var(--font-size-700);
  font-weight: 700;
`;

const InquiryNumber = styled.small`
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;

const CompleteActions = styled.div`
  width: 100%;
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-4);
`;

const HistoryButton = styled(BaseButton)`
  min-height: var(--space-11);
  border: 1px solid var(--color-border);
  border-radius: var(--space-3);
  background: var(--color-white);
  color: var(--color-text);
  font-weight: 600;
`;

const HistoryList = styled.div`
  min-height: 0;
  display: grid;
  align-content: start;
  gap: var(--space-3);
  overflow-y: auto;
  padding: var(--space-1);
`;

const HistoryState = styled.div`
  flex: 1;
  display: grid;
  place-items: center;
  color: var(--color-text-muted);
  font-size: var(--font-size-200);
`;

const HistoryError = styled(HistoryState)`
  color: var(--color-error);
`;

const InquiryCard = styled.article`
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--space-4);
  background: var(--color-white);

  > small {
    color: var(--color-brand-800);
    font-size: var(--font-size-100);
    font-weight: 600;
  }

  h2 {
    font-size: var(--font-size-300);
    line-height: var(--line-height-subtitle);
  }
`;

const InquiryCardTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);

  time {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const Status = styled.span<{ $status: UserInquiryItem["status"] }>`
  display: inline-flex;
  min-height: var(--space-7);
  align-items: center;
  padding: 0 var(--space-3);
  border-radius: 999px;
  background: ${({ $status }) =>
    $status === "answered"
      ? "var(--color-secondary-500)"
      : $status === "reviewing"
        ? "var(--color-brand-200)"
        : "var(--color-neutral-300)"};
  font-size: var(--font-size-100);
  font-weight: 700;
`;

const UserMessage = styled.p`
  color: var(--color-text-muted);
  font-size: var(--font-size-200);
  line-height: var(--line-height-body);
  white-space: pre-wrap;
`;

const Answer = styled.div`
  display: grid;
  gap: var(--space-2);
  padding: var(--space-4);
  border-radius: var(--space-3);
  background: var(--color-secondary-200);

  strong {
    font-size: var(--font-size-100);
  }

  p {
    font-size: var(--font-size-200);
    line-height: var(--line-height-body);
    white-space: pre-wrap;
  }

  time {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const Waiting = styled.p`
  padding: var(--space-3);
  border-radius: var(--space-3);
  background: var(--color-neutral-200);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  line-height: var(--line-height-body);
`;
