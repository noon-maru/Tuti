"use client";

import styled from "@emotion/styled";
import { useState, type FormEvent } from "react";
import {
  BaseButton,
  PrimaryButton,
} from "@/features/tuti/components/buttons";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import type {
  AccountJournalResolution,
  AuthProvider,
  EmailCodeVerificationResult,
  OAuthProvider,
} from "@/shared/api/session";
import {
  oauthProviderEnabled,
  oauthProviderLabels,
} from "@/shared/auth/config";

type EmailStep = "email" | "code";

export function AccountScreen({
  authEnabled,
  email,
  oauthCompletion,
  providers = [],
  onBack,
  onEmailCodeRequest,
  onEmailCodeVerify,
  onLogout,
  onOAuth,
}: {
  authEnabled: boolean;
  email?: string;
  oauthCompletion?: {
    pending: boolean;
    error?: string;
    currentJournalCount?: number;
    onJournalResolution: (
      journalResolution: AccountJournalResolution,
    ) => void | Promise<void>;
    onCancel: () => void;
  };
  providers?: AuthProvider[];
  onBack: () => void;
  onEmailCodeRequest: (email: string) => Promise<void>;
  onEmailCodeVerify: (
    email: string,
    code: string,
    journalResolution?: AccountJournalResolution,
  ) => Promise<EmailCodeVerificationResult>;
  onLogout: () => Promise<void>;
  onOAuth: (provider: OAuthProvider) => Promise<void>;
}) {
  const [emailStep, setEmailStep] = useState<EmailStep>("email");
  const [formEmail, setFormEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [journalResolutionRequest, setJournalResolutionRequest] =
    useState<{ currentJournalCount: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasEmailInput =
    emailStep === "email"
      ? formEmail.trim().length > 0
      : verificationCode.length > 0;

  const submitEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authEnabled || pending) return;

    setPending(true);
    setError(null);

    try {
      if (emailStep === "email") {
        await onEmailCodeRequest(formEmail);
        setEmailStep("code");
        setPending(false);
        return;
      }

      const result = await onEmailCodeVerify(formEmail, verificationCode);

      if (result.status === "journal-resolution-required") {
        setJournalResolutionRequest({
          currentJournalCount: result.currentJournalCount,
        });
        setPending(false);
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "계정 요청을 처리하지 못했어요.",
      );
      setPending(false);
    }
  };

  const resolveJournals = async (
    journalResolution: AccountJournalResolution,
  ) => {
    if (!authEnabled || pending) return;

    setPending(true);
    setError(null);

    try {
      const result = await onEmailCodeVerify(
        formEmail,
        verificationCode,
        journalResolution,
      );

      if (result.status === "journal-resolution-required") {
        setJournalResolutionRequest({
          currentJournalCount: result.currentJournalCount,
        });
        setPending(false);
      }
    } catch (resolutionError) {
      setError(
        resolutionError instanceof Error
          ? resolutionError.message
          : "현재 기록을 처리하지 못했어요.",
      );
      setPending(false);
    }
  };

  const startOAuth = async (provider: OAuthProvider) => {
    if (!authEnabled || pending) return;

    setPending(true);
    setError(null);

    try {
      await onOAuth(provider);
    } catch (oauthError) {
      setError(
        oauthError instanceof Error
          ? oauthError.message
          : "소셜 로그인을 시작하지 못했어요.",
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

  const displayedJournalResolution =
    oauthCompletion?.currentJournalCount !== undefined
      ? {
          currentJournalCount: oauthCompletion.currentJournalCount,
          external: true,
        }
      : journalResolutionRequest
        ? {
            currentJournalCount:
              journalResolutionRequest.currentJournalCount,
            external: false,
          }
        : null;
  const journalResolutionPending =
    displayedJournalResolution?.external === true
      ? oauthCompletion?.pending === true
      : pending;
  const journalResolutionError =
    displayedJournalResolution?.external === true
      ? oauthCompletion?.error
      : error;
  const chooseJournalResolution = (
    journalResolution: AccountJournalResolution,
  ) =>
    displayedJournalResolution?.external
      ? oauthCompletion?.onJournalResolution(journalResolution)
      : resolveJournals(journalResolution);

  return (
    <Frame>
      <Header>
        <BackButton
          type="button"
          aria-label="메인으로 돌아가기"
          onClick={onBack}
        >
          ‹
        </BackButton>
        <h1>{providers.length > 0 ? "계정" : "기록 불러오기"}</h1>
        <HeaderSpacer aria-hidden="true" />
      </Header>

      {providers.length > 0 ? (
        <AccountContent>
          <AccountMark aria-hidden="true">T</AccountMark>
          <AccountCopy>
            <strong>{email ?? "연결된 Tuti 계정"}</strong>
            <p>
              이 계정으로 기록이 연결되어 있어요.
              <br />
              다른 기기에서도 같은 기록을 불러올 수 있어요.
            </p>
          </AccountCopy>
          <ConnectedProviders aria-label="연결된 로그인 방식">
            {providers.map((provider) => (
              <span key={provider}>
                {provider === "email"
                  ? "이메일"
                  : oauthProviderLabels[provider]}
              </span>
            ))}
          </ConnectedProviders>
          {error && <ErrorMessage role="alert">{error}</ErrorMessage>}
          <LogoutButton
            type="button"
            disabled={pending}
            onClick={() => void logout()}
          >
            {pending ? "로그아웃 중..." : "로그아웃"}
          </LogoutButton>
        </AccountContent>
      ) : oauthCompletion?.pending &&
        oauthCompletion.currentJournalCount === undefined ? (
        <OAuthCompletionContent role="status">
          <OAuthCompletionMark aria-hidden="true">T</OAuthCompletionMark>
          <h2>Google 계정을 연결하고 있어요.</h2>
          <p>잠시만 기다려주세요.</p>
        </OAuthCompletionContent>
      ) : displayedJournalResolution ? (
        <JournalResolutionContent>
          <JournalResolutionCopy>
            <h2>현재 기록도 함께 가져올까요?</h2>
            <p>
              이 기기에 남긴 기록{" "}
              <strong>
                {displayedJournalResolution.currentJournalCount}개
              </strong>
              를 계정 기록과 합칠 수 있어요.
            </p>
          </JournalResolutionCopy>
          <JournalResolutionActions>
            <MergeButton
              type="button"
              disabled={journalResolutionPending}
              onClick={() => void chooseJournalResolution("merge")}
            >
              {journalResolutionPending
                ? "처리하는 중..."
                : "현재 기록도 합치기"}
            </MergeButton>
            <AccountOnlyButton
              type="button"
              disabled={journalResolutionPending}
              onClick={() => void chooseJournalResolution("discard")}
            >
              계정 기록만 불러오기
            </AccountOnlyButton>
          </JournalResolutionActions>
          <JournalResolutionWarning>
            계정 기록만 불러오면 현재 기기의 연결되지 않은 기록{" "}
            {displayedJournalResolution.currentJournalCount}개는 삭제돼요.
          </JournalResolutionWarning>
          {journalResolutionError && (
            <ErrorMessage role="alert">
              {journalResolutionError}
            </ErrorMessage>
          )}
          <ReturnToCodeButton
            type="button"
            disabled={journalResolutionPending}
            onClick={() => {
              if (displayedJournalResolution.external) {
                oauthCompletion?.onCancel();
                return;
              }

              setJournalResolutionRequest(null);
              setError(null);
            }}
          >
            {displayedJournalResolution.external
              ? "로그인 화면으로 돌아가기"
              : "인증코드 입력으로 돌아가기"}
          </ReturnToCodeButton>
        </JournalResolutionContent>
      ) : (
        <LoginContent>
          <IntroCopy>
            <h2>남겨둔 공간을 다시 만나요.</h2>
            <p>
              로그인한 뒤 현재 기기의 기록을 연결할지 선택할 수
              있어요.
            </p>
          </IntroCopy>
          {oauthCompletion?.error && (
            <OAuthErrorMessage role="alert">
              {oauthCompletion.error}
            </OAuthErrorMessage>
          )}

          <ProviderList aria-label="소셜 로그인">
            {(["apple", "google", "kakao"] as const).map((provider) => (
              <ProviderButton
                key={provider}
                type="button"
                aria-label={`${oauthProviderLabels[provider]}로 계속하기`}
                disabled={
                  !authEnabled ||
                  !oauthProviderEnabled[provider] ||
                  pending
                }
                $provider={provider}
                onClick={() => void startOAuth(provider)}
              >
                <ProviderIconSlot aria-hidden="true">
                  <ProviderIcon
                    $provider={provider}
                    src={
                      provider === "apple"
                        ? "/brand/oauth/apple-logo.png"
                        : provider === "kakao"
                          ? "/brand/oauth/kakao-symbol.png"
                          : "/brand/oauth/google-g.png"
                    }
                    alt=""
                    draggable="false"
                  />
                </ProviderIconSlot>
                <ProviderLabel>
                  {provider === "kakao"
                    ? "카카오 로그인"
                    : `${oauthProviderLabels[provider]}로 계속하기`}
                </ProviderLabel>
                <ProviderBalance aria-hidden="true" />
              </ProviderButton>
            ))}
          </ProviderList>

          <Divider>
            <span>또는</span>
          </Divider>

          <EmailForm onSubmit={submitEmail}>
            <Field>
              <span>
                {emailStep === "email" ? "이메일" : "인증코드"}
              </span>
              {emailStep === "email" ? (
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  required
                  disabled={!authEnabled}
                  value={formEmail}
                  onChange={(event) => setFormEmail(event.target.value)}
                />
              ) : (
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="6자리 코드"
                  required
                  value={verificationCode}
                  onChange={(event) =>
                    setVerificationCode(
                      event.target.value.replace(/\D/g, "").slice(0, 6),
                    )
                  }
                />
              )}
            </Field>
            {emailStep === "code" && (
              <EmailHint>
                <span>{formEmail}로 보낸 코드를 입력해주세요.</span>
                <button
                  type="button"
                  onClick={() => {
                    setEmailStep("email");
                    setVerificationCode("");
                    setError(null);
                  }}
                >
                  이메일 변경
                </button>
              </EmailHint>
            )}
            {error && <ErrorMessage role="alert">{error}</ErrorMessage>}
            <SubmitButton
              type="submit"
              $hasInput={hasEmailInput}
              disabled={!authEnabled || pending}
            >
              {pending
                ? "잠시만요..."
                : emailStep === "email"
                  ? "인증코드 받기"
                  : "인증하고 계속하기"}
            </SubmitButton>
          </EmailForm>

          {!authEnabled && (
            <DisabledNotice role="status">
              계정 로그인 기능을 준비하고 있어요.
            </DisabledNotice>
          )}
        </LoginContent>
      )}
    </Frame>
  );
}

const Frame = styled(ScreenFrame)`
  z-index: 40;
  overflow-y: auto;
  background: var(--color-surface);
  overscroll-behavior-y: contain;
`;

const Header = styled.header`
  height: var(--space-11);
  display: grid;
  grid-template-columns: var(--space-11) minmax(0, 1fr) var(--space-11);
  align-items: center;
  flex: none;

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

const OAuthCompletionContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-bottom: var(--space-20);
  text-align: center;

  h2 {
    margin-top: var(--space-6);
    font-size: var(--font-size-500);
    font-weight: 600;
  }

  p {
    margin-top: var(--space-2);
    color: var(--color-text-muted);
    font-size: var(--font-size-200);
  }
`;

const OAuthCompletionMark = styled.div`
  width: var(--space-16);
  height: var(--space-16);
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: var(--color-brand-500);
  color: var(--color-white);
  font-size: var(--font-size-600);
  font-weight: 700;
`;

const JournalResolutionContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  padding-top: clamp(var(--space-12), 12cqh, var(--space-20));
`;

const JournalResolutionCopy = styled.div`
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

  strong {
    color: var(--color-text);
    font-weight: 600;
  }
`;

const JournalResolutionActions = styled.div`
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-10);
`;

const MergeButton = styled(PrimaryButton)`
  width: 100%;
  background: var(--color-secondary-700);
  color: var(--color-neutral-1300);
`;

const AccountOnlyButton = styled(BaseButton)`
  min-height: var(--space-14);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-neutral-100);
  color: var(--color-text);
  font-size: var(--font-size-200);
  font-weight: 600;
  transition: border-color 180ms ease, transform 180ms ease;

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  &:disabled {
    color: var(--color-text-muted);
    cursor: default;
  }
`;

const JournalResolutionWarning = styled.p`
  margin-top: var(--space-4);
  color: var(--color-error);
  font-size: var(--font-size-100);
  text-align: center;
`;

const ReturnToCodeButton = styled(BaseButton)`
  align-self: center;
  margin-top: var(--space-6);
  padding: var(--space-2) var(--space-4);
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;

const LoginContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  padding-top: clamp(var(--space-8), 7cqh, var(--space-14));
`;

const OAuthErrorMessage = styled.p`
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border-radius: 12px;
  background: var(--color-neutral-200);
  color: var(--color-error);
  font-size: var(--font-size-100);
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

const ProviderList = styled.div`
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-8);
`;

const ProviderButton = styled(BaseButton)<{
  $provider: OAuthProvider;
}>`
  width: 100%;
  height: var(--space-14);
  display: grid;
  grid-template-columns: var(--space-6) minmax(0, 1fr) var(--space-6);
  align-items: center;
  padding: 0 var(--space-4);
  overflow: hidden;
  border: ${({ $provider }) =>
    $provider === "google" ? "1px solid #747775" : "0"};
  border-radius: 12px;
  background: ${({ $provider }) =>
    $provider === "apple"
      ? "#000000"
      : $provider === "kakao"
        ? "#fee500"
        : "#ffffff"};
  color: ${({ $provider }) =>
    $provider === "apple" ? "#ffffff" : "#1f1f1f"};
  transition: opacity 180ms ease, transform 180ms ease,
    box-shadow 180ms ease;

  &:hover:not(:disabled) {
    box-shadow: 0 4px 12px rgb(0 0 0 / 10%);
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

const ProviderIconSlot = styled.span`
  position: relative;
  width: var(--space-6);
  height: var(--space-6);
  pointer-events: none;
`;

const ProviderIcon = styled.img<{
  $provider: OAuthProvider;
}>`
  width: ${({ $provider }) =>
    $provider === "apple" ? "48px" : $provider === "kakao" ? "22px" : "20px"};
  height: ${({ $provider }) =>
    $provider === "apple" ? "48px" : $provider === "kakao" ? "22px" : "20px"};
  max-width: ${({ $provider }) =>
    $provider === "apple" ? "none" : "100%"};
  display: block;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  object-fit: contain;
  pointer-events: none;
  user-select: none;
`;

const ProviderLabel = styled.span`
  font-size: var(--font-size-200);
  font-weight: 600;
  line-height: 1.4;
  text-align: center;
  white-space: nowrap;
`;

const ProviderBalance = styled.span`
  width: var(--space-6);
  height: var(--space-6);
`;

const Divider = styled.div`
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: var(--space-3);
  margin: var(--space-6) 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-100);

  &::before,
  &::after {
    content: "";
    height: 1px;
    background: var(--color-neutral-400);
  }
