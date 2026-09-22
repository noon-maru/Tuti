"use client";

import styled from "@emotion/styled";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  ChevronRight,
  Check,
  BookOpen,
  Download,
  Trash2,
} from "lucide-react";
import { useSession } from "@/features/tuti/hooks/useSession";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createJournalBook,
  deleteJournalBook,
  fetchJournalBooks,
  fetchJournalEntries,
} from "@/lib/tutiApi";
import { getSessionSnapshot } from "@/lib/auth/session";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import {
  BackButton,
  BaseButton,
  PrimaryButton,
} from "@/features/tuti/components/buttons";
import { JournalBookPreview } from "@/features/tuti/components/JournalBookPreview";
import {
  loadJournalBookDraft,
  saveJournalBookDraft,
  removeJournalBookDraft,
} from "@/lib/journalBookDraft";
import {
  emptyJournalBookDraft,
  getJournalBookCoverPalette,
  isJournalBookDateInRange,
  journalBookPhotoTextMayContinue,
  journalBookCoverUsesImage,
  journalBookDate,
  parseJournalBookInput,
  JOURNAL_BOOK_MAX_ENTRIES,
  JOURNAL_BOOK_TITLE_LIMIT,
  JOURNAL_BOOK_LETTER_LIMIT,
  type JournalBookCoverStyle,
  type JournalBookDraft,
} from "@/shared/api/journalBook";
import { LoadingIndicator } from "@/features/tuti/components/LoadingIndicator";
import { exportJournalBookPdf } from "@/lib/journalBookExport";
import type { StoredJournalBook } from "@/shared/api/journalBook";
import { recordProductActivity } from "@/lib/productActivity";
import type { ProductActivityType } from "@/shared/api/productActivity";

const BOOK_STEPS = [
  { value: "selection", label: "기록 고르기" },
  { value: "details", label: "표지 고르기" },
  { value: "letter", label: "남기는 말" },
  { value: "preview", label: "미리보기" },
] as const;

const COVER_BACKGROUND_OPTIONS = [
  { value: "white", label: "흰색", color: "#FFFFFF" },
  { value: "green", label: "연두색", color: "#EBF5D5" },
] as const;

const COVER_IMAGE_OPTIONS = [
  { value: false, label: "이미지 없이" },
  { value: true, label: "이미지와 함께" },
] as const;

function makeCoverStyle(
  background: "white" | "green",
  usesImage: boolean,
): JournalBookCoverStyle {
  return `${background}-${usesImage ? "image" : "plain"}`;
}

const BOOK_STEP_VIEW_ACTIVITY = {
  selection: "journal_book_selection_viewed",
  details: "journal_book_details_viewed",
  letter: "journal_book_details_viewed",
  preview: "journal_book_preview_viewed",
} as const satisfies Record<JournalBookDraft["step"], ProductActivityType>;

const BOOK_STEP_EXIT_ACTIVITY = {
  selection: "journal_book_selection_exited",
  details: "journal_book_details_exited",
  letter: "journal_book_details_exited",
  preview: "journal_book_preview_exited",
} as const satisfies Record<JournalBookDraft["step"], ProductActivityType>;

export function JournalBookFlow() {
  const session = useSession();
  return session ? (
    <BookEditor key={session.userId} ownerId={session.userId} />
  ) : (
    <Frame>
      <p role="status">기록을 준비하고 있어요.</p>
      <SmallButton type="button" onClick={() => window.location.reload()}>
        다시 불러오기
      </SmallButton>
    </Frame>
  );
}

