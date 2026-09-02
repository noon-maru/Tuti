"use client";

import styled from "@emotion/styled";
import { useState, type FormEvent } from "react";
import {
  BaseButton,
  PrimaryButton,
} from "@/features/tuti/components/buttons";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import type {
  AccountIdentityProfile,
  AccountJournalResolution,
  AuthProvider,
  EmailCodeVerificationResult,
  OAuthProvider,
} from "@/shared/api/session";
import {
  oauthProviderEnabled,
  oauthProviderLabels,
  socialOAuthEnabled,
} from "@/shared/auth/config";

type EmailStep = "email" | "code";

export function AccountScreen({
  authEnabled,
  accountNotice,
  displayName,
  email,
  identities = [],
  oauthCompletion,
  providers = [],
  onBack,
  onEmailCodeRequest,
  onEmailCodeVerify,
  onDeleteAccount,
  onDisplayNameUpdate,
  onLogout,
  onOAuth,
  onUnlinkIdentity,
}: {
  authEnabled: boolean;
  accountNotice?: string | null;
  displayName?: string;
  email?: string;
  identities?: AccountIdentityProfile[];
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
  onDeleteAccount: () => Promise<string>;
  onDisplayNameUpdate: (displayName: string) => Promise<string>;
  onLogout: () => Promise<void>;
  onOAuth: (provider: OAuthProvider) => Promise<void>;
  onUnlinkIdentity: (identityId: string) => Promise<void>;
}) {
  const [emailStep, setEmailStep] = useState<EmailStep>("email");
  const [formEmail, setFormEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [journalResolutionRequest, setJournalResolutionRequest] =
    useState<{ currentJournalCount: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [deletionPending, setDeletionPending] = useState(false);
  const [unlinkingIdentityId, setUnlinkingIdentityId] = useState<
    string | null
  >(null);
  const [deletionReference, setDeletionReference] = useState<string | null>(
    null,
  );
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
        return;
      }

      setEmailStep("email");
      setFormEmail("");
      setVerificationCode("");
      setPending(false);
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

  const unlinkIdentity = async (identity: AccountIdentityProfile) => {
    if (pending || unlinkingIdentityId) return;

    const providerLabel = getIdentityLabel(identity);
    if (
      !window.confirm(
        `${providerLabel} 연결을 해제할까요?\n\n현재 Tuti 계정의 기록과 데이터는 유지되지만, 분리된 로그인 수단에는 데이터가 남지 않으며 이 수단으로는 현재 계정에 다시 들어올 수 없어요.`,
      )
    ) {
      return;
    }

    setUnlinkingIdentityId(identity.id);
    setError(null);

    try {
      await onUnlinkIdentity(identity.id);
    } catch (unlinkError) {
      setError(
        unlinkError instanceof Error
          ? unlinkError.message
          : "로그인 수단 연결을 해제하지 못했어요.",
      );
    } finally {
      setUnlinkingIdentityId(null);
    }
  };

  const deleteCurrentAccount = async () => {
    if (pending || deletionPending) return;

    const targetLabel = providers.length > 0 ? "계정" : "현재 이용 데이터";
    if (
      !window.confirm(
        `${targetLabel}과 기록, 사진, 추천 이력을 모두 삭제할까요? 삭제한 데이터는 복구할 수 없어요.`,
      )
    ) {
      return;
    }

    setDeletionPending(true);
    setError(null);

    try {
      setDeletionReference(await onDeleteAccount());
    } catch (deletionError) {
      setError(
        deletionError instanceof Error
          ? deletionError.message
          : "계정과 데이터를 삭제하지 못했어요.",
      );
    } finally {
      setDeletionPending(false);
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
        <h1>계정 및 데이터</h1>
        <HeaderSpacer aria-hidden="true" />
      </Header>

      {deletionReference ? (
        <DeletionComplete role="status">
          <DeletionCompleteMark aria-hidden="true">✓</DeletionCompleteMark>
          <h2>계정과 데이터를 삭제했어요.</h2>
          <p>
            기존 로그인 정보와 기록은 복구할 수 없어요. Tuti를 다시 시작하면
            새로운 익명 이용 정보가 만들어집니다.
          </p>
          <DeletionReference>
            처리 번호 {deletionReference.slice(0, 8)}
          </DeletionReference>
          <PrimaryButton type="button" onClick={onBack}>
            처음부터 다시 시작하기
          </PrimaryButton>
        </DeletionComplete>
      ) : providers.length > 0 ? (
        <AccountContent>
          <AccountMark aria-hidden="true">T</AccountMark>
          <AccountCopy>
            <strong>{displayName ?? email ?? "연결된 Tuti 계정"}</strong>
            {displayName && email && <AccountEmail>{email}</AccountEmail>}
            <p>
              이 계정으로 기록이 연결되어 있어요.
              <br />
              다른 기기에서도 같은 기록을 불러올 수 있어요.
            </p>
          </AccountCopy>
          <AccountNameEditor
            displayName={displayName}
            onSave={onDisplayNameUpdate}
            onError={setError}
          />
          <LoginMethodSection>
            <LoginMethodHeading>
              <div>
                <strong>로그인 수단 관리</strong>
                <p>
                  다른 로그인 수단에 기존 계정이 있으면 기록과 데이터를 현재
                  계정으로 합쳐요.
                </p>
              </div>
            </LoginMethodHeading>
            {accountNotice && (
              <AccountNotice role="status">{accountNotice}</AccountNotice>
            )}
            {oauthCompletion?.error && (
              <ErrorMessage role="alert">
                {oauthCompletion.error}
              </ErrorMessage>
            )}
            <IdentityList>
              {identities.map((identity) => (
                <IdentityRow key={identity.id}>
                  <IdentitySummary>
                    <IdentityProvider>
                      {identity.provider === "email"
                        ? "이메일"
                        : oauthProviderLabels[identity.provider]}
                    </IdentityProvider>
                    {identity.email && <span>{identity.email}</span>}
                  </IdentitySummary>
                  <UnlinkButton
                    type="button"
                    disabled={
                      identities.length <= 1 ||
                      unlinkingIdentityId !== null
                    }
                    onClick={() => void unlinkIdentity(identity)}
                  >
                    {unlinkingIdentityId === identity.id
                      ? "해제 중"
                      : "연결 해제"}
                  </UnlinkButton>
                </IdentityRow>
              ))}
            </IdentityList>
            {identities.length <= 1 && (
              <LastIdentityNotice>
                마지막 로그인 수단은 해제할 수 없어요. 다른 수단을 먼저
                연결해주세요.
              </LastIdentityNotice>
            )}

            {socialOAuthEnabled && (
              <LinkProviderList>
                {(["apple", "google", "kakao"] as const)
                  .filter((provider) => !providers.includes(provider))
                  .map((provider) => (
                    <LinkProviderButton
                      key={provider}
                      type="button"
                      disabled={
                        !authEnabled ||
                        !oauthProviderEnabled[provider] ||
                        pending
                      }
                      onClick={() => void startOAuth(provider)}
                    >
                      {oauthProviderLabels[provider]} 연결
                    </LinkProviderButton>
                  ))}
              </LinkProviderList>
            )}

            <EmailLinkForm onSubmit={submitEmail}>
              <Field>
                <span>
                  {emailStep === "email"
                    ? "다른 이메일 연결"
                    : "이메일 인증코드"}
                </span>
                {emailStep === "email" ? (
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    required
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
              <LinkEmailButton
                type="submit"
                disabled={!authEnabled || pending || !hasEmailInput}
              >
                {pending
                  ? "연결 중..."
                  : emailStep === "email"
                    ? "인증코드 받기"
                    : "이메일 연결"}
              </LinkEmailButton>
            </EmailLinkForm>
          </LoginMethodSection>
          {error && <ErrorMessage role="alert">{error}</ErrorMessage>}
          <LogoutButton
            type="button"
            disabled={pending}
            onClick={() => void logout()}
          >
            {pending ? "로그아웃 중..." : "로그아웃"}
          </LogoutButton>
          <DeletionButton
            type="button"
            disabled={deletionPending}
            onClick={() => void deleteCurrentAccount()}
          >
            {deletionPending ? "삭제하고 있어요..." : "계정 및 데이터 삭제"}
          </DeletionButton>
        </AccountContent>
      ) : oauthCompletion?.pending &&
        oauthCompletion.currentJournalCount === undefined ? (
        <OAuthCompletionContent role="status">
          <OAuthCompletionMark aria-hidden="true">T</OAuthCompletionMark>
          <h2>계정을 연결하고 있어요.</h2>
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

          {socialOAuthEnabled && (
            <>
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
            </>
          )}

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
          <GuestDeletionSection>
            <div>
              <strong>현재 이용 데이터 삭제</strong>
              <p>
                계정을 연결하지 않았어도 현재 기록과 추천 이력을 바로 삭제할 수
                있어요.
              </p>
            </div>
            <DeletionButton
              type="button"
              disabled={deletionPending}
              onClick={() => void deleteCurrentAccount()}
            >
              {deletionPending ? "삭제하고 있어요..." : "내 데이터 삭제"}
            </DeletionButton>
          </GuestDeletionSection>
        </LoginContent>
      )}
    </Frame>
  );
}

function AccountNameEditor({
  displayName,
  onSave,
  onError,
}: {
  displayName?: string;
  onSave: (displayName: string) => Promise<string>;
  onError: (message: string | null) => void;
}) {
  const [value, setValue] = useState(displayName ?? "");
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || !value.trim()) return;

    setPending(true);
    setSaved(false);
    onError(null);

    try {
      const savedDisplayName = await onSave(value);
      setValue(savedDisplayName);
      setSaved(true);
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "이름을 수정하지 못했어요.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <NameForm onSubmit={submit}>
      <label htmlFor="account-display-name">이름</label>
      <NameInputRow>
        <input
          id="account-display-name"
          type="text"
          autoComplete="name"
          maxLength={100}
          value={value}
          placeholder="Tuti에서 사용할 이름"
          disabled={pending}
          onChange={(event) => {
            setValue(event.target.value);
            setSaved(false);
          }}
        />
        <NameSaveButton
          type="submit"
          disabled={
            pending ||
            !value.trim() ||
            value.trim() === (displayName ?? "")
          }
        >
          {pending ? "저장 중" : "저장"}
        </NameSaveButton>
      </NameInputRow>
      {saved && <NameSavedMessage role="status">저장했어요.</NameSavedMessage>}
    </NameForm>
  );
}

function getIdentityLabel(identity: AccountIdentityProfile) {
  const provider =
    identity.provider === "email"
      ? "이메일"
      : oauthProviderLabels[identity.provider];

  return identity.email ? `${provider} (${identity.email})` : provider;
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
  padding-top: clamp(var(--space-8), 8cqh, var(--space-14));
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

const AccountEmail = styled.span`
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;

const NameForm = styled.form`
  width: 100%;
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-6);
  text-align: left;

  label {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    font-weight: 500;
  }
`;

const NameInputRow = styled.div`
  display: flex;
  gap: var(--space-2);

  input {
    min-width: 0;
    flex: 1;
    height: var(--space-12);
    padding: 0 var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    outline: 0;
    background: var(--color-neutral-100);
    color: var(--color-text);
    font-size: var(--font-size-200);

    &:focus {
      border-color: var(--color-brand-600);
      box-shadow: 0 0 0 3px var(--color-brand-100);
    }
  }
`;

const NameSaveButton = styled(BaseButton)`
  min-width: 72px;
  height: var(--space-12);
  padding: 0 var(--space-4);
  border-radius: 12px;
  background: var(--color-secondary-700);
  color: var(--color-neutral-1300);
  font-size: var(--font-size-100);
  font-weight: 600;

  &:disabled {
    background: var(--color-neutral-300);
    color: var(--color-text-muted);
  }
`;

const NameSavedMessage = styled.span`
  color: var(--color-brand-800);
  font-size: var(--font-size-100);
`;

const LoginMethodSection = styled.section`
  width: 100%;
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-7);
  padding-top: var(--space-6);
  border-top: 1px solid var(--color-border);
  text-align: left;
`;

const LoginMethodHeading = styled.div`
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);

  strong {
    font-size: var(--font-size-300);
    font-weight: 600;
  }

  p {
    margin-top: var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    line-height: 1.55;
  }
`;

const AccountNotice = styled.p`
  padding: var(--space-3);
  border: 1px solid var(--color-secondary-500);
  border-radius: 10px;
  background: var(--color-secondary-100);
  color: var(--color-neutral-1200);
  font-size: var(--font-size-100);
`;

const IdentityList = styled.div`
  display: grid;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
`;

const IdentityRow = styled.div`
  min-height: var(--space-14);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--color-neutral-100);

  & + & {
    border-top: 1px solid var(--color-border);
  }
