"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTutiJournalEntries } from "@/features/tuti/hooks/useTutiJournalEntries";
import { useSession } from "@/features/tuti/hooks/useSession";
import {
  JournalDetailScreen,
  JournalDetailStatusScreen,
} from "@/features/tuti/screens/journal/JournalDetailScreen";
import { useTutiStore } from "@/store/tuti";
import { copyJournalPublicUrl } from "@/lib/journalShare";

export function JournalDetailFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const entryId = searchParams.get("entryId");
  const session = useSession();
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
  const returnToJournalFallback = () => router.replace("/journal");
  const publishEntry = async () => {
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

    if (
      !window.confirm(
        "링크를 아는 사람이라면 누구나 이 기록을 볼 수 있어요. 인터넷에 공개할까요?",
      )
    ) {
      return;
    }

    try {
      await changeEntryPublication(entry.id, true);
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "기록을 공개하지 못했어요.",
      );
    }
  };
  const unpublishEntry = async () => {
    if (
      !entry?.publication ||
      !window.confirm(
        "공개를 중지하면 기존 링크는 다시 사용할 수 없어요. 계속할까요?",
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
  };
  const copyPublicLink = async () => {
    if (!entry?.publication) return;

    try {
      await copyJournalPublicUrl(entry.publication.publicId);
      window.alert("공유 링크를 복사했어요.");
    } catch {
      window.alert("공유 링크를 복사하지 못했어요.");
    }
  };
  const deleteEntry = async () => {
    if (!entry || !window.confirm("이 기록을 삭제할까요?")) return;

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
      router.replace("/journal");
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "기록을 삭제하지 못했어요.",
      );
    }
  };

  if (isPending) {
    return (
      <JournalDetailStatusScreen
        message="지난 공간을 불러오고 있어요."
        onBack={returnToJournalFallback}
      />
    );
  }

  if (!entry) {
    return (
      <JournalDetailStatusScreen
        message="기록을 찾지 못했어요."
        onBack={returnToJournalFallback}
      />
    );
  }

  return (
    <JournalDetailScreen
      entry={entry}
      onBack={returnToJournal}
      onCopyPublicLink={copyPublicLink}
      onDelete={deleteEntry}
      onEdit={() =>
        router.push(
          `/journal/edit?entryId=${encodeURIComponent(entry.id)}&source=detail`,
        )
      }
      onPublish={publishEntry}
      onUnpublish={unpublishEntry}
    />
  );
}
