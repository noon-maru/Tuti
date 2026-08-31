import { privacyPolicy } from "@/shared/legal/privacyPolicy";

export const PRIVACY_POLICY_UPDATE_NOTICE_ID = "privacy-2026-10-01";
export const PRIVACY_POLICY_UPDATE_PUBLISHED_AT = "2026년 8월 31일";
export const PRIVACY_POLICY_UPDATE_EFFECTIVE_AT = "2026년 10월 1일";
export const PRIVACY_POLICY_UPDATE_PATH = "/legal/privacy/2026-10-01";

const [
  purpose,
  items,
  retention,
  provision,
  processors,
  destruction,
  rights,
  safeguards,
  officer,
  changes,
] = privacyPolicy.sections;

export const upcomingPrivacyPolicy = {
  title: "Tuti 개인정보 처리방침 개정안",
  effectiveDate: PRIVACY_POLICY_UPDATE_EFFECTIVE_AT,
  summary:
    "문의 답변처럼 사용자가 기다리는 서비스 알림을 전달하기 위해 Android 푸시 알림 처리 내용을 추가합니다. 광고성·홍보성 알림에는 사용하지 않습니다.",
  sections: [
    {
      ...purpose,
      paragraphs: [
        ...purpose.paragraphs,
        "이용자가 문의 답변 알림을 직접 켠 경우, 회사는 이용자가 남긴 1:1 문의의 답변 도착 사실을 알리기 위해 푸시 알림 정보를 처리합니다. 알림 제목과 본문에는 문의 제목·본문·답변 내용 등 이용자가 작성한 내용을 포함하지 않습니다.",
      ],
    },
    {
      ...items,
      paragraphs: [
        ...items.paragraphs,
        "Android 문의 답변 알림 이용 시: 무작위 앱 설치 식별값, Firebase Cloud Messaging 등록 토큰 및 Firebase 설치 식별값, 플랫폼, 앱 버전, 단말 언어, 알림 활성화·갱신·무효화 시각. 알림 선택 시 사용할 앱 내부 이동 경로가 함께 전달될 수 있습니다.",
      ],
    },
    {
      ...retention,
      paragraphs: [
        ...retention.paragraphs,
        "회사가 보관하는 앱 설치 식별값과 푸시 등록 토큰은 이용자가 문의 답변 알림을 끄거나 계정과 데이터를 삭제한 때 또는 토큰이 무효화된 때까지 보관한 뒤 삭제합니다. Firebase 설치 식별값은 Google의 삭제 처리 정책에 따라 삭제 API 호출 후 실시간·백업 시스템에서 제거되기까지 최대 180일이 걸릴 수 있습니다.",
      ],
    },
    provision,
    {
      ...processors,
      title: "5. 처리업무의 위탁·국외 이전과 외부 서비스",
      paragraphs: [
        ...processors.paragraphs,
        "회사는 Android 문의 답변 알림 발송 업무를 Google LLC의 Firebase Cloud Messaging에 위탁합니다. 알림을 켜거나 토큰을 갱신하는 때와 회사가 답변 도착 알림을 발송하는 때, 푸시 등록 토큰, 일반화된 알림 제목·본문과 앱 내부 이동 경로가 TLS로 암호화된 네트워크를 통해 전달됩니다. 문의 식별값·제목·본문·답변 내용은 전달하지 않습니다.",
        "해당 정보는 Google LLC(1600 Amphitheatre Parkway, Mountain View, CA 94043, USA)와 Google 또는 재수탁자가 시설을 운영하는 미국 등 국가에서 알림 전달과 서비스 보안·운영을 위해 처리될 수 있습니다. Google 개인정보 문의는 https://firebase.google.com/support/privacy/dpo 에서 할 수 있으며, 데이터 처리 조건과 처리 국가·재수탁자 최신 목록은 https://firebase.google.com/terms/data-processing-terms 및 https://firebase.google.com/terms/subprocessors 에서 확인할 수 있습니다.",
        "회사가 보관하는 토큰은 알림 해제·계정 삭제·토큰 무효화 시까지 처리하며, Google의 Firebase 설치 식별값은 삭제 요청 후 백업을 포함한 시스템에서 제거되기까지 최대 180일이 걸릴 수 있습니다. 이용자는 문의 답변 알림을 켜지 않거나 언제든 앱 설정에서 끌 수 있으며, 국외 처리를 거부하더라도 앱 안에서 문의 답변을 직접 확인할 수 있습니다.",
      ],
    },
    destruction,
    {
      ...rights,
      paragraphs: [
        ...rights.paragraphs,
        "문의 답변 알림은 Android 앱의 ‘알림 설정’에서 직접 켜고 끌 수 있습니다. 알림을 끄면 회사 서버의 해당 설치 연결과 FCM 등록을 즉시 해제하며, 운영체제 설정에서도 Tuti 알림 권한을 별도로 철회할 수 있습니다.",
      ],
    },
    {
      ...safeguards,
      paragraphs: [
        ...safeguards.paragraphs,
        "푸시 서비스 계정 키는 앱과 소스 저장소에 포함하지 않고 서버의 비공개 영역에서 접근 권한을 제한해 관리합니다. 전송 실패 로그에는 푸시 토큰과 서비스 계정 원문을 기록하지 않습니다.",
      ],
    },
    officer,
    changes,
  ],
  appendix: [
    `개정안 공개일: ${PRIVACY_POLICY_UPDATE_PUBLISHED_AT}`,
    `시행 예정일: ${PRIVACY_POLICY_UPDATE_EFFECTIVE_AT}`,
    "개인정보 처리방침 개정안 버전: 2026-10-01",
    "시행 전까지는 2026-08-21 버전의 개인정보 처리방침이 적용됩니다.",
  ],
} as const;
