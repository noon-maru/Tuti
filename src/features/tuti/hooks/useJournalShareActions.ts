"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useSession } from "@/features/tuti/hooks/useSession";
import {
  copyJournalPublicUrl,
  shareJournalPublicUrl,
} from "@/lib/journalShare";
import type { TutiJournalEntry } from "@/shared/api/journal";
import { canAccountPublishJournal } from "@/shared/features/release";
import { getJournalPublicationPolicyVersion } from "@/shared/legal/journalPublicationPolicy";
import { fetchServiceTerms } from "@/lib/serviceTerms";

type ChangeEntryPublication = (
  entryId: string,
  published: boolean,
  consentVersion?: string,
) => Promise<TutiJournalEntry>;

export function useJournalShareActions({
  entry,
  changeEntryPublication,
}: {
  entry?: TutiJournalEntry;
  changeEntryPublication: ChangeEntryPublication;
}) {
  const router = useRouter();
  const session = useSession();
  const publicationEnabled = !entry?.sensitiveContent && !entry?.sensitiveWithdrawnAt && canAccountPublishJournal(
    session?.account?.role,
  );

  const publish = useCallback(async () => {
    if (!entry) return;

    if (!session?.account) {
      if (
        window.confirm(
          "인터넷에 공개한 기록을 계속 관리하려면 계정 연결이 필요해요. 로그인 화면으로 이동할까요?",
        )
      ) {
        router.push("/login");
      }
      return;
    }

    const consentVersion = getJournalPublicationPolicyVersion();
    await fetchServiceTerms(false);
    if (consentVersion !== getJournalPublicationPolicyVersion()) throw new Error("기록 공개 정책이 변경되었어요. 새 정책을 확인하고 다시 동의해주세요.");
    await changeEntryPublication(
      entry.id,
      true,
      consentVersion,
    );
  }, [changeEntryPublication, entry, router, session?.account]);

  const unpublish = useCallback(async () => {
    if (
      !entry ||
      entry.publicationStatus === "private" ||
      !window.confirm(
        "인터넷 공개를 중지하면 기존 링크는 다시 사용할 수 없어요. 계속할까요?",
      )
    ) {
      return;
    }

    try {
      await changeEntryPublication(entry.id, false);
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "기록 공개를 중지하지 못했어요.",
      );
    }
  }, [changeEntryPublication, entry]);

  const copyPublicLink = useCallback(async () => {
    if (!entry?.publication) return;

    try {
      await copyJournalPublicUrl(entry.publication.publicId);
      window.alert("공유 링크를 복사했어요.");
    } catch {
      window.alert("공유 링크를 복사하지 못했어요.");
    }
  }, [entry]);

  const sharePublicLink = useCallback(async () => {
    if (!entry?.publication) return;

    try {
      const result = await shareJournalPublicUrl(
        entry.publication.publicId,
        entry,
      );
      if (result === "copied") {
        window.alert("공유를 지원하지 않아 링크를 복사했어요.");
      }
    } catch {
      window.alert("공유 화면을 열지 못했어요.");
    }
  }, [entry]);

  return {
    publicationEnabled,
    publish,
    unpublish,
    copyPublicLink,
    sharePublicLink,
  };
}
