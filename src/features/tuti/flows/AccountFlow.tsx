"use client";

import { Browser } from "@capacitor/browser";
import { useQueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AccountScreen } from "@/features/tuti/screens/account/AccountScreen";
import { useSession } from "@/features/tuti/hooks/useSession";
import {
  completeOAuthLogin,
  createOAuthLoginUrl,
  deleteAccount,
  fetchJournalAuthorBlocks,
  logoutAccount,
  refreshAccountProfile,
  requestEmailLoginCode,
  unlinkAccountIdentity,
  updateAccountDisplayName,
  unblockJournalAuthor,
  verifyEmailLoginCode,
} from "@/lib/auth/session";
import type { AccountJournalResolution } from "@/shared/api/session";
import type { JournalAuthorBlockItem } from "@/shared/api/journal";
import { accountAuthEnabled } from "@/shared/auth/config";
import { useTutiStore } from "@/store/tuti";

export function AccountFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const session = useSession();
  const entryRecord = useTutiStore((state) => state.entryRecord);
  const finishIntake = useTutiStore((state) => state.finishIntake);
  const finishEntry = useTutiStore((state) => state.finishEntry);
  const skipInitialHelp = useTutiStore((state) => state.skipInitialHelp);
  const resetAllData = useTutiStore((state) => state.resetAllData);
  const oauthTicket = searchParams.get("oauthTicket");
  const oauthCallbackError = searchParams.get("oauthError");
  const handledOAuthTicket = useRef<string | null>(null);
  const accountProfileRefreshed = useRef(false);
  const [accountNotice, setAccountNotice] = useState<string | null>(null);
  const [journalAuthorBlocks, setJournalAuthorBlocks] = useState<
    JournalAuthorBlockItem[]
  >([]);
  const [oauthCompletion, setOAuthCompletion] = useState<{
    pending: boolean;
    error?: string;
    currentJournalCount?: number;
  }>({
    pending: Boolean(oauthTicket),
    ...(oauthCallbackError ? { error: oauthCallbackError } : {}),
  });

  const finishAccountChange = useCallback(async (linked = false) => {
    await queryClient.invalidateQueries({ queryKey: ["journal-entries"] });

    if (linked) {
      setAccountNotice("로그인 수단과 기존 데이터를 현재 계정에 연결했어요.");
      router.replace("/login");
      return;
    }

    if (!entryRecord) {
      finishIntake("skipped");
      finishEntry();
    }

    skipInitialHelp();
    router.replace("/");
  }, [
    entryRecord,
    finishEntry,
    finishIntake,
    queryClient,
    router,
    skipInitialHelp,
  ]);

  useEffect(() => {
    if (!session?.account || accountProfileRefreshed.current) return;

    accountProfileRefreshed.current = true;
    void refreshAccountProfile().catch(() => {
      accountProfileRefreshed.current = false;
    });
  }, [session?.account]);

  useEffect(() => {
    if (!session?.account) return;
    void fetchJournalAuthorBlocks()
      .then(setJournalAuthorBlocks)
      .catch(() => setJournalAuthorBlocks([]));
  }, [session?.account]);

  useEffect(() => {
    if (
      !oauthTicket ||
      handledOAuthTicket.current === oauthTicket
    ) {
      return;
    }

    handledOAuthTicket.current = oauthTicket;
    router.replace("/login", { scroll: false });

    void completeOAuthLogin({ ticket: oauthTicket })
      .then(async (result) => {
        if (result.status === "journal-resolution-required") {
          setOAuthCompletion({
            pending: false,
            currentJournalCount: result.currentJournalCount,
          });
          return;
        }

        setOAuthCompletion({ pending: false });
        await finishAccountChange(result.linked === true);
      })
      .catch((error: unknown) => {
        setOAuthCompletion({
          pending: false,
          error:
            error instanceof Error
              ? error.message
              : "소셜 로그인을 완료하지 못했어요.",
        });
      });
  }, [finishAccountChange, oauthTicket, router]);

  useEffect(() => {
    if (!oauthCallbackError) return;

    router.replace("/login", { scroll: false });
    setOAuthCompletion({ pending: false, error: oauthCallbackError });
  }, [oauthCallbackError, router]);

  const resolveOAuthJournals = async (
    journalResolution: AccountJournalResolution,
  ) => {
    const activeOAuthTicket = handledOAuthTicket.current;
    if (!activeOAuthTicket || oauthCompletion.pending) return;

    setOAuthCompletion((current) => ({
      ...current,
      pending: true,
      error: undefined,
    }));

    try {
      const result = await completeOAuthLogin({
        ticket: activeOAuthTicket,
        journalResolution,
      });

      if (result.status === "journal-resolution-required") {
        setOAuthCompletion({
          pending: false,
          currentJournalCount: result.currentJournalCount,
        });
        return;
      }

      setOAuthCompletion({ pending: false });
      await finishAccountChange(result.linked === true);
    } catch (error) {
      setOAuthCompletion((current) => ({
        ...current,
        pending: false,
        error:
          error instanceof Error
            ? error.message
            : "현재 기록을 처리하지 못했어요.",
      }));
    }
  };

  return (
    <AccountScreen
      displayName={session?.account?.displayName}
      email={session?.account?.email}
      identities={session?.account?.identities}
      journalAuthorBlocks={journalAuthorBlocks}
      providers={session?.account?.providers}
      accountNotice={accountNotice}
      authEnabled={accountAuthEnabled}
      oauthCompletion={{
        ...oauthCompletion,
        onJournalResolution: resolveOAuthJournals,
        onCancel: () => {
          handledOAuthTicket.current = null;
          setOAuthCompletion({ pending: false });
          router.replace("/login", { scroll: false });
        },
      }}
      onBack={() => router.replace("/")}
      onEmailCodeRequest={async (email) => {
        await requestEmailLoginCode(email);
      }}
      onEmailCodeVerify={async (email, code, journalResolution) => {
        const result = await verifyEmailLoginCode({
          email,
          code,
          journalResolution,
        });

        if (result.status === "authenticated") {
          await finishAccountChange(result.linked === true);
        }

        return result;
      }}
      onOAuth={async (provider) => {
        const native = Capacitor.isNativePlatform();
        const authorizationUrl = await createOAuthLoginUrl(provider, {
          native,
        });

        if (native) {
          await Browser.open({ url: authorizationUrl });
          return;
        }

        window.location.assign(authorizationUrl);
      }}
      onLogout={async () => {
        await logoutAccount();
        queryClient.setQueryData(["journal-entries"], []);
        router.replace("/");
      }}
      onDisplayNameUpdate={updateAccountDisplayName}
      onUnlinkIdentity={async (identityId) => {
        await unlinkAccountIdentity(identityId);
        setAccountNotice("로그인 수단 연결을 해제했어요.");
      }}
      onUnblockJournalAuthor={async (blockedUserId) => {
        await unblockJournalAuthor(blockedUserId);
        setJournalAuthorBlocks((current) =>
          current.filter((block) => block.blockedUserId !== blockedUserId),
        );
        setAccountNotice("공개 기록 작성자 차단을 해제했어요.");
      }}
      onDeleteAccount={async () => {
        const result = await deleteAccount();
        queryClient.clear();
        resetAllData();
        return result.deletionReference;
      }}
    />
  );
}
