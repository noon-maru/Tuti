"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { AccountScreen } from "@/features/tuti/screens/account/AccountScreen";
import { useSession } from "@/features/tuti/hooks/useSession";
import {
  loginAccount,
  logoutAccount,
  registerAccount,
} from "@/lib/auth/session";
import { useTutiStore } from "@/store/tuti";

export function AccountFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
      initialMode={
        searchParams.get("mode") === "register" ? "register" : "login"
      }
      onBack={() => router.replace("/")}
      onLogin={async (credentials) => {
        await loginAccount(credentials);
        await finishAccountChange();
      }}
      onRegister={async (credentials) => {
        await registerAccount(credentials);
        await finishAccountChange();
      }}
      onLogout={async () => {
        await logoutAccount();
        queryClient.setQueryData(["journal-entries"], []);
        router.replace("/");
      }}
    />
  );
}