function BookEditor({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    data: entries = [],
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["journal-book-entries", ownerId],
    queryFn: async () => {
      const result = await fetchJournalEntries();
      if (getSessionSnapshot()?.userId !== ownerId) {
        throw new Error("사용자가 변경되었습니다.");
      }
      return result;
    },
  });
  const {
    data: books = [],
    isPending: booksPending,
    isError: booksError,
    refetch: refetchBooks,
  } = useQuery({
    queryKey: ["journal-books", ownerId],
    queryFn: fetchJournalBooks,
  });
  const [draft, setDraft] = useState<JournalBookDraft | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saveStatus, setSaveStatus] = useState("이 기기에 자동으로 저장돼요.");
  const [message, setMessage] = useState("");
  const [selectionNotice, setSelectionNotice] = useState("");
  const [previewPdf, setPreviewPdf] = useState<{
    bytes: Uint8Array;
    pageCount: number;
    approvalToken?: string;
  } | null>(null);
  const [completing, setCompleting] = useState(false);
  const [openedBook, setOpenedBook] = useState<StoredJournalBook | null>(null);
  const latestSave = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    recordBookActivity("journal_book_entered");
  }, []);

  useEffect(() => {
    let active = true;
    void loadJournalBookDraft(ownerId)
      .then((saved) => {
        if (active) setDraft(saved ?? emptyJournalBookDraft());
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [ownerId]);

  const sorted = useMemo(
    () =>
      [...entries].sort(
        (a, b) =>
          a.visitedAt.localeCompare(b.visitedAt) || a.id.localeCompare(b.id),
      ),
    [entries],
  );
  const chosen = sorted.filter((entry) => draft?.entryIds.includes(entry.id));
  const coverPhotoEntries = chosen.filter((entry) => entry.image);
  const coverPhoto =
    coverPhotoEntries.find((entry) => entry.id === draft?.coverEntryId) ??
    coverPhotoEntries[0] ??
    null;
  const coverFromDate = chosen[0]
    ? compactBookDate(chosen[0].visitedAt)
    : "2026.06.23";
  const coverToDate = chosen.at(-1)
    ? compactBookDate(chosen.at(-1)!.visitedAt)
    : "2026.06.30";
  const coverUsesImage = draft
    ? journalBookCoverUsesImage(draft.coverStyle)
    : false;
  const coverBackground = draft?.coverStyle.startsWith("green-")
    ? "green"
    : "white";
  const coverPalette = getJournalBookCoverPalette(
    draft?.coverStyle ?? "white-plain",
  );
  const visibleEntries = draft
    ? sorted.filter((entry) =>
        isJournalBookDateInRange(
          entry.visitedAt,
          draft.fromDate,
          draft.toDate,
        ),
      )
    : sorted;
  const chosenOutsideFilter = draft
    ? chosen.filter(
        (entry) =>
          !isJournalBookDateInRange(
            entry.visitedAt,
            draft.fromDate,
            draft.toDate,
          ),
      )
    : [];
  const missing = draft
    ? draft.entryIds.filter((id) => !entries.some((entry) => entry.id === id))
    : [];
  const input = useMemo(
    () => (draft && missing.length === 0 ? parseJournalBookInput(draft) : null),
    [draft, missing.length],
  );
  const stepIndex = draft
    ? BOOK_STEPS.findIndex(({ value }) => value === draft.step)
    : 0;

  useEffect(() => {
    if (!draft?.step) return;
    recordBookActivity(BOOK_STEP_VIEW_ACTIVITY[draft.step]);
  }, [draft?.step]);

  const handlePreviewReady = useCallback(
    (result: {
      bytes: Uint8Array;
      pageCount: number;
      approvalToken?: string;
    } | null) =>
      setPreviewPdf(result),
    [],
  );

  function update(next: JournalBookDraft) {
    setDraft(next);
    setMessage("");
    setSaveStatus("저장하고 있어요…");
    const serial = ++latestSave.current;
    void saveJournalBookDraft(ownerId, next)
      .then(() => {
        if (serial === latestSave.current) setSaveStatus("");
      })
      .catch(() => {
        if (serial === latestSave.current)
          setSaveStatus("초안을 저장하지 못했어요. 다시 저장해주세요.");
      });
  }

  function changeStep(step: JournalBookDraft["step"]) {
    if (!draft) return;
    const currentIndex = BOOK_STEPS.findIndex(
      ({ value }) => value === draft.step,
    );
    const nextIndex = BOOK_STEPS.findIndex(({ value }) => value === step);
    if (nextIndex < currentIndex) {
      recordBookActivity(BOOK_STEP_EXIT_ACTIVITY[draft.step]);
    }
    if (step === "selection") void refetch();
    else setSelectionNotice("");
    update({ ...draft, step });
    scroller.current?.scrollTo({ top: 0 });
    heading.current?.focus();
  }

  function select(id: string) {
    if (!draft) return;
    const selected = draft.entryIds.includes(id);
    if (!selected && draft.entryIds.length >= JOURNAL_BOOK_MAX_ENTRIES) {
      setMessage(
        `한 권에는 최대 ${JOURNAL_BOOK_MAX_ENTRIES}개의 기록을 담을 수 있어요.`,
      );
      return;
    }
    const entryIds = selected
      ? draft.entryIds.filter((entryId) => entryId !== id)
      : [...draft.entryIds, id];
    const selectedEntry = sorted.find((entry) => entry.id === id);
    update({
      ...draft,
      entryIds,
      coverEntryId: entryIds.includes(draft.coverEntryId ?? "")
        ? draft.coverEntryId
        : null,
    });
    setSelectionNotice(
      !selected &&
        Boolean(selectedEntry?.image) &&
        journalBookPhotoTextMayContinue(selectedEntry?.content ?? "")
        ? "글이 길어 이 기록은 다음 쪽으로 이어질 수 있어요. 내용은 잘리지 않고 모두 담겨요."
        : "",
    );
  }

  const back = () => {
    if (!draft || draft.step === "selection") {
      if (draft) recordBookActivity(BOOK_STEP_EXIT_ACTIVITY.selection);
      router.replace("/journal");
    }
    else if (draft.step === "preview") changeStep("letter");
    else if (draft.step === "letter") changeStep("details");
    else changeStep("selection");
  };

  async function completeBook() {
    if (!input || !previewPdf?.approvalToken || completing) return;
    setCompleting(true);
    setMessage("");
    try {
      const book = await createJournalBook(
        previewPdf.bytes,
        previewPdf.approvalToken,
      );
      queryClient.setQueryData<StoredJournalBook[]>(
        ["journal-books", ownerId],
        (current = []) => [book, ...current.filter(({ id }) => id !== book.id)],
      );
      latestSave.current += 1;
      try {
        await removeJournalBookDraft(ownerId);
      } catch {
        // 완성본은 이미 서버에 안전하게 보관되었으므로 로컬 초안 정리만 생략한다.
      }
      setDraft(emptyJournalBookDraft());
      setOpenedBook(book);
      recordBookActivity("journal_book_completed");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "기록집을 완성하지 못했어요. 잠시 후 다시 시도해주세요.",
      );
    } finally {
      setCompleting(false);
    }
  }

  if (loadError)
    return (
      <Frame>
        <p role="alert">저장된 초안을 읽지 못했어요.</p>
        <SmallButton onClick={() => window.location.reload()}>
          다시 불러오기
        </SmallButton>
        <SmallButton
          onClick={async () => {
            try {
              await removeJournalBookDraft(ownerId);
              setDraft(emptyJournalBookDraft());
              setLoadError(false);
            } catch {
              setMessage("초안을 지우지 못했어요. 잠시 후 다시 시도해주세요.");
            }
          }}
        >
          초안을 지우고 새로 만들기
        </SmallButton>
        {message && <p role="alert">{message}</p>}
        <SmallButton onClick={() => router.replace("/journal")}>
          기록으로 돌아가기
        </SmallButton>
      </Frame>
    );

  if (openedBook) {
    return (
      <StoredBookViewer
        ownerId={ownerId}
        book={openedBook}
        onBack={() => setOpenedBook(null)}
        onDeleted={() => {
          queryClient.setQueryData<StoredJournalBook[]>(
            ["journal-books", ownerId],
            (current = []) => current.filter(({ id }) => id !== openedBook.id),
          );
          setOpenedBook(null);
        }}
      />
    );
  }

  return (
    <Frame aria-label="기록집 만들기">
      <Header>
        <BackButton
          onClick={back}
          aria-label={
            draft?.step === "selection" ? "기록으로 돌아가기" : "이전 단계"
          }
        />
        <h1>작은 기록집</h1>
        <HeaderSpacer aria-hidden="true" />
      </Header>
      <Content ref={scroller}>
        {!draft || isPending ? (
          <LoadingState>
            <LoadingIndicator label="남겨 둔 기록을 불러오고 있어요." />
          </LoadingState>
        ) : isError ? (
          <Notice role="alert">
            기록을 불러오지 못했어요.
            <SmallButton onClick={() => void refetch()}>
              다시 시도하기
            </SmallButton>
          </Notice>
        ) : (
          <>
            <StepGuide aria-label={`제작 단계 ${stepIndex + 1}/4`}>
              <StepLabel>
                <span>{stepIndex + 1}/4</span>
                {BOOK_STEPS[stepIndex].label}
              </StepLabel>
              <StepRail aria-hidden="true">
                {BOOK_STEPS.map(({ value }, index) => (
                  <span
                    key={value}
                    data-active={index <= stepIndex ? "true" : undefined}
                  />
                ))}
              </StepRail>
            </StepGuide>
            <IntroBlock>
              <h2 ref={heading} tabIndex={-1}>
                {draft.step === "selection"
                  ? "어떤 시간을 담아볼까요?"
                  : draft.step === "details"
                    ? "이 시간에 이름을 붙여주세요."
                    : draft.step === "letter"
                      ? "이 공간에 남기는 말"
                      : "한 권으로 모인 시간"}
              </h2>
              <Intro>
                {draft.step === "selection"
                  ? "간직하고 싶은 기록만 골라주세요. 날짜순으로 차분히 엮어드릴게요."
                  : draft.step === "details"
                    ? "기록집의 제목과 표지 구성을 골라주세요."
                    : draft.step === "letter"
                      ? "특별한 문장이 아니어도 괜찮아요. 그곳에 남은 마음을 가볍게 적어보세요."
                      : "표지부터 기록 본문까지 잘 담겼는지 살펴보세요."}
              </Intro>
            </IntroBlock>
            {missing.length > 0 && (
              <Notice role="alert">
                삭제되었거나 접근할 수 없는 기록이 {missing.length}개 있어요.
                <SmallButton
                  onClick={() =>
                    update({
                      ...draft,
                      step: "selection",
                      entryIds: chosen.map((entry) => entry.id),
                      coverEntryId: chosen.some(
                        (entry) => entry.id === draft.coverEntryId,
                      )
                        ? draft.coverEntryId
                        : null,
                    })
                  }
                >
                  해당 기록을 빼고 계속하기
                </SmallButton>
              </Notice>
            )}

            {draft.step === "selection" && (
              <>
                <BookLibrary>
                  <LibraryHeading>
                    <h3>완성한 기록집</h3>
                    {books.length > 0 && <span>{books.length}권</span>}
                  </LibraryHeading>
                  {booksPending ? (
                    <LibraryStatus>기록집을 불러오고 있어요.</LibraryStatus>
                  ) : booksError ? (
                    <LibraryStatus role="alert">
                      기록집을 불러오지 못했어요.
                      <SmallButton onClick={() => void refetchBooks()}>
                        다시 시도하기
                      </SmallButton>
                    </LibraryStatus>
                  ) : books.length === 0 ? (
                    <LibraryStatus>완성한 기록집이 아직 없어요.</LibraryStatus>
                  ) : (
                    <BookList>
                      {books.map((book) => (
                        <BookItem
                          key={book.id}
                          type="button"
                          onClick={() => setOpenedBook(book)}
                        >
                          <BookGlyph aria-hidden="true">
                            <BookOpen size={20} />
                          </BookGlyph>
                          <BookCopy>
                            <strong>{book.title}</strong>
                            <span>
                              {formatBookDate(book.createdAt)} · 기록 {book.entryCount}
                              개 · {book.pageCount}쪽
                            </span>
                          </BookCopy>
                          <ChevronRight size={18} aria-hidden="true" />
                        </BookItem>
                      ))}
                    </BookList>
                  )}
                </BookLibrary>
                {entries.length === 0 ? (
                  <Notice>
                    남긴 기록이 아직 없어요.
                    <SmallButton onClick={() => router.push("/journal/new")}>
                      첫 기록 남기기
                    </SmallButton>
                  </Notice>
                ) : (
                  <>
                    <FilterPanel>
                      <Dates>
                        <label>
                          시작일
                          <input
                            type="date"
                            value={draft.fromDate}
                            max={draft.toDate || undefined}
                            onChange={(event) =>
                              update({ ...draft, fromDate: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          종료일
                          <input
                            type="date"
                            value={draft.toDate}
                            min={draft.fromDate || undefined}
                            onChange={(event) =>
                              update({ ...draft, toDate: event.target.value })
                            }
                          />
                        </label>
                      </Dates>
                      {(draft.fromDate || draft.toDate) && (
                        <ResetButton
                          onClick={() =>
                            update({ ...draft, fromDate: "", toDate: "" })
                          }
                        >
                          모든 날짜 보기
                        </ResetButton>
                      )}
                    </FilterPanel>
                    {chosenOutsideFilter.length > 0 && (
                      <FilterSelectionNotice role="status">
                        <div>
                          <strong>
                            날짜 범위 밖의 기록 {chosenOutsideFilter.length}개도
                            담겨요.
                          </strong>
                          <p>
                            아래 선택 목록에서 확인하거나 뺄 수 있어요.
                          </p>
                        </div>
                        <ResetButton
                          type="button"
                          onClick={() =>
                            update({ ...draft, fromDate: "", toDate: "" })
                          }
                        >
                          모두 보기
                        </ResetButton>
                      </FilterSelectionNotice>
                    )}
                    {chosen.length > 0 && (
                      <SelectionReview aria-label="이 책에 담을 기록">
                        <SelectionReviewHeading>
                          <span>
                            <strong>이 책에 담을 기록</strong>
                            <small>{chosen.length}개 · 날짜순</small>
                          </span>
                          <span aria-hidden="true">담김</span>
                        </SelectionReviewHeading>
                        <SelectedRecords>
                          {chosen.map((entry, index) => {
                            const outside = chosenOutsideFilter.some(
                              ({ id }) => id === entry.id,
                            );
                            return (
                              <SelectedRecord key={entry.id}>
                                <SelectedOrder aria-hidden="true">
                                  {String(index + 1).padStart(2, "0")}
                                </SelectedOrder>
                                <SelectedCopy>
                                  <strong>{entry.title}</strong>
                                  <span>
                                    {journalBookDate(entry.visitedAt)} ·{" "}
                                    {entry.placeName}
                                  </span>
                                </SelectedCopy>
                                {outside && <OutsideTag>범위 밖</OutsideTag>}
                                <RemoveSelection
                                  type="button"
                                  onClick={() => select(entry.id)}
                                  aria-label={`${entry.title} 기록을 책에서 빼기`}
                                >
                                  빼기
                                </RemoveSelection>
                              </SelectedRecord>
                            );
                          })}
                        </SelectedRecords>
                      </SelectionReview>
                    )}
                    <SelectionSummary>
                      <strong>{draft.entryIds.length}개 선택</strong>
                      <span>한 권에 최대 {JOURNAL_BOOK_MAX_ENTRIES}개</span>
                    </SelectionSummary>
                    {selectionNotice && (
                      <SelectionNotice role="status">
                        {selectionNotice}
                      </SelectionNotice>
                    )}
                    <SelectionList>
                      {visibleEntries.map((entry) => (
                          <EntryButton
                            key={entry.id}
                            type="button"
                            aria-pressed={draft.entryIds.includes(entry.id)}
                            onClick={() => select(entry.id)}
                          >
                            <Thumb>
                              {entry.image ? (
                                <Image
                                  src={entry.image}
                                  alt=""
                                  width={58}
                                  height={66}
                                  unoptimized
                                  loading="lazy"
                                />
                              ) : (
                                <BookOpen size={22} aria-hidden="true" />
                              )}
                            </Thumb>
                            <EntryCopy>
                              <span>{journalBookDate(entry.visitedAt)}</span>
                              <strong>{entry.title}</strong>
                              <span>{entry.placeName}</span>
                            </EntryCopy>
                            <CheckMark
                              $selected={draft.entryIds.includes(entry.id)}
                            >
                              {draft.entryIds.includes(entry.id) && (
                                <Check size={16} aria-hidden="true" />
                              )}
                            </CheckMark>
                          </EntryButton>
                        ))}
                    </SelectionList>
                    {visibleEntries.length === 0 && (
                      <Hint>
                        이 기간에 남긴 기록이 없어요. 날짜를 바꿔주세요.
                      </Hint>
                    )}
                  </>
                )}
              </>
            )}

            {draft.step === "details" && (
              <>
                <Field>
                  기록집 제목
                  <input
                    value={draft.title}
                    maxLength={JOURNAL_BOOK_TITLE_LIMIT}
                    onChange={(event) =>
                      update({ ...draft, title: event.target.value })
                    }
                    placeholder="예: 함께 걸었던 봄"
                  />
                </Field>
                <fieldset>
                  <legend>표지</legend>
                  <Hint>배경과 사진 구성을 골라주세요.</Hint>
                  <CoverControls>
                    <CoverControl>
                      <CoverControlLabel>배경 색상</CoverControlLabel>
                      <CoverChoices>
                        {COVER_BACKGROUND_OPTIONS.map((option) => {
                          const active = coverBackground === option.value;
                          return (
                            <CoverChoiceButton
                              key={option.value}
                              type="button"
                              $active={active}
                              aria-pressed={active}
                              onClick={() =>
                                update({
                                  ...draft,
                                  coverStyle: makeCoverStyle(
                                    option.value,
                                    coverUsesImage,
                                  ),
                                })
                              }
                            >
                              <ColorSwatch $color={option.color} />
                              {option.label}
                            </CoverChoiceButton>
                          );
                        })}
                      </CoverChoices>
                    </CoverControl>
                    <CoverControl>
                      <CoverControlLabel>이미지</CoverControlLabel>
                      <CoverChoices>
                        {COVER_IMAGE_OPTIONS.map((option) => {
                          const active = coverUsesImage === option.value;
                          return (
                            <CoverChoiceButton
                              key={String(option.value)}
                              type="button"
                              $active={active}
                              aria-pressed={active}
                              onClick={() =>
                                update({
                                  ...draft,
                                  coverStyle: makeCoverStyle(
                                    coverBackground,
                                    option.value,
                                  ),
                                  coverEntryId: option.value
                                    ? coverPhoto?.id ?? null
                                    : null,
                                })
                              }
                            >
                              {option.label}
                            </CoverChoiceButton>
                          );
                        })}
                      </CoverChoices>
                    </CoverControl>
                  </CoverControls>
                  <CoverPreview $background={coverPalette.background}>
                    <CoverOptionHeader $color={coverPalette.foreground}>
                      <span>
                        {coverFromDate}
                        <br />- {coverToDate}
                      </span>
                      <span>{draft.title.trim() || "작은 기록집"}</span>
                    </CoverOptionHeader>
                    {coverUsesImage && (
                      <CoverOptionArtwork
                        $placeholder={coverPalette.placeholder}
                      >
                        {coverPhoto?.image && (
                          <Image
                            src={coverPhoto.image}
                            alt=""
                            width={132}
                            height={106}
                            unoptimized
                          />
                        )}
                      </CoverOptionArtwork>
                    )}
                    <CoverOptionWordmark $color={coverPalette.foreground}>
                      Tuti
                    </CoverOptionWordmark>
                  </CoverPreview>
                  {coverUsesImage &&
                    (coverPhotoEntries.length > 0 ? (
                      <PhotoPicker>
                        <span>표지에 담을 사진</span>
                        <PhotoOptions>
                          {coverPhotoEntries.map((entry) => (
                            <PhotoButton
                              key={entry.id}
                              type="button"
                              $active={draft.coverEntryId === entry.id}
                              aria-pressed={draft.coverEntryId === entry.id}
                              aria-label={`${entry.title} 사진을 표지로 선택`}
                              onClick={() =>
                                update({ ...draft, coverEntryId: entry.id })
                              }
                            >
                              <Image
                                src={entry.image!}
                                alt=""
                                width={72}
                                height={72}
                                unoptimized
                                loading="lazy"
                              />
                            </PhotoButton>
                          ))}
                        </PhotoOptions>
                      </PhotoPicker>
                    ) : (
                      <CoverFallbackNote>
                        사진이 없어 선택한 배경에 어울리는 색 면을 담아요.
                      </CoverFallbackNote>
                    ))}
                </fieldset>
                <Hint>
                  선택한 {chosen.length}개의 기록을 날짜순으로 담아요. 원래
                  기록은 바뀌지 않아요.
                </Hint>
              </>
            )}

            {draft.step === "letter" && (
              <LetterEditor>
                <Field>
                  이 공간에 남기는 말 <span>선택</span>
                  <textarea
                    rows={7}
                    maxLength={JOURNAL_BOOK_LETTER_LIMIT}
                    value={draft.letter}
                    onChange={(event) =>
                      update({ ...draft, letter: event.target.value })
                    }
                    placeholder={
                      "그곳의 분위기나 함께했던 사람과의 시간을 자유롭게 적어보세요\n특별한 문장이 아니어도 괜찮습니다\n\n발길이 닿았던 자리와 그때 나눈 온기를 가볍게 정리해 보세요"
                    }
                  />
                </Field>
                <LetterPagePreview aria-label="이 공간에 남기는 말 페이지 미리보기">
                  <LetterPageHeading>이 공간에 남기는 말</LetterPageHeading>
                  <LetterPageBody $placeholder={!draft.letter.trim()}>
                    {draft.letter.trim() ||
                      "그곳의 분위기나 함께했던 사람과의 시간을 자유롭게 적어보세요\n특별한 문장이 아니어도 괜찮습니다\n\n발길이 닿았던 자리와 그때 나눈 온기를 가볍게 정리해 보세요"}
                  </LetterPageBody>
                  <LetterPageNumber aria-hidden="true">1</LetterPageNumber>
                </LetterPagePreview>
              </LetterEditor>
            )}

            {draft.step === "preview" && (
              <>
                <Hint>
                  일부 이모지는 □로 표시될 수 있어요.
                </Hint>
                {input ? (
                  <JournalBookPreview
                    key={JSON.stringify(input) + JSON.stringify(chosen)}
                    input={input}
                    ownerId={ownerId}
                    onReady={handlePreviewReady}
                  />
                ) : (
                  <Notice>
                    기록과 제목을 확인한 뒤 미리보기를 만들어주세요.
                    <SmallButton onClick={() => changeStep("selection")}>
                      기록 다시 고르기
                    </SmallButton>
                  </Notice>
                )}
              </>
            )}
            {message && <Notice role="status">{message}</Notice>}
          </>
        )}
      </Content>
      {draft && !isPending && !isError && (
        <Footer>
          {saveStatus && (
            <SaveStatus role="status">
              {saveStatus}
              {saveStatus.includes("못했") && (
                <SmallButton onClick={() => update(draft)}>다시 저장</SmallButton>
              )}
            </SaveStatus>
          )}
          {draft.step === "selection" ? (
            <PrimaryButton
              disabled={chosen.length === 0 || missing.length > 0}
              onClick={() => changeStep("details")}
            >
              선택한 {chosen.length}개 확인하고 계속하기
            </PrimaryButton>
          ) : draft.step === "details" ? (
            <PrimaryButton
              disabled={!draft.title.trim() || missing.length > 0}
              onClick={() => changeStep("letter")}
            >
              표지를 정하고 계속하기
            </PrimaryButton>
          ) : draft.step === "letter" ? (
            <PrimaryButton
              disabled={!input}
              onClick={() => changeStep("preview")}
            >
              기록집 미리보기
            </PrimaryButton>
          ) : (
            <PreviewActions>
              <EditButton
                type="button"
                disabled={completing}
                onClick={() => changeStep("letter")}
              >
                남기는 말 수정하기
              </EditButton>
              <PrimaryButton
                disabled={!input || !previewPdf?.approvalToken || completing}
                onClick={() => void completeBook()}
              >
                {completing ? "안전하게 보관하는 중…" : "기록집 완성하기"}
              </PrimaryButton>
            </PreviewActions>
          )}
        </Footer>
      )}
    </Frame>
  );
}

function StoredBookViewer({
  ownerId,
  book,
  onBack,
  onDeleted,
}: {
  ownerId: string;
  book: StoredJournalBook;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const [pdf, setPdf] = useState<{
    bytes: Uint8Array;
    pageCount: number;
    approvalToken?: string;
  } | null>(null);
  const [busy, setBusy] = useState<"download" | "delete" | null>(null);
  const [message, setMessage] = useState("");
  const handleReady = useCallback(
    (result: {
      bytes: Uint8Array;
      pageCount: number;
      approvalToken?: string;
    } | null) => setPdf(result),
    [],
  );

  async function download() {
    if (!pdf || busy) return;
    setBusy("download");
    setMessage("");
    try {
      await exportJournalBookPdf(pdf.bytes, book.title);
      recordBookActivity("journal_book_saved");
    } catch {
      setMessage("기록집 파일을 준비하지 못했어요. 다시 시도해주세요.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (
      busy ||
      !window.confirm(
        "이 기록집을 삭제할까요? 삭제하면 다시 복구할 수 없어요.",
      )
    )
      return;
    setBusy("delete");
    setMessage("");
    try {
      await deleteJournalBook(book.id);
      onDeleted();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "기록집을 삭제하지 못했어요.",
      );
      setBusy(null);
    }
  }

  return (
    <Frame aria-label="완성한 기록집">
      <Header>
        <BackButton
          onClick={onBack}
          aria-label="기록집 목록으로 돌아가기"
        />
        <h1>작은 기록집</h1>
        <HeaderSpacer aria-hidden="true" />
      </Header>
      <Content>
        <CompletedHeading>
          <h2>{book.title}</h2>
          <p>
            {formatBookDate(book.createdAt)} · 기록 {book.entryCount}개 · {book.pageCount}쪽
          </p>
        </CompletedHeading>
        <JournalBookPreview
          bookId={book.id}
          ownerId={ownerId}
          onReady={handleReady}
        />
        {message && <Notice role="alert">{message}</Notice>}
        <DeleteButton
          type="button"
          disabled={busy !== null}
          onClick={() => void remove()}
        >
          <Trash2 size={16} aria-hidden="true" />
          {busy === "delete" ? "삭제하는 중…" : "기록집 삭제"}
        </DeleteButton>
      </Content>
      <Footer>
        <SaveStatus>계정에 안전하게 보관된 기록집이에요.</SaveStatus>
        <PrimaryButton
          disabled={!pdf || busy !== null}
          onClick={() => void download()}
        >
          <Download size={18} aria-hidden="true" />
          {busy === "download" ? "파일을 준비하는 중…" : "PDF 저장·공유하기"}
        </PrimaryButton>
      </Footer>
    </Frame>
  );
}

function formatBookDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function compactBookDate(value: string) {
  return journalBookDate(value).replaceAll("-", ".");
}

function recordBookActivity(action: ProductActivityType) {
  void recordProductActivity(action).catch(() => {
    // 분석 기록 실패가 기록집 제작·저장 흐름을 막지 않도록 한다.
  });
}

const Frame = styled(ScreenFrame)`
  z-index: 2;
  background: var(--color-surface);
  gap: var(--space-5);
  touch-action: auto;

  h2:focus {
    outline: none;
  }

  button:focus-visible,
  input:focus-visible,
  textarea:focus-visible,
  summary:focus-visible {
    outline: 2px solid var(--color-accent-primary);
    outline-offset: 3px;
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: var(--space-7) 0;
    min-width: 0;
  }

  legend {
    color: var(--color-text);
    font-size: var(--font-size-200);
    font-weight: 600;
  }

  input,
  textarea {
    font: inherit;
    font-size: 16px;
    color: var(--color-text);
  }
`;
const Header = styled.header`
  min-height: var(--space-11);
  display: grid;
  grid-template-columns: var(--space-11) 1fr var(--space-11);
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;

  h1 {
    margin: 0;
    font-size: var(--font-size-400);
    font-weight: 700;
    line-height: var(--line-height-heading);
    letter-spacing: var(--letter-spacing-heading);
    text-align: center;
  }
`;

const SmallButton = styled(BaseButton)`
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  min-height: 44px;
  padding: var(--space-2);
  cursor: pointer;
  font-size: var(--font-size-100);
`;

const HeaderSpacer = styled.span`
  width: var(--space-11);
  height: var(--space-11);
`;

const Content = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--space-2) 2px var(--space-7);
  touch-action: pan-y;
`;

const LoadingState = styled.div`
  min-height: 100%;
  display: grid;
  place-items: center;
  padding-bottom: 15%;
`;

const StepGuide = styled.div`
  display: grid;
  gap: var(--space-2);
  margin-bottom: var(--space-8);
`;

const StepLabel = styled.p`
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  font-weight: 500;

  span {
    color: var(--color-brand-700);
    font-weight: 700;
  }
`;

const StepRail = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-2);

  span {
    height: 3px;
    border-radius: 999px;
    background: var(--color-neutral-300);
    transition: background 200ms ease;
  }

  span[data-active="true"] {
    background: var(--color-accent-bridge);
  }
`;

const IntroBlock = styled.div`
  display: grid;
  gap: var(--space-2);
  margin-bottom: var(--space-7);

  h2 {
    margin: 0;
    color: var(--color-text);
    font-size: var(--font-size-500);
    font-weight: 700;
    line-height: var(--line-height-heading);
    letter-spacing: var(--letter-spacing-heading);
  }
`;

const Intro = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-200);
  line-height: var(--line-height-body);
  letter-spacing: var(--letter-spacing-body);
`;

const Hint = styled.p`
  margin: var(--space-3) 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  line-height: var(--line-height-body);
`;

const Notice = styled.div`
  margin: var(--space-4) 0;
  padding: var(--space-4);
  border: 1px solid var(--color-neutral-300);
  border-radius: 16px;
  background: var(--color-neutral-200);
  color: var(--color-text);
  font-size: var(--font-size-200);
  line-height: var(--line-height-body);

  button {
    display: block;
  }
`;

const FilterPanel = styled.div`
  display: grid;
  gap: var(--space-2);
  margin-bottom: var(--space-5);
  padding: var(--space-4);
  border-radius: 18px;
  background: var(--color-neutral-200);
`;

const Dates = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);

  label {
    min-width: 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    font-weight: 500;
  }

  input {
    display: block;
    min-width: 0;
    width: 100%;
    min-height: 44px;
    margin-top: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 1px solid transparent;
    border-radius: 12px;
    background: var(--color-surface);
    box-sizing: border-box;
    color-scheme: light;

    &:focus-visible {
      border-color: var(--color-brand-500);
    }
  }
`;

const ResetButton = styled(SmallButton)`
  width: fit-content;
  min-height: 36px;
  justify-self: end;
  padding: var(--space-1) var(--space-2);
  color: var(--color-brand-800);
  font-weight: 600;
`;

const SelectionSummary = styled.p`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  margin: 0 0 var(--space-3);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);

  strong {
    color: var(--color-brand-800);
    font-weight: 700;
  }
`;

const SelectionNotice = styled.p`
  margin: 0 0 var(--space-4);
  padding: var(--space-3) var(--space-4);
  border-radius: 14px;
  background: var(--color-brand-100);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  line-height: var(--line-height-body);
`;

const FilterSelectionNotice = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin: calc(var(--space-2) * -1) 0 var(--space-4);
  padding: var(--space-3) var(--space-4);
  border-left: 3px solid var(--color-accent-bridge);
  border-radius: 4px 14px 14px 4px;
  background: var(--color-brand-100);

  strong {
    display: block;
    color: var(--color-text);
    font-size: var(--font-size-100);
    line-height: 1.5;
  }

  p {
    margin: 2px 0 0;
    color: var(--color-text-muted);
    font-size: 11px;
    line-height: 1.5;
  }

  button {
    flex-shrink: 0;
  }
`;

const SelectionReview = styled.section`
  margin: 0 0 var(--space-5);
  border: 1px solid var(--color-neutral-300);
  border-radius: 18px;
  background: var(--color-surface);
  overflow: hidden;
`;

const SelectionReviewHeading = styled.div`
  min-height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  color: var(--color-brand-800);

  > span:first-of-type {
    display: grid;
    gap: 2px;
  }

  strong {
    color: var(--color-text);
    font-size: var(--font-size-200);
    font-weight: 700;
  }

  small {
    color: var(--color-text-muted);
    font-size: 11px;
    font-weight: 400;
  }

  > span:last-of-type {
    font-size: var(--font-size-100);
    font-weight: 600;
  }
`;

const SelectedRecords = styled.ol`
  margin: 0;
  padding: 0 var(--space-4) var(--space-2);
  list-style: none;
`;

const SelectedRecord = styled.li`
  min-height: 54px;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  border-top: 1px solid var(--color-neutral-300);
`;

const SelectedOrder = styled.span`
  width: 24px;
  flex-shrink: 0;
  color: var(--color-brand-700);
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.08em;
`;

const SelectedCopy = styled.span`
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 1px;

  strong {
    overflow: hidden;
    color: var(--color-text);
    font-size: var(--font-size-100);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    overflow: hidden;
    color: var(--color-text-muted);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const OutsideTag = styled.span`
  flex-shrink: 0;
  padding: 3px 6px;
  border-radius: 999px;
  background: var(--color-secondary-200);
  color: var(--color-secondary-900);
  font-size: 10px;
  font-weight: 600;
`;

const RemoveSelection = styled(BaseButton)`
  min-width: 40px;
  min-height: 40px;
  flex-shrink: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
`;

const SelectionList = styled.div`
  display: grid;
  gap: 0;
`;

const BookLibrary = styled.section`
  margin-bottom: var(--space-8);
  padding-bottom: var(--space-7);
  border-bottom: 1px solid var(--color-neutral-300);
`;

const LibraryHeading = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);

  h3 {
    margin: 0;
    font-size: var(--font-size-300);
    font-weight: 700;
  }

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const LibraryStatus = styled.div`
  min-height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;

const BookList = styled.div`
  display: grid;
`;

const BookItem = styled(BaseButton)`
  width: 100%;
  min-height: 68px;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border: 0;
  border-bottom: 1px solid var(--color-neutral-300);
  background: transparent;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;

  > svg {
    flex-shrink: 0;
    color: var(--color-text-muted);
  }
`;

const BookGlyph = styled.span`
  width: 44px;
  height: 52px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 10px 6px 6px 10px;
  background: var(--color-brand-200);
  color: var(--color-brand-900);
`;

const BookCopy = styled.span`
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 3px;

  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-200);
    font-weight: 600;
  }

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const EntryButton = styled(BaseButton)`
  display: flex;
  align-items: center;
  text-align: left;
  gap: var(--space-3);
  min-height: 82px;
  padding: var(--space-2) 0;
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--color-neutral-300);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  transition: opacity 160ms ease;

  &:active {
    opacity: 0.72;
  }
`;

const Thumb = styled.span`
  width: 60px;
  height: 68px;
  flex-shrink: 0;
  border-radius: 14px;
  background: var(--color-brand-200);
  color: var(--color-brand-900);
  display: grid;
  place-items: center;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;
const EntryCopy = styled.span`
  display: grid;
  gap: 2px;
  flex: 1;
  min-width: 0;

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    line-height: 1.4;
  }

  strong {
    font-size: var(--font-size-200);
    font-weight: 600;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
`;

const CheckMark = styled.span<{ $selected: boolean }>`
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border: 1px solid
    ${({ $selected }) =>
      $selected ? "var(--color-brand-500)" : "var(--color-neutral-400)"};
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: ${({ $selected }) =>
    $selected ? "var(--color-brand-500)" : "transparent"};
  color: var(--color-white);
`;

const Field = styled.label`
  display: block;
  margin: var(--space-7) 0;
  color: var(--color-text);
  font-size: var(--font-size-200);
  font-weight: 600;

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    font-weight: 400;
  }

  input,
  textarea {
    display: block;
    width: 100%;
    margin-top: var(--space-3);
    border: 1px solid transparent;
    border-radius: 16px;
    padding: var(--space-4);
    background: var(--color-neutral-200);
    box-sizing: border-box;
    font-weight: 400;
    line-height: var(--line-height-body);

    &:focus-visible {
      border-color: var(--color-brand-500);
    }
  }

  textarea {
    resize: vertical;
  }
