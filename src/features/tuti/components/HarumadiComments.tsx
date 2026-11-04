"use client";
import { confirmAction } from "@/lib/feedback";
import { useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import styled from "@emotion/styled";
import { PrimaryButton, TextButton } from "./buttons";
import { HarumadiSafetyActions } from "./HarumadiSafetyActions";
import { fetchComments, togetherRequest } from "@/lib/harumadiTogether";
import { HARUMADI_COMMENT_LIMIT, type HarumadiComment } from "@/shared/api/harumadiTogether";
import { screenTitleStyles, bodyCopyStyles, captionStyles, inputControlStyles } from "@/shared/ui/typography";

type Props = { owner: string; bookId: string; onExit: () => void };
export function HarumadiComments(props: Props) {
  return <Section><h1>댓글·답글</h1><p>이 하루마디를 함께 채우는 사람들에게만 보여요.<br />댓글은 PDF에 담기지 않아요.</p><Thread {...props} parentId={null} /></Section>;
}
function Thread({ owner, bookId, parentId, onExit, canCompose = true }: Props & { parentId: string | null; canCompose?: boolean }) {
  const client = useQueryClient();
  const query = useInfiniteQuery({ queryKey: ["harumadi-comments", owner, bookId, parentId], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchComments(owner, bookId, parentId, pageParam), getNextPageParam: page => page.nextCursor ?? undefined, retry: false, refetchInterval: 20_000 });
  const [edit, setEdit] = useState<HarumadiComment | null>(null), [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: ["harumadi-comments", owner, bookId] });
  if (query.isPending) return <p role="status">댓글을 불러오고 있어요.</p>;
  if (query.isError) return <p role="alert">{query.error.message}<TextButton onClick={() => void query.refetch()}>다시 불러오기</TextButton></p>;
  const remove = async (comment: HarumadiComment) => {
    if (deleting || !(await confirmAction("댓글을 삭제할까요? 다른 사람이 쓴 답글은 남아요.", {"title":"삭제 전 확인","confirmLabel":"삭제하기","tone":"danger"}))) return;
    setDeleting(comment.id); setMessage("");
    try { await togetherRequest(owner, bookId, `comments?commentId=${encodeURIComponent(comment.id)}`, { method: "DELETE" }); await refresh(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "댓글을 삭제하지 못했어요."); }
    finally { setDeleting(null); }
  };
  return <>
    <List aria-label={parentId ? "답글" : "댓글"}>{query.data.pages.flatMap(page => page.comments).map(comment => <li key={comment.id}>
      {comment.deleted ? <p className="deleted">삭제된 댓글이에요.</p> : <><Header><strong>{comment.authorName}</strong><small>{new Date(comment.createdAt).toLocaleDateString("ko-KR")}{comment.revision > 1 ? " · 수정됨" : ""}</small></Header><Body>{comment.body}</Body>
        <Controls>{comment.canEdit && <TextButton disabled={Boolean(deleting)} onClick={() => setEdit(comment)}>수정</TextButton>}{comment.canDelete && <TextButton disabled={Boolean(deleting)} onClick={() => void remove(comment)}>삭제</TextButton>}
          {comment.authorId && <HarumadiSafetyActions owner={owner} bookId={bookId} targetId={comment.id} authorId={comment.authorId} kind="comment" onBlocked={onExit} />}
        </Controls></>}
      {!parentId && (!comment.deleted || comment.replyCount > 0) && <><TextButton onClick={() => setExpanded(current => current === comment.id ? null : comment.id)}>{expanded === comment.id ? "답글 접기" : comment.deleted ? `답글 ${comment.replyCount}개 보기` : `답글 ${comment.replyCount ? `${comment.replyCount}개` : "남기기"}`}</TextButton>{expanded === comment.id && <Replies><Thread owner={owner} bookId={bookId} parentId={comment.id} onExit={onExit} canCompose={!comment.deleted} /></Replies>}</>}
    </li>)}</List>
    {query.hasNextPage && <TextButton disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>이전 댓글 더 보기</TextButton>}
    {!query.data.pages[0]?.comments.length && <p>{parentId ? "아직 남긴 답글이 없어요." : "아직 남긴 댓글이 없어요."}</p>}
    {(canCompose || edit) && <Composer key={edit?.id ?? "new"} owner={owner} bookId={bookId} parentId={parentId} edit={edit} onDone={() => { setEdit(null); void refresh(); }} onCancel={() => setEdit(null)} />}
    {message && <p role="alert">{message}</p>}
  </>;
}
function Composer({ owner, bookId, parentId, edit, onDone, onCancel }: Omit<Props, "onExit"> & { parentId: string | null; edit: HarumadiComment | null; onDone: () => void; onCancel: () => void }) {
  const [body, setBody] = useState(edit?.body ?? ""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const saving = useRef(false), identity = useRef<{ body: string; id: string } | null>(null);
  const submit = async () => {
    if (saving.current || !body.trim()) return;
    saving.current = true; setBusy(true); setError("");
    if (identity.current?.body !== body) identity.current = { body, id: crypto.randomUUID() };
    try {
      await togetherRequest(owner, bookId, "comments", { method: edit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body, parentId, ...(edit ? { commentId: edit.id, revision: edit.revision } : { requestId: identity.current.id }) }) });
      setBody(""); identity.current = null; onDone();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "댓글을 남기지 못했어요. 다시 시도해주세요."); }
    finally { saving.current = false; setBusy(false); }
  };
  return <form onSubmit={event => { event.preventDefault(); void submit(); }}><label>{edit ? "댓글 수정" : parentId ? "답글 남기기" : "댓글 남기기"}<Input value={body} disabled={busy} maxLength={HARUMADI_COMMENT_LIMIT} rows={3} onChange={event => setBody(event.target.value)} placeholder="함께한 하루에 한마디를 더해보세요." /></label><small>건강·정치적 견해 등 민감정보는 남기지 말아주세요.</small><PrimaryButton type="submit" disabled={busy || !body.trim()}>{busy ? "남기고 있어요…" : edit ? "수정하기" : parentId ? "답글 남기기" : "댓글 남기기"}</PrimaryButton>{edit && <TextButton disabled={busy} onClick={onCancel}>수정 취소</TextButton>}{error && <p role="alert">{error}</p>}</form>;
}
const Section = styled.section`padding: 4px 0 24px; h1 { ${screenTitleStyles} margin-bottom: 12px; } p { ${bodyCopyStyles} } form { display: grid; gap: 12px; padding: 16px 0; } form label { font-size: var(--ui-body-size); } form small { ${captionStyles} }`;
const List = styled.ul`list-style: none; padding: 0; margin: 20px 0; > li { padding: 16px 0; border-bottom: 1px solid var(--color-border); } .deleted { color: var(--color-text-muted); }`;
const Header = styled.div`display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; strong { min-width: 0; overflow-wrap: anywhere; font-size: var(--ui-body-size); font-weight: 600; } small { ${captionStyles} }`;
const Body = styled.p`white-space: pre-wrap; margin: 10px 0;`;
const Controls = styled.div`display: flex; flex-wrap: wrap; align-items: flex-start; > button { font-size: 12px; min-height: 44px; padding: 4px 8px; }`;
const Replies = styled.div`padding-inline-start: 16px; border-inline-start: 1px solid var(--color-brand-200);`;
const Input = styled.textarea`${inputControlStyles} margin-top: 10px; resize: vertical;`;
