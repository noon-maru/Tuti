"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { AccountScreen } from "@/features/tuti/screens/account/AccountScreen";
import { useSession } from "@/features/tuti/hooks/useSession";
import {
  createOAuthLoginUrl,
  logoutAccount,
  requestEmailLoginCode,
  verifyEmailLoginCode,
} from "@/lib/auth/session";
import { accountAuthEnabled } from "@/shared/auth/config";
import { useTutiStore } from "@/store/tuti";

export function AccountFlow() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSession();
  const entryRecord = useTutiStore((state) => state.entryRecord);
  const finishIntake = useTutiStore((state) => state.finishIntake);
  const finishEntry = useTutiStore((state) => state.finishEntry);

  const finishAccountChange = async () => {
    if (!entryRecord) {
      finishIntake("skipped");
      finishEntry();
    }

    await queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
    router.replace("/");
  };

  return (
    <AccountScreen
      email={session?.account?.email}
      providers={session?.account?.providers}
      authEnabled={accountAuthEnabled}
      onBack={() => router.replace("/")}
      onEmailCodeRequest={async (email) => {
        await requestEmailLoginCode(email);
      }}
      onEmailCodeVerify={async (email, code) => {
        await verifyEmailLoginCode({ email, code });
        await finishAccountChange();
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
