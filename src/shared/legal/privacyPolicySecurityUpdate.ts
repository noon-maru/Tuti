import { upcomingPrivacyPolicy } from "@/shared/legal/privacyPolicyUpdate";

export const PRIVACY_SECURITY_UPDATE_NOTICE_ID = "privacy-security-2026-10-10";
export const PRIVACY_SECURITY_UPDATE_PUBLISHED_AT = "2026년 9월 10일";
export const PRIVACY_SECURITY_UPDATE_EFFECTIVE_AT = "2026년 10월 10일";
export const PRIVACY_SECURITY_UPDATE_PATH = "/legal/privacy/2026-10-10";

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
] = upcomingPrivacyPolicy.sections;

export const upcomingPrivacySecurityPolicy = {
  title: "Tuti 개인정보 처리방침 개정안",
  effectiveDate: PRIVACY_SECURITY_UPDATE_EFFECTIVE_AT,
  summary:
    "비정상 접근과 공격으로부터 서비스를 보호하기 위해 원본 네트워크 정보 대신 가명처리된 보안 식별정보를 처리하는 내용을 추가합니다.",
  sections: [
    {
      ...purpose,
      paragraphs: [
        ...purpose.paragraphs,
        "회사는 비정상 접근 탐지, 공격 방어, 요청 제한, 보안 사고 조사와 서비스 안정성 확보를 위해 최소한의 네트워크 보안 식별정보와 요청 기록을 처리합니다.",
      ],
    },
    {
      ...items,
      paragraphs: [
        ...items.paragraphs,
        "서비스 접속 시 자동 생성되는 보안정보: IP 주소와 정규화된 User-Agent를 각각 또는 함께 서버에서 즉시 HMAC 처리한 가명 식별값, 일부를 가린 네트워크 대역, 브라우저·운영체제 또는 자동화 도구의 요약 유형, 요청 경로 범주·메서드·시각·횟수, 위험 신호·요청 제한·차단 여부. 원본 IP 주소와 전체 User-Agent 문자열은 데이터베이스에 저장하지 않습니다.",
      ],
    },
    {
      ...retention,
      paragraphs: [
        ...retention.paragraphs,
        "트래픽 관측 기록과 가명처리된 보안 식별정보는 생성일로부터 90일간 보관한 뒤 자동 파기합니다. 차단 규칙은 차단이 유지되는 동안 보관하며, 해제되거나 만료된 규칙과 관리자 조치 기록은 오남용 방지와 보안 감사 목적으로 90일간 보관한 뒤 파기합니다.",
      ],
    },
    provision,
    processors,
    destruction,
    {
      ...rights,
      paragraphs: [
        ...rights.paragraphs,
        "서비스 보안 정책에 따른 이용 제한에 이의가 있는 경우 1:1 문의 또는 admin@tuti.today로 검토를 요청할 수 있습니다. 회사는 차단 범위와 근거를 확인하여 오탐으로 판단하면 제한을 해제합니다.",
      ],
    },
    {
      ...safeguards,
      paragraphs: [
        ...safeguards.paragraphs,
        "네트워크 보안 식별값은 별도의 비밀키를 이용한 HMAC으로 생성하고 관리자만 접근할 수 있도록 통제합니다. 관리자의 차단·해제 행위는 감사 기록으로 남기며, 자동 차단은 충분한 검증 전까지 사용하지 않습니다.",
      ],
    },
    officer,
    changes,
  ],
  appendix: [
    `개정안 공개일: ${PRIVACY_SECURITY_UPDATE_PUBLISHED_AT}`,
    `시행 예정일: ${PRIVACY_SECURITY_UPDATE_EFFECTIVE_AT}`,
    "개인정보 처리방침 개정안 버전: 2026-10-10",
    "2026년 10월 1일 개정 내용은 예정대로 시행되며, 보안 식별정보의 신규 처리는 2026년 10월 10일부터 시작합니다.",
  ],
} as const;

export const privacyPolicyFrom20261010 = {
  ...upcomingPrivacySecurityPolicy,
  title: "Tuti 개인정보 처리방침",
  summary:
    "눈마루는 Tuti 제공과 서비스 보호에 필요한 정보만 처리하며, 원본 위치 좌표·IP 주소·전체 User-Agent를 계정이나 보안 기록에 장기 저장하지 않습니다.",
  appendix: [
    "시행일: 2026년 10월 10일",
    "개인정보 처리방침 버전: 2026-10-10",
  ],
} as const;
