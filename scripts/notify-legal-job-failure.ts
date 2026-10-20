export {};

try {
  if (process.argv.length > 2) throw new Error("인자를 지원하지 않습니다.");
  const address = process.env.LEGAL_RIGHTS_ALERT_WEBHOOK_URL?.trim();
  if (!address) throw new Error("운영 알림 미설정");
  const url = new URL(address);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("허용되지 않은 주소");
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Tuti 개인정보·권리 보호 예약 작업에 실패했어요. NAS의 실패한 작업과 운영 로그를 확인해주세요." }),
    signal: AbortSignal.timeout(5000), redirect: "error" });
  if (!response.ok) throw new Error("알림 전달 실패");
  console.log("개인정보·권리 보호 예약 작업 실패 알림을 전달했습니다.");
} catch {
  console.error("예약 작업 실패 알림을 전달하지 못했습니다. NAS 시스템 로그와 알림 설정을 확인해주세요.");
  process.exitCode = 1;
}
