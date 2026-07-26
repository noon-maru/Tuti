"use client";

import { useQueryClient } from "@tanstack/react-query";
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
  logoutAccount,
  requestEmailLoginCode,
  verifyEmailLoginCode,
} from "@/lib/auth/session";
import type { AccountJournalResolution } from "@/shared/api/session";
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
  const oauthTicket = searchParams.get("oauthTicket");
  const oauthCallbackError = searchParams.get("oauthError");
  const handledOAuthTicket = useRef<string | null>(null);
  const [oauthCompletion, setOAuthCompletion] = useState<{
    pending: boolean;
    error?: string;
    currentJournalCount?: number;
  }>({
    pending: Boolean(oauthTicket),
    ...(oauthCallbackError ? { error: oauthCallbackError } : {}),
  });

  const finishAccountChange = useCallback(async () => {
    if (!entryRecord) {
      finishIntake("skipped");
      finishEntry();
    }

    await queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
    router.replace("/");
  }, [
    entryRecord,
    finishEntry,
    finishIntake,
    queryClient,
    router,
  ]);

  useEffect(() => {
    if (
      !oauthTicket ||
      handledOAuthTicket.current === oauthTicket
    ) {
      return;
    }

    handledOAuthTicket.current = oauthTicket;
    window.history.replaceState(window.history.state, "", "/login");

    void completeOAuthLogin({ ticket: oauthTicket })
      .then(async (result) => {
        if (result.status === "journal-resolution-required") {
          setOAuthCompletion({
            pending: false,
            currentJournalCount: result.currentJournalCount,
          });
          return;
        }

        await finishAccountChange();
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
  }, [finishAccountChange, oauthTicket]);

  const resolveOAuthJournals = async (
    journalResolution: AccountJournalResolution,
  ) => {
    if (!oauthTicket || oauthCompletion.pending) return;

    setOAuthCompletion((current) => ({
      ...current,
      pending: true,
      error: undefined,
    }));

    try {
      const result = await completeOAuthLogin({
        ticket: oauthTicket,
        journalResolution,
      });

      if (result.status === "journal-resolution-required") {
        setOAuthCompletion({
          pending: false,
          currentJournalCount: result.currentJournalCount,
        });
        return;
      }

      await finishAccountChange();
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
      email={session?.account?.email}
      providers={session?.account?.providers}
      authEnabled={accountAuthEnabled}
      oauthCompletion={
        oauthTicket || oauthCallbackError
          ? {
              ...oauthCompletion,
              onJournalResolution: resolveOAuthJournals,
              onCancel: () => router.replace("/login"),
            }
          : undefined
      }
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
          await finishAccountChange();
        }

        return result;
      }}
      onOAuth={async (provider) => {
        const authorizationUrl = await createOAuthLoginUrl(provider);
        window.location.assign(authorizationUrl);
      }}
      onLogout={async () => {
        await logoutAccount();
        queryClient.setQueryData(["journal-entries"], []);
        router.replace("/");
      }}
    />
  );
}