`;

const EmailForm = styled.form`
  display: grid;
  gap: var(--space-3);
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

    &:disabled {
      background: var(--color-neutral-200);
      color: var(--color-neutral-700);
    }
  }
`;

const EmailHint = styled.div`
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);

  button {
    flex: none;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-brand-800);
    font: inherit;
    cursor: pointer;
  }
`;

const ErrorMessage = styled.p`
  color: var(--color-error);
  font-size: var(--font-size-100);
`;

const SubmitButton = styled(PrimaryButton)<{
  $hasInput: boolean;
}>`
  width: 100%;
  margin-top: var(--space-1);
  background: ${({ $hasInput }) =>
    $hasInput
      ? "var(--color-secondary-700)"
      : "var(--color-secondary-200)"};
  color: ${({ $hasInput }) =>
    $hasInput ? "var(--color-neutral-1300)" : "var(--color-neutral-900)"};

  &:hover:not(:disabled) {
    background: ${({ $hasInput }) =>
      $hasInput
        ? "var(--color-secondary-800)"
        : "var(--color-secondary-300)"};
  }

  &:disabled {
    background: ${({ $hasInput }) =>
      $hasInput
        ? "var(--color-secondary-700)"
        : "var(--color-secondary-200)"};
    color: ${({ $hasInput }) =>
      $hasInput
        ? "var(--color-neutral-1300)"
        : "var(--color-neutral-900)"};
    opacity: ${({ $hasInput }) => ($hasInput ? 0.65 : 1)};
  }
`;

const DisabledNotice = styled.p`
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border-radius: 12px;
  background: var(--color-accent-soft);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  text-align: center;
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

const ConnectedProviders = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-2);
  margin-top: var(--space-5);

  span {
    padding: var(--space-1) var(--space-3);
    border-radius: 999px;
    background: var(--color-neutral-200);
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const LogoutButton = styled(PrimaryButton)`
  width: 100%;
  margin-top: auto;
  background: var(--color-neutral-1100);
`;
