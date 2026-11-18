export type AdminTab = "overview" | "business" | "activity" | "security" | "notifications" | "funnel" | "logs" | "location" | "places" | "reports" | "inquiries" | "users" | "admins" | "settings";
export const tabs: Array<{ id: AdminTab; label: string }> = [
  { id: "overview", label: "운영 홈" }, { id: "business", label: "제품 성과" },
  { id: "activity", label: "사용자 활동" }, { id: "security", label: "트래픽·보안" },
  { id: "notifications", label: "알림 전달" }, { id: "funnel", label: "나들이 연결" },
  { id: "logs", label: "시스템 로그" }, { id: "location", label: "위치정보 감사" },
  { id: "places", label: "장소 검토" }, { id: "reports", label: "신고" },
  { id: "inquiries", label: "문의" }, { id: "users", label: "사용자 계정" },
  { id: "admins", label: "관리자" }, { id: "settings", label: "운영 설정" },
];
export const navigationGroups = [
  { label: "운영 홈", ids: ["overview"], links: [] },
  { label: "제품 성과", ids: ["business", "funnel"], links: [] },
  { label: "사용자 지원", ids: ["users", "activity", "inquiries", "reports"], links: [{ href: "/admin/journal-rights", label: "권리 요청" }] },
  { label: "나들이 품질", ids: ["places"], links: [{ href: "/admin/outing-quality", label: "품질·지역별 후보" }, { href: "/admin/recommendation-simulator", label: "추천 시뮬레이터" }] },
  { label: "시스템·데이터", ids: ["security", "notifications", "logs", "location"], links: [{ href: "/admin/tourism-data", label: "원천 데이터·수집" }] },
  { label: "운영 설정", ids: ["admins", "settings"], links: [] },
].map(group => ({ label: group.label, items: group.ids.map(id => tabs.find(tab => tab.id === id)!), links: group.links }));
export const mobilePrimaryTabs = tabs.filter(tab => ["overview", "business", "inquiries", "reports"].includes(tab.id));
export const mobileMoreTabs = tabs.filter(tab => !mobilePrimaryTabs.some(primary => primary.id === tab.id));
