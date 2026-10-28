"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { withdrawJournalSensitiveConsent } from "@/lib/tutiApi";
import { useTutiJournalEntries } from "@/features/tuti/hooks/useTutiJournalEntries";
import { useJournalShareActions } from "@/features/tuti/hooks/useJournalShareActions";
import {
  JournalDetailScreen,
  JournalDetailStatusScreen,
} from "@/features/tuti/screens/journal/JournalDetailScreen";
import { useTutiStore } from "@/store/tuti";
import { useSession } from "@/features/tuti/hooks/useSession";
import { rememberMadiEditOrigin } from "@/lib/madiEditReturn";

export function JournalDetailFlow() {
  const router = useRouter();
  const ownerId = useSession()?.userId;
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const entryId = searchParams.get("entryId");
  const {
    changeEntryPublication,
    entries,
    isPending,
    removeEntry,
  } = useTutiJournalEntries();
  const setActiveJournalEntry = useTutiStore(
    (state) => state.setActiveJournalEntry,
  );
  const entry = entries.find((candidate) => candidate.id === entryId);
  const returnToJournal = () => router.back();
  const returnToJournalFallback = () => router.replace("/madi");
  const shareActions = useJournalShareActions({
    entry,
    changeEntryPublication,
  });
  const deleteEntry = async () => {
    if (!entry || !window.confirm(entry.sensitiveContent ? "이 마디와 사진, 이 마디를 포함한 서버 하루마디를 함께 삭제할까요? 민감정보 처리 동의도 철회돼요." : "이 마디를 삭제할까요?")) return;

    const deletedIndex = entries.findIndex(
      (candidate) => candidate.id === entry.id,
    );
    const remainingEntries = entries.filter(
      (candidate) => candidate.id !== entry.id,
    );
    const nextEntry =
      remainingEntries[
        Math.min(deletedIndex, remainingEntries.length - 1)
      ];

    try {
      await removeEntry(entry.id);
      setActiveJournalEntry(nextEntry?.id);
      router.replace("/madi");
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "마디를 삭제하지 못했어요.",
      );
    }
  };

  if (isPending) {
    return (
      <JournalDetailStatusScreen
        message="지난 공간을 불러오고 있어요."
        onBack={returnToJournalFallback}
        loading
      />
    );
  }

  if (!entry) {
    return (
      <JournalDetailStatusScreen
        message="마디를 찾지 못했어요."
        onBack={returnToJournalFallback}
      />
    );
  }

  return (
    <JournalDetailScreen
      entry={entry}
      publicationEnabled={shareActions.publicationEnabled}
      onBack={returnToJournal}
      onCopyPublicLink={shareActions.copyPublicLink}
      onDelete={deleteEntry}
      onWithdrawSensitive={async () => {
        if (!window.confirm("민감정보 처리 동의를 철회할까요? 이 마디와 사진, 이 마디를 포함한 서버 하루마디를 함께 삭제해요. 이미 내려받은 사본은 직접 정리해주세요.")) return;
        try {
          const result = await withdrawJournalSensitiveConsent(entry.id);
          if (result.pending) window.alert("철회는 접수했어요. 마디와 하루마디는 더 이상 조회할 수 없으며, 파일 정리를 재시도하고 있어요.");
          router.replace("/madi");
        } catch (error) {
          window.alert(error instanceof Error ? error.message : "철회 요청을 처리하지 못했어요.");
        } finally {
          await queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
          await queryClient.invalidateQueries({ queryKey: ["harumadi-pdfs"] });
        }
      }}
      onEdit={() => {
        rememberMadiEditOrigin(ownerId, entry.id, "detail");
        router.push(
          `/madi/edit?entryId=${encodeURIComponent(entry.id)}&source=detail`,
        );
      }}
      onPublish={shareActions.publish}
      onSharePublicLink={shareActions.sharePublicLink}
      onUnpublish={shareActions.unpublish}
    />
  );
}
