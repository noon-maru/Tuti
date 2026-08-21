"use client";

import styled from "@emotion/styled";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { apiUrl } from "@/lib/api/apiUrl";

type DeletionResponse = {
  request?: {
    id: string;
    createdAt: string;
  };
  error?: string;
};

export function AccountDeletionRequest() {
  const [email, setEmail] = useState("");
  const [details, setDetails] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !confirmed || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(apiUrl("account-deletion-requests"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          details,
          confirmed,
        }),
      });
      const body = (await response.json()) as DeletionResponse;

      if (!response.ok || !body.request) {
        throw new Error(body.error ?? "삭제 요청을 접수하지 못했어요.");
      }

      setRequestId(body.request.id);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "삭제 요청을 접수하지 못했어요.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Page>
      <Header>
        <Link href="/" aria-label="Tuti로 돌아가기">‹</Link>
        <div>
          <span>눈마루 · Tuti</span>
          <h1>계정 및 데이터 삭제</h1>
          <p>앱에서는 본인 확인된 현재 세션으로 즉시 삭제할 수 있어요.</p>
        </div>
      </Header>

      {requestId ? (
        <Complete role="status">
          <Mark aria-hidden="true">✓</Mark>
          <h2>삭제 요청을 접수했어요.</h2>
          <p>
            계정 소유 여부를 확인하기 위해 입력한 이메일로 연락드릴 수
            있어요. 확인이 끝나면 계정과 관련 데이터를 삭제하고 결과를
            안내합니다.
          </p>
          <RequestNumber>요청 번호 {requestId.slice(0, 8)}</RequestNumber>
          <Link href="/">Tuti로 돌아가기</Link>
        </Complete>
      ) : (
        <>
          <Intro>
            <h2>무엇이 삭제되나요?</h2>
            <p>
              Tuti 계정, 로그인 연결 정보, 지난 공간의 기록과 이미지,
              추천·선택·길찾기 행동 및 개인화 정보가 삭제됩니다.
            </p>
          </Intro>

          <RetentionNotice>
            <strong>일부 확인자료는 바로 삭제되지 않을 수 있어요.</strong>
            <p>
              위치정보 이용·제공사실 확인자료처럼 법령에 따라 보존해야
              하는 자료는 원본 좌표 없이 정해진 기간 동안 분리 보관한 뒤
              삭제합니다. 삭제 요청과 처리 결과도 법적 의무 이행을
              증명하는 데 필요한 범위에서 보관할 수 있습니다.
            </p>
          </RetentionNotice>

          <Steps>
            <h2>앱에서 바로 삭제하기</h2>
            <ol>
              <li><i>1</i><span>메인 메뉴에서 계정 및 데이터 선택</span></li>
              <li><i>2</i><span>계정 또는 내 데이터 삭제 선택</span></li>
              <li><i>3</i><span>삭제 내용을 확인하면 즉시 처리 완료</span></li>
            </ol>
            <ImmediateLink href="/login">
              앱에서 계정 및 데이터 열기
            </ImmediateLink>
          </Steps>

          <FallbackCopy>
            <h2>앱에 접근할 수 없나요?</h2>
            <p>
              기기를 분실했거나 로그인할 수 없다면 아래 양식으로 요청해주세요.
              계정 소유 확인이 필요한 경우 이메일로 안내합니다.
            </p>
          </FallbackCopy>

          <Form onSubmit={submitRequest}>
            <Field>
              <span>회신받을 이메일</span>
              <input
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                placeholder="name@example.com"
                onChange={(event) => setEmail(event.target.value)}
              />
              <small>
                가능하면 계정에 연결한 이메일을 입력해주세요. 이메일을
                제공하지 않은 소셜 계정이라면 아래에 로그인 방식을 적어주시면
                추가 확인을 안내해드려요.
              </small>
            </Field>

            <Field>
              <span>확인에 도움이 되는 내용 · 선택</span>
              <textarea
                value={details}
                maxLength={1000}
                placeholder="사용한 로그인 방식이나 확인이 필요한 내용을 적어주세요."
                onChange={(event) => setDetails(event.target.value)}
              />
              <Counter>{details.length} / 1,000</Counter>
            </Field>

            <Confirmation>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>
                계정과 관련 데이터가 삭제되면 복구할 수 없음을 확인했어요.
              </span>
            </Confirmation>

            {error && <ErrorMessage role="alert">{error}</ErrorMessage>}

            <SubmitButton type="submit" disabled={!confirmed || submitting}>
              {submitting ? "요청을 접수하고 있어요" : "삭제 지원 요청하기"}
            </SubmitButton>
          </Form>

          <Contact>
            직접 문의가 필요하면
            <a href="mailto:admin@tuti.today">admin@tuti.today</a>로 연락해주세요.
          </Contact>
        </>
      )}
    </Page>
  );
}

