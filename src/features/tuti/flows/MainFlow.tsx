"use client";

import styled from "@emotion/styled";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { RecommendationsFlow } from "@/features/tuti/flows/RecommendationsFlow";
import { useTutiStore } from "@/store/tuti";

export function MainFlow({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const hasHydrated = useTutiStore((state) => state.hasHydrated);
  const entryRecord = useTutiStore((state) => state.entryRecord);

  useEffect(() => {
    if (hasHydrated && !entryRecord) {
      router.replace("/entry");
    }
  }, [entryRecord, hasHydrated, router]);

  if (!hasHydrated || !entryRecord) {
    return <BootstrapScreen aria-label="저장된 상태를 확인하고 있어요" />;
  }

  return (
    <>
      <RecommendationsFlow interactive={pathname === "/"} />
      {children}
    </>
  );
}

const BootstrapScreen = styled(ScreenFrame)`
  background: var(--color-surface);
`;