`;

const LetterEditor = styled.div`
  display: grid;
  gap: var(--space-3);
`;

const LetterPagePreview = styled.div`
  position: relative;
  width: min(72%, 270px);
  aspect-ratio: 148 / 210;
  margin: 0 auto var(--space-5);
  padding: 9.5% 9% 8%;
  border: 1px solid var(--color-neutral-300);
  border-radius: 12px;
  background: var(--color-white);
  box-sizing: border-box;
  color: var(--color-text);
`;

const LetterPageHeading = styled.p`
  margin: 0;
  font-size: 10px;
  font-weight: 500;
  line-height: 1.4;
`;

const LetterPageBody = styled.p<{ $placeholder: boolean }>`
  position: absolute;
  top: 45%;
  right: 9%;
  left: 20%;
  margin: 0;
  max-height: 43%;
  overflow: hidden;
  color: ${({ $placeholder }) =>
    $placeholder ? "var(--color-text-muted)" : "var(--color-text)"};
  font-size: 9px;
  font-weight: 400;
  line-height: 1.8;
  text-align: right;
  white-space: pre-line;
  transform: translateY(-50%);
  overflow-wrap: anywhere;
`;

const LetterPageNumber = styled.span`
  position: absolute;
  right: 9%;
  bottom: 6%;
  font-size: 9px;
  font-variant-numeric: tabular-nums;