`;

const IdentitySummary = styled.div`
  min-width: 0;
  display: grid;
  gap: 2px;

  span {
    overflow: hidden;
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const IdentityProvider = styled.strong`
  font-size: var(--font-size-200);
  font-weight: 600;
`;

const UnlinkButton = styled(BaseButton)`
  flex: none;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: 9px;
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);

  &:disabled {
    opacity: 0.4;
  }
`;

const LastIdentityNotice = styled.p`
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  line-height: 1.5;
`;

const LinkProviderList = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
  margin-top: var(--space-2);
`;

const LinkProviderButton = styled(BaseButton)`
  min-width: 0;
  height: var(--space-11);
  padding: 0 var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-neutral-100);
  color: var(--color-text);
  font-size: var(--font-size-100);
  font-weight: 600;

  &:disabled {
    color: var(--color-text-muted);
    opacity: 0.5;
  }
`;

const EmailLinkForm = styled(EmailForm)`
  margin-top: var(--space-2);
`;

const LinkEmailButton = styled(BaseButton)`
  width: 100%;
  height: var(--space-11);
  border-radius: 10px;
  background: var(--color-secondary-700);
  color: var(--color-neutral-1300);
  font-size: var(--font-size-100);
  font-weight: 600;

  &:disabled {
    background: var(--color-neutral-300);
    color: var(--color-text-muted);
  }
`;

const LogoutButton = styled(PrimaryButton)`
  width: 100%;
  margin-top: var(--space-10);
  background: var(--color-neutral-1100);
`;

const DeletionButton = styled(BaseButton)`
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  text-decoration: underline;
  text-underline-offset: 3px;
`;

const GuestDeletionSection = styled.section`
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-10);
  padding-top: var(--space-6);
  border-top: 1px solid var(--color-border);
  text-align: center;

  div {
    display: grid;
    gap: var(--space-2);
  }

  strong {
    font-size: var(--font-size-200);
  }

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  ${DeletionButton} {
    margin-top: 0;
    color: var(--color-error);
  }
`;

const DeletionComplete = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  padding-bottom: var(--space-16);
  text-align: center;

  h2 {
    font-size: var(--font-size-500);
  }

  p {
    max-width: 360px;
    color: var(--color-text-muted);
    font-size: var(--font-size-200);
  }

  ${PrimaryButton} {
    width: 100%;
    margin-top: var(--space-5);
  }
`;

const DeletionCompleteMark = styled.div`
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
  border-radius: 24px;
  background: var(--color-brand-500);
  color: var(--color-white);
  font-size: var(--font-size-600);
  font-weight: 700;
`;

const DeletionReference = styled.span`
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;
