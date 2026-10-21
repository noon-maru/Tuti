import { createHash } from "node:crypto";
import { parseServiceTermsDocument } from "../../shared/legal/serviceTerms";

// 최종 승인·공고가 아닌 검토용 원문 생성. 공개 메모를 무차별 삭제하지 않는다.
export function prepareServiceTermsReview(markdown: string) {
  const parts = markdown.replaceAll("\r\n", "\n").split(/^## /m);
  if (!parts[0].startsWith("# Tuti 서비스 이용약관 초안\n") || parts.length !== 24 ||
      !parts[23].startsWith("검토 메모 — 공고 원문 제외\n")) throw new Error("TERMS_SOURCE_STRUCTURE_CHANGED");
  const sections = parts.slice(1, 23).map((part, index) => {
    const newline = part.indexOf("\n");
    const title = part.slice(0, newline).trim();
    if (index < 21 ? !title.startsWith(`제${index + 1}조 `) : title !== "부칙") throw new Error("TERMS_ARTICLE_ORDER_CHANGED");
    const paragraphs = part.slice(newline + 1).trim().split(/\n\s*\n/).map(paragraph =>
      paragraph.split("\n").map(line => line.trim()).join(paragraph.startsWith("- ") ? "\n" : " "));
    return { title, paragraphs };
  });
  const document = parseServiceTermsDocument({
    title: "Tuti 서비스 이용약관",
    summary: "작은 외출을 발견하고, 함께한 순간을 기록하여 소장하는 Tuti의 이용 범위와 계정·기록 관리, 공개·신고 절차 및 책임의 기준을 안내합니다.",
    importantTerms: [
      "기록의 저작권은 이용자 또는 정당한 권리자에게 남습니다. 회사는 서비스 제공·보호에 필요한 범위에서만 이용하며, 광고나 AI 모델 학습 권한은 포함하지 않습니다.",
      "추천·이동시간·장소 정보는 참고정보입니다. 회사의 귀책이나 법정 책임까지 일괄 면제하지 않습니다.",
      "익명 계정은 앱 삭제·기기 변경·저장소 초기화 때 접근을 잃을 수 있습니다. 작성 중인 기록집 편집본과 서버에 저장된 완성본은 다릅니다.",
      "비공개 기록도 지원·장애·권리 침해·보안 대응에 필요한 범위에서 권한 있는 관리자가 접근할 수 있습니다. 개인정보 처리방침의 목적과 통제를 따릅니다.",
      "본인의 민감정보 저장과 위치정보 이용, 기록 공개 및 국외 이전에 필요한 동의는 일반 이용약관 동의와 구분합니다.",
      "만 14세 미만의 개인정보 처리가 필요한 기능은 적법한 보호자 동의·확인 절차를 갖추기 전까지 제공하지 않습니다.",
      "디지털 기록집은 현재 무료이며, 실물 제작·배송은 아직 제공하지 않습니다. 무료 이용만으로 자동 결제되지 않습니다.",
      "기존 가입·로그인·위치 동의를 새 일반약관 동의로 소급하지 않습니다. 동의를 거부해도 기존 자료 열람·지원되는 내보내기·삭제와 권리 행사 경로는 유지합니다.",
    ],
    sections,
  });
  const documentHash = createHash("sha256").update(JSON.stringify(document)).digest("hex");
  return {
    scope: "review-only-not-a-published-release" as const,
    sourceMarkdownSha256: createHash("sha256").update(markdown).digest("hex"),
    documentHash, document, articleCount: sections.length,
    noticeDays: 30,
    approved: false, published: false,
    scopeLimit: "일반약관 검토 후보만 생성. 개인정보·위치약관·공개 정책 승인·이전 동의·실기기 검증이나 법률 적정성 승인이 아님",
  };
}