`;

const CoverControls = styled.div`
  display: grid;
  gap: var(--space-4);
  margin-top: var(--space-4);
`;

const CoverControl = styled.div`
  display: grid;
  gap: var(--space-2);
`;

const CoverControlLabel = styled.span`
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  font-weight: 500;
`;

const CoverChoices = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
`;

const CoverChoiceButton = styled(BaseButton)<{ $active: boolean }>`
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: 0 var(--space-3);
  border: 1px solid
    ${({ $active }) =>
      $active ? "var(--color-brand-500)" : "var(--color-neutral-300)"};
  border-radius: 12px;
  background: ${({ $active }) =>
    $active ? "var(--color-brand-100)" : "var(--color-white)"};
  color: var(--color-text);
  font-size: var(--font-size-100);
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
`;

const ColorSwatch = styled.span<{ $color: string }>`
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  border: 1px solid var(--color-neutral-300);
  border-radius: 6px;
  background: ${({ $color }) => $color};
`;

const CoverPreview = styled.div<{ $background: string }>`
  position: relative;
  width: min(42%, 148px);
  aspect-ratio: 148 / 210;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  margin: var(--space-5) auto 0;
  padding: 14px 12px 10px;
  border: 1px solid var(--color-neutral-300);
  border-radius: 12px;
  background: ${({ $background }) => $background};
`;

