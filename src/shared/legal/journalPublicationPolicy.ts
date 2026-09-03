export const JOURNAL_PUBLICATION_POLICY_VERSION =
  "journal-publication-2026-10-01";
export const JOURNAL_PUBLICATION_POLICY_EFFECTIVE_AT =
  "2026-10-01T00:00:00+09:00";

export function isJournalPublicationPolicyEffective(
  now: Date = new Date(),
) {
  return (
    now.getTime() >=
    new Date(JOURNAL_PUBLICATION_POLICY_EFFECTIVE_AT).getTime()
  );
}

export function isCurrentJournalPublicationPolicy(
  version: unknown,
) {
  return version === JOURNAL_PUBLICATION_POLICY_VERSION;
}

export const journalPublicationPolicy = {
  title: "Tuti 기록 공개 운영정책",
  effectiveDate: "2026년 10월 1일",
  summary:
    "지난 공간의 기록은 기본적으로 나만 볼 수 있습니다. 이용자가 직접 인터넷 공개를 선택한 기록만 링크를 받은 사람에게 보여줍니다.",
  sections: [
    {
      title: "1. 기록 공개의 범위",
      paragraphs: [
        "인터넷 공개를 선택하면 링크를 받은 사람은 Tuti에서 기록의 장소, 방문일, 제목, 본문, 사진과 태그를 볼 수 있습니다. 이름, 이메일, 계정 식별값과 사진의 원본 위치정보는 공개하지 않습니다.",
        "초기 운영 단계에서는 공개 기록을 검색엔진에 노출하지 않습니다. 다만 링크를 받은 사람이 다른 사람에게 다시 전달하거나 화면을 저장할 수 있으므로, 공개하면 곤란한 내용은 기록에 포함하지 않아야 합니다.",
      ],
    },
    {
      title: "2. 공개할 수 없는 내용",
      paragraphs: [
        "다른 사람의 동의 없는 개인정보·초상, 불법 또는 유해한 내용, 성적·폭력적 표현, 혐오·괴롭힘, 반복 광고·스팸, 타인의 저작권을 침해하는 글과 이미지는 공개할 수 없습니다.",
        "전화번호, 이메일, 외부 연락 링크처럼 개인 간 직접 접촉을 유도하는 정보도 공개 기록에 포함하지 않아야 합니다. 공개 이후 신고 또는 운영 확인을 통해 정책 위반이 확인되면 노출이 중지될 수 있습니다.",
      ],
    },
    {
      title: "3. 공개와 관리자 조치",
      paragraphs: [
        "이용자가 공개 범위와 주의사항을 확인하고 동의하면 기록은 별도의 관리자 사전 확인 없이 공개됩니다. 공개 전 일률적인 내용 심사는 진행하지 않습니다.",
        "신고되거나 정책을 위반한 기록은 확인 후 즉시 숨기거나 삭제할 수 있습니다. 반복되거나 중대한 위반이 확인되면 기존 공개 기록을 숨기고 추가 공개를 제한할 수 있습니다. 공개 노출을 중지하더라도 비공개 원본은 별도로 판단해 처리합니다.",
      ],
    },
    {
      title: "4. 신고와 차단",
      paragraphs: [
        "공개 기록을 본 이용자는 개인정보 침해, 부적절한 내용, 저작권 침해, 스팸 등의 사유로 신고할 수 있습니다. 또한 작성자를 차단하면 해당 작성자의 공개 기록을 더 이상 볼 수 없습니다.",
        "관리자는 신고 내용과 기록을 확인해 숨김, 복원, 삭제 또는 작성자 공개 제한 조치를 하고 처리 이력을 남깁니다.",
      ],
    },
    {
      title: "5. 공개 중지와 이의 제기",
      paragraphs: [
        "작성자는 언제든 인터넷 공개를 중지할 수 있습니다. 공개를 중지하면 기존 링크와 이미지 접근은 즉시 차단되며, 다시 공개할 때는 새로운 링크가 만들어집니다.",
        "숨김·삭제·제한 조치에 관한 문의나 이의 제기는 admin@tuti.today 또는 앱의 1:1 문의로 접수할 수 있습니다. 긴급한 개인정보 침해 신고도 같은 경로로 알려주세요.",
      ],
    },
  ],
  appendix: [
    "운영주체: 눈마루 · Tuti",
    "문의 및 신고: admin@tuti.today · 010-2724-4307",
    `정책 버전: ${JOURNAL_PUBLICATION_POLICY_VERSION}`,
  ],
} as const;
