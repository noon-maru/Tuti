export type TutiJournalEntry = {
  /** 작성 응답의 실제 연결 결과. 목록·수정 응답에서는 생략한다. */
  savedHarumadi?: { id: string; title: string } | null;
  version?: string;
  authorId?: string;
  authorName?: string;
  id: string;
  sensitiveContent?: boolean | null;
  sensitiveConsentVersion?: string | null;
  sensitiveWithdrawnAt?: string | null;
  title: string;
  content: string;
  image: string | null;
  placeId: string | null;
  placeName: string;
  visitedAt: string;
  publicationStatus: "private" | "pending" | "published" | "hidden";
  publication: JournalPublication | null;
};

export type JournalPublication = {
  publicId: string;
  publishedAt: string;
};

export type JournalEntryInput = Pick<
  TutiJournalEntry,
  "content" | "image" | "placeName" | "title"
> & {
  expectedVersion?: string;
  requestId?: string;
  harumadiId?: string;
  placeId?: string | null;
  visitedAt?: string;
  sensitiveContent?: boolean;
  sensitiveConsentVersion?: string;
};

export type JournalEntriesResponse = {
  entries: TutiJournalEntry[];
};

export type JournalEntryResponse = {
  entry: TutiJournalEntry;
};

export type DeleteJournalEntryResponse = {
  entryId: string;
};

export type JournalPublicationResponse = {
  entry: TutiJournalEntry;
};

export type JournalShareTraceIssue = {
  traceId: string;
  shortCode: string;
  issuedAt: string;
};

export type JournalShareTraceIssueResponse = {
  trace: JournalShareTraceIssue;
};

export type JournalShareTraceFinalization =
  JournalShareTraceIssue & {
    imageSha256: string;
    signature: string;
    finalizedAt: string;
  };

export type JournalShareTraceFinalizationResponse = {
  trace: JournalShareTraceFinalization;
};

export type PublicJournalEntry = Omit<
  TutiJournalEntry,
  "id" | "placeId" | "publication" | "publicationStatus"
> & {
  publicId: string;
  publishedAt: string;
};

export type PublicJournalEntryResponse = {
  entry: PublicJournalEntry;
};

export type JournalAuthorBlockItem = {
  blockedUserId: string;
  createdAt: string;
};

export type JournalAuthorBlocksResponse = {
  blocks: JournalAuthorBlockItem[];
};