const Page = styled.main`
  width: min(100%, 720px);
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  margin-inline: auto;
  padding: max(var(--space-6), env(safe-area-inset-top, 0px))
    max(var(--space-5), env(safe-area-inset-right, 0px))
    max(var(--space-10), env(safe-area-inset-bottom, 0px))
    max(var(--space-5), env(safe-area-inset-left, 0px));
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
  background: var(--color-surface);

  @media (min-width: 768px) {
    height: calc(100dvh - var(--space-16));
    margin-block: var(--space-8);
    padding: var(--space-10) var(--space-12);
    border: 1px solid var(--color-border);
    border-radius: 32px;
    box-shadow: 0 24px 80px rgb(var(--color-black-rgb) / 0.1);
  }
`;

const Header = styled.header`
  display: grid;
  grid-template-columns: var(--space-10) minmax(0, 1fr);
  align-items: start;
  gap: var(--space-3);

  > a {
    width: var(--space-10);
    height: var(--space-10);
    display: grid;
    place-items: center;
    font-size: var(--font-size-600);
  }

  span,
  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  h1 {
    margin-block: var(--space-2);
    font-size: var(--font-size-600);
  }
`;

const Intro = styled.section`
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-9);

  h2 {
    font-size: var(--font-size-400);
  }

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-200);
  }
`;

const RetentionNotice = styled.section`
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-5);
  padding: var(--space-5);
  border: 1px solid var(--color-secondary-400);
  border-radius: 20px;
  background: var(--color-secondary-100);

  strong {
    font-size: var(--font-size-200);
  }

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const Steps = styled.section`
  margin-top: var(--space-8);

  h2 {
    font-size: var(--font-size-300);
  }

  ol {
    display: grid;
    gap: var(--space-3);
    margin-top: var(--space-4);
  }

  li {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  i {
    width: 28px;
    height: 28px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--color-brand-200);
    color: var(--color-brand-1000);
    font-style: normal;
    font-weight: 700;
  }
`;

const FallbackCopy = styled.section`
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-10);

  h2 {
    font-size: var(--font-size-400);
  }

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-200);
  }
`;

const ImmediateLink = styled(Link)`
  min-height: var(--space-12);
  display: grid;
  place-items: center;
  margin-top: var(--space-5);
  padding: var(--space-3) var(--space-5);
  border-radius: 999px;
  background: var(--color-brand-500);
  color: var(--color-white);
  font-size: var(--font-size-200);
  font-weight: 600;
  text-decoration: none;
`;

const Form = styled.form`
  display: grid;
  gap: var(--space-5);
  margin-top: var(--space-9);
  padding-top: var(--space-7);
  border-top: 1px solid var(--color-border);
`;

const Field = styled.label`
  display: grid;
  gap: var(--space-2);

  > span {
    font-size: var(--font-size-100);
    font-weight: 600;
  }

  input,
  textarea {
    width: 100%;
    padding: var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: 16px;
    outline: 0;
    background: var(--color-neutral-100);

    &:focus {
      border-color: var(--color-brand-700);
      box-shadow: 0 0 0 3px var(--color-brand-100);
    }
  }

  textarea {
    min-height: 120px;
    resize: vertical;
  }

  small {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const Counter = styled.small`
  justify-self: end;
`;

const Confirmation = styled.label`
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  font-size: var(--font-size-100);

  input {
    width: 20px;
    height: 20px;
    flex: none;
    accent-color: var(--color-secondary-700);
  }
`;

const SubmitButton = styled.button`
  min-height: var(--space-14);
  border: 0;
  border-radius: 999px;
  background: var(--color-secondary-600);
  color: var(--color-neutral-1300);
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    background: var(--color-neutral-300);
    color: var(--color-text-muted);
    cursor: default;
  }
`;

const ErrorMessage = styled.p`
  color: var(--color-error);
  font-size: var(--font-size-100);
  text-align: center;
`;

const Contact = styled.p`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-1);
  margin-top: var(--space-7);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);

  a {
    color: var(--color-brand-800);
    font-weight: 600;
  }
`;

const Complete = styled.section`
  min-height: 520px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  text-align: center;

  h2 {
    font-size: var(--font-size-500);
  }

  p {
    max-width: 480px;
    color: var(--color-text-muted);
    font-size: var(--font-size-200);
  }

  > a {
    margin-top: var(--space-4);
    padding: var(--space-3) var(--space-6);
    border-radius: 999px;
    background: var(--color-secondary-500);
    font-weight: 600;
  }
`;

const Mark = styled.div`
  width: var(--space-14);
  height: var(--space-14);
  display: grid;
  place-items: center;
  border-radius: 20px;
  background: var(--color-secondary-300);
  font-size: var(--font-size-500);
  font-weight: 700;
`;

const RequestNumber = styled.small`
  color: var(--color-text-muted);
`;
