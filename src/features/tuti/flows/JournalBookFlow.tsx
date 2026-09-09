"use client";

import styled from "@emotion/styled";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  ChevronLeft,
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
import { PrimaryButton } from "@/features/tuti/components/buttons";
import { JournalBookPreview } from "@/features/tuti/components/JournalBookPreview";
import {
  loadJournalBookDraft,
  saveJournalBookDraft,
  removeJournalBookDraft,
} from "@/lib/journalBookDraft";
import {
  emptyJournalBookDraft,
  journalBookDate,
  parseJournalBookInput,
  JOURNAL_BOOK_MAX_ENTRIES,
  JOURNAL_BOOK_TITLE_LIMIT,
  JOURNAL_BOOK_LETTER_LIMIT,
  type JournalBookDraft,
} from "@/shared/api/journalBook";
import { LoadingIndicator } from "@/features/tuti/components/LoadingIndicator";
import { exportJournalBookPdf } from "@/lib/journalBookExport";
import type { StoredJournalBook } from "@/shared/api/journalBook";

const BOOK_STEPS = [
  { value: "selection", label: "기록 고르기" },
  { value: "details", label: "표지와 글" },
  { value: "preview", label: "미리보기" },
] as const;

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
  const [previewPdf, setPreviewPdf] = useState<{
    bytes: Uint8Array;
    pageCount: number;
  } | null>(null);
  const [completing, setCompleting] = useState(false);
  const [openedBook, setOpenedBook] = useState<StoredJournalBook | null>(null);
  const latestSave = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

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

  const handlePreviewReady = useCallback(
    (result: { bytes: Uint8Array; pageCount: number } | null) =>
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
    if (step === "selection") void refetch();
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
    update({
      ...draft,
      entryIds,
      coverEntryId: entryIds.includes(draft.coverEntryId ?? "")
        ? draft.coverEntryId
        : null,
    });
  }

  const back = () => {
    if (!draft || draft.step === "selection") router.replace("/journal");
    else changeStep(draft.step === "preview" ? "details" : "selection");
  };

  async function completeBook() {
    if (!input || !previewPdf || completing) return;
    setCompleting(true);
    setMessage("");
    try {
      const book = await createJournalBook(input, previewPdf.pageCount);
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
        <IconButton
          type="button"
          onClick={back}
          aria-label={
            draft?.step === "selection" ? "기록으로 돌아가기" : "이전 단계"
          }
        >
          <ChevronLeft size={24} aria-hidden="true" />
        </IconButton>
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
            <StepGuide aria-label={`제작 단계 ${stepIndex + 1}/3`}>
              <StepLabel>
                <span>{stepIndex + 1}/3</span>
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
                    : "한 권으로 모인 시간"}
              </h2>
              <Intro>
                {draft.step === "selection"
                  ? "간직하고 싶은 기록만 골라주세요. 날짜순으로 차분히 엮어드릴게요."
                  : draft.step === "details"
                    ? "제목만 정해도 좋아요. 남기고 싶은 말은 천천히 적어주세요."
                    : "글과 사진이 잘 담겼는지 살펴보세요."}
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
                    <SelectionSummary>
                      <strong>{draft.entryIds.length}개 선택</strong>
                      <span>한 권에 최대 {JOURNAL_BOOK_MAX_ENTRIES}개</span>
                    </SelectionSummary>
                    <SelectionList>
                      {sorted
                        .filter(
                          (entry) =>
                            (!draft.fromDate ||
                              journalBookDate(entry.visitedAt) >=
                                draft.fromDate) &&
                            (!draft.toDate ||
                              journalBookDate(entry.visitedAt) <= draft.toDate),
                        )
                        .map((entry) => (
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
                    {!sorted.some(
                      (entry) =>
                        (!draft.fromDate ||
                          journalBookDate(entry.visitedAt) >= draft.fromDate) &&
                        (!draft.toDate ||
                          journalBookDate(entry.visitedAt) <= draft.toDate),
                    ) && (
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
                  <legend>표지 사진</legend>
                  <Hint>고른 기록의 사진을 사용할 수 있어요.</Hint>
                  <Covers>
                    <CoverButton
                      type="button"
                      $active={draft.coverEntryId === null}
                      aria-pressed={draft.coverEntryId === null}
                      onClick={() => update({ ...draft, coverEntryId: null })}
                    >
                      글로만
                      <br />
                      담기
                    </CoverButton>
                    {chosen
                      .filter((entry) => entry.image)
                      .map((entry) => (
                        <CoverButton
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
                            height={92}
                            unoptimized
                            loading="lazy"
                          />
                        </CoverButton>
                      ))}
                  </Covers>
                </fieldset>
                <Field>
                  첫 장에 남기는 글 <span>선택</span>
                  <textarea
                    rows={6}
                    maxLength={JOURNAL_BOOK_LETTER_LIMIT}
                    value={draft.letter}
                    onChange={(event) =>
                      update({ ...draft, letter: event.target.value })
                    }
                    placeholder="나에게 남기는 말이나, 함께한 사람에게 전하고 싶은 말을 적어보세요."
                  />
                </Field>
                <Hint>
                  선택한 {chosen.length}개의 기록을 날짜순으로 담아요. 원래
                  기록은 바뀌지 않아요.
                </Hint>
              </>
            )}

            {draft.step === "preview" && (
              <>
                <Hint>
                  일부 이모지는 □로 표시될 수 있어요. 사진은 전체가 보이도록
                  배치해요.
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
              선택한 {chosen.length}개로 계속하기
            </PrimaryButton>
          ) : draft.step === "details" ? (
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
                onClick={() => changeStep("details")}
              >
                표지와 글 수정하기
              </EditButton>
              <PrimaryButton
                disabled={!input || !previewPdf || completing}
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
  } | null>(null);
  const [busy, setBusy] = useState<"download" | "delete" | null>(null);
  const [message, setMessage] = useState("");
  const handleReady = useCallback(
    (result: { bytes: Uint8Array; pageCount: number } | null) => setPdf(result),
    [],
  );

  async function download() {
    if (!pdf || busy) return;
    setBusy("download");
    setMessage("");
    try {
      await exportJournalBookPdf(pdf.bytes, book.title);
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
        <IconButton
          type="button"
          onClick={onBack}
          aria-label="기록집 목록으로 돌아가기"
        >
          <ChevronLeft size={24} aria-hidden="true" />
        </IconButton>
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

const SmallButton = styled.button`
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  min-height: 44px;
  padding: var(--space-2);
  cursor: pointer;
  font-size: var(--font-size-100);
`;

const IconButton = styled(SmallButton)`
  width: var(--space-11);
  height: var(--space-11);
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 50%;
  color: var(--color-text-muted);
  transition: color 160ms ease, transform 160ms ease;

  &:hover {
    color: var(--color-text);
  }

  &:active {
    transform: translateX(-2px);
  }
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
  grid-template-columns: repeat(3, 1fr);
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

const BookItem = styled.button`
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

const EntryButton = styled.button`
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

const Covers = styled.div`
  display: flex;
  gap: var(--space-3);
  overflow-x: auto;
  padding: var(--space-2) 2px;
`;

const CoverButton = styled.button<{ $active: boolean }>`
  width: 76px;
  height: 98px;
  flex-shrink: 0;
  padding: 0;
  border: 2px solid
    ${({ $active }) =>
      $active ? "var(--color-brand-500)" : "transparent"};
  border-radius: 14px;
  background: var(--color-brand-200);
  color: var(--color-brand-900);
  font-size: var(--font-size-100);
  font-weight: 500;
  cursor: pointer;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const PreviewActions = styled.div`
  display: grid;
  gap: var(--space-2);

  button {
    width: 100%;
    font-size: var(--font-size-200);
  }
`;

const EditButton = styled.button`
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

const DeleteButton = styled.button`
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
