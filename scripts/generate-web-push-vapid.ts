import webPush from "web-push";

if (process.argv.slice(2).join(" ") !== "--generate") {
  console.info("새 키를 생성하려면 --generate를 붙이세요. 출력에는 비밀 키가 포함되므로 공유하지 마세요. 기존 키를 교체하면 브라우저 재등록이 필요합니다.");
} else {
  const keys = webPush.generateVAPIDKeys();
  console.info(`WEB_PUSH_VAPID_PUBLIC_KEY=${keys.publicKey}\nWEB_PUSH_VAPID_PRIVATE_KEY=${keys.privateKey}`);
}
