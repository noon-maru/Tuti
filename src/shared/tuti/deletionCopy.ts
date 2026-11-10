/** Original deletion and removing a link have deliberately different consequences. */
export function madiDeletionMessage(sensitive = false) {
  return sensitive
    ? "이 마디와 사진, 이 마디를 포함한 서버 하루마디를 함께 삭제할까요? 민감정보 처리 동의도 철회돼요. 이미 내려받은 사본은 직접 정리해주세요."
    : "원본 마디와 사진을 삭제할까요?\n이 마디가 담긴 모든 하루마디(함께 채우기 포함)에서도 빠져요. 이미 저장한 PDF는 바뀌지 않아요. 삭제한 마디는 되돌릴 수 없어요.";
}
export function harumadiDeletionMessage(shared = false) {
  return `하루마디 틀을 삭제할까요? 이 작업은 되돌릴 수 없어요.\n${shared ? "함께 채우는 모든 사람의 책장에서 이 하루마디가 사라지고, 초대와 공유 댓글도 삭제돼요.\n" : ""}담았던 각자의 원본 마디와 이미 저장한 PDF는 남아요.`;
}
