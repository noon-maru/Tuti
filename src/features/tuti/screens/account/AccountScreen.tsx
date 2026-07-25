"use client";

import styled from "@emotion/styled";
import { useState, type FormEvent } from "react";
import {
  BaseButton,
  PrimaryButton,
} from "@/features/tuti/components/buttons";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import type { AccountCredentials } from "@/shared/api/session";

type AccountMode = "login" | "register";

export function AccountScreen({
  email,
  initialMode = "login",
  onBack,
  onLogin,
  onLogout,
  onRegister,
}: {
  email?: string;
  initialMode?: AccountMode;
  onBack: () => void;
  onLogin: (credentials: AccountCredentials) => Promise<void>;
  onLogout: () => Promise<void>;
  onRegister: (credentials: AccountCredentials) => Promise<void>;
}) {
  const [mode, setMode] = useState<AccountMode>(initialMode);
  const [formEmail, setFormEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);

    try {
      const credentials = { email: formEmail, password };
      await (mode === "login"
        ? onLogin(credentials)
        : onRegister(credentials));
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "계정 요청을 처리하지 못했어요.",
      );
      setPending(false);
    }
  };

  const logout = async () => {
    if (pending) return;

    setPending(true);
    setError(null);

    try {
      await onLogout();
    } catch (logoutError) {
      setError(
        logoutError instanceof Error
          ? logoutError.message
          : "로그아웃하지 못했어요.",
      );
      setPending(false);
    }
  };

  return (
    <Frame>
      <Header>
        <BackButton type="button" aria-label="메인으로 돌아가기" onClick={onBack}>
          ‹
        </BackButton>
        <h1>{email ? "계정" : mode === "login" ? "기록 불러오기" : "계정 만들기"}</h1>
        <HeaderSpacer aria-hidden="true" />
      </Header>

      {email ? (
        <AccountContent>
          <AccountMark aria-hidden="true">T</AccountMark>
          <AccountCopy>
            <strong>{email}</strong>
            <p>
              이 계정으로 기록이 연결되어 있어요.
              <br />
              다른 기기에서도 같은 기록을 불러올 수 있어요.
            </p>
          </AccountCopy>
          {error && <ErrorMessage role="alert">{error}</ErrorMessage>}
          <LogoutButton type="button" disabled={pending} onClick={() => void logout()}>
            {pending ? "로그아웃 중..." : "로그아웃"}
          </LogoutButton>
        </AccountContent>
      ) : (
        <AccountForm onSubmit={submit}>
          <IntroCopy>
            <h2>
              {mode === "login"
                ? "남겨둔 공간을 다시 만나요."
                : "지금의 기록을 계정에 담아둘게요."}
            </h2>
            <p>
              {mode === "login"
                ? "현재 기기의 기록도 로그인할 계정에 함께 합쳐져요."
                : "계정을 만들면 지금까지의 기록이 그대로 연결돼요."}
            </p>
          </IntroCopy>

          <Fields>
            <Field>
              <span>이메일</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="name@example.com"
                required
                value={formEmail}
                onChange={(event) => setFormEmail(event.target.value)}
              />
            </Field>
            <Field>
              <span>비밀번호</span>
              <input
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder="8자 이상 입력해주세요"
                minLength={8}
                maxLength={128}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
          </Fields>

          {error && <ErrorMessage role="alert">{error}</ErrorMessage>}

          <SubmitButton type="submit" disabled={pending}>
            {pending
              ? "잠시만요..."
              : mode === "login"
                ? "로그인"
                : "계정 만들기"}
          </SubmitButton>
          <ModeButton
            type="button"
            onClick={() => {
              setMode((current) =>
                current === "login" ? "register" : "login",
              );
              setError(null);
            }}
          >
            {mode === "login"
              ? "처음이신가요? 계정 만들기"
              : "이미 계정이 있나요? 로그인"}
          </ModeButton>
        </AccountForm>
      )}
    </Frame>
  );
}

const Frame = styled(ScreenFrame)`
  z-index: 40;
  background: var(--color-surface);
`;

const Header = styled.header`
  height: var(--space-11);
  display: grid;
  grid-template-columns: var(--space-11) minmax(0, 1fr) var(--space-11);
  align-items: center;

  h1 {
    font-size: var(--font-size-400);
    font-weight: 600;
    text-align: center;
  }
`;

const BackButton = styled(BaseButton)`
  width: var(--space-11);
  height: var(--space-11);
  display: grid;
  place-items: center;
  margin-left: calc(var(--space-3) * -1);
  padding: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 44px;
  font-weight: 300;
  line-height: 1;

  &:active {
    transform: scale(0.94);
  }
`;

const HeaderSpacer = styled.span`
  width: var(--space-11);
`;

const AccountForm = styled.form`
  flex: 1;
  display: flex;
  flex-direction: column;
  padding-top: clamp(var(--space-12), 11cqh, 92px);
`;

const IntroCopy = styled.div`
  display: grid;
  gap: var(--space-3);

  h2 {
    font-size: var(--font-size-600);
    font-weight: 600;
  }

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-200);
  }
`;

const Fields = styled.div`
  display: grid;
  gap: var(--space-4);
  margin-top: var(--space-10);
`;

const Field = styled.label`
  display: grid;
  gap: var(--space-2);

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    font-weight: 500;
  }

  input {
    width: 100%;
    height: var(--space-14);
    padding: 0 var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: 16px;
    outline: 0;
    background: var(--color-neutral-100);
    font-size: var(--font-size-200);
    transition: border-color 180ms ease, box-shadow 180ms ease;

    &::placeholder {
      color: var(--color-neutral-700);
    }

    &:focus {
      border-color: var(--color-brand-600);
      box-shadow: 0 0 0 3px var(--color-brand-100);
    }
  }
`;

const ErrorMessage = styled.p`
  margin-top: var(--space-4);
  color: var(--color-error);
  font-size: var(--font-size-100);
`;

const SubmitButton = styled(PrimaryButton)`
  width: 100%;
  margin-top: auto;
`;

const ModeButton = styled(BaseButton)`
  min-height: var(--space-11);
  margin-top: var(--space-2);
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;

const AccountContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: clamp(var(--space-16), 15cqh, 120px);
  text-align: center;
`;

const AccountMark = styled.div`
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
  border-radius: 24px;
  background: var(--color-brand-500);
  color: var(--color-white);
  font-size: var(--font-size-700);
  font-weight: 700;
`;

const AccountCopy = styled.div`
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-6);

  strong {
    font-size: var(--font-size-400);
    font-weight: 600;
  }

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-200);
  }
`;

const LogoutButton = styled(PrimaryButton)`
  width: 100%;
  margin-top: auto;
  background: var(--color-neutral-1100);
`;
