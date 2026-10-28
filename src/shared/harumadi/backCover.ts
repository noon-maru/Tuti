/** 기존 하루마디와 이미 작성 중이던 PDF의 마무리는 바꾸지 않는다. */
export const LEGACY_HARUMADI_BACK_COVER_TEXT = "오늘 가능한 만큼만,";
export const HARUMADI_BACK_COVER_TEXT_LIMIT = 120;
export const HARUMADI_BACK_COVER_MESSAGES = [
  "지나간 하루를, 곁에 두는 일.",
  "작은 하루도, 오래 남을 이야기.",
  "평범해서 더 오래 기억하고 싶은 날들.",
  "내가 좋아한 순간들을, 여기에.",
  "오늘의 나를, 한 장 남겨둡니다.",
  "잠시 멈춰 보니, 남기고 싶은 하루였어요.",
  "돌아보면, 이런 날들이 나를 채웠어요.",
  "여기까지, 나의 한 마디.",
  "함께한 하루가, 우리의 이야기가 되도록.",
  "함께 웃었던 순간을, 오래 곁에.",
  "여기까지, 우리의 한 마디.",
  "다음 이야기는, 또 어떤 하루일까요.",
] as const;

/** 생성 시 한 번만 저장한다. 읽기·PDF 렌더링에서는 무작위 선택을 하지 않는다. */
export function pickHarumadiBackCoverText(current?: string, random = Math.random): string {
  const choices = HARUMADI_BACK_COVER_MESSAGES.filter(message => message !== current);
  const index = Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)));
  return choices[index];
}

export function isHarumadiBackCoverText(value: unknown): value is string {
  return typeof value === "string" && value.length <= HARUMADI_BACK_COVER_TEXT_LIMIT &&
    value.split(/\r\n|\r|\n/).length <= 3 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}