const CoverOptionHeader = styled.span<{ $color: string }>`
  display: flex;
  justify-content: space-between;
  gap: 4px;
  color: ${({ $color }) => $color};
  font-size: 7px;
  font-weight: 500;
  line-height: 1.3;

  span:last-child {
    overflow: hidden;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const CoverOptionArtwork = styled.span<{ $placeholder: string }>`
  width: 72%;
  aspect-ratio: 1.25 / 1;
  align-self: center;
  overflow: hidden;
  border-radius: 5px;
  background: ${({ $placeholder }) => $placeholder};

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const CoverOptionWordmark = styled.span<{ $color: string }>`
  align-self: flex-end;
  color: ${({ $color }) => $color};
  font-size: 8px;
  font-weight: 600;
`;

const PhotoPicker = styled.div`
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-4);

  > span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const PhotoOptions = styled.div`
  display: flex;
  gap: var(--space-2);
  overflow-x: auto;
  padding: 2px;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const PhotoButton = styled(BaseButton)<{ $active: boolean }>`
  width: 58px;
  height: 58px;
  flex: 0 0 auto;
  overflow: hidden;
  padding: 0;
  border: 2px solid
    ${({ $active }) =>
      $active ? "var(--color-brand-500)" : "transparent"};
  border-radius: 12px;
  background: var(--color-neutral-200);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const CoverFallbackNote = styled.p`
  margin-top: var(--space-3);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  line-height: var(--line-height-body);
`;

const PreviewActions = styled.div`
  display: grid;
  gap: var(--space-2);

  button {
    width: 100%;
    font-size: var(--font-size-200);
  }
`;

const EditButton = styled(BaseButton)`
  min-height: 42px;
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
`;

const CompletedHeading = styled.div`
  margin: var(--space-2) 0 var(--space-7);

  h2 {
    margin: 0;
    font-size: var(--font-size-500);
    font-weight: 700;
    line-height: var(--line-height-heading);
    overflow-wrap: anywhere;
  }

  p {
    margin: var(--space-2) 0 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const DeleteButton = styled(BaseButton)`
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  margin: var(--space-7) auto 0;
  padding: var(--space-2) var(--space-4);
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  cursor: pointer;
`;

const Footer = styled.footer`
  display: grid;
  gap: var(--space-2);
  flex-shrink: 0;

  > button {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    font-size: var(--font-size-200);
  }
`;

const SaveStatus = styled.div`
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  text-align: center;
  min-height: var(--space-5);
`;
