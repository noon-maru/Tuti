import { prisma } from "../src/server/db/prisma";
import { syncSeoulRealtimeAreas } from "../src/server/seoul/syncSeoulRealtimeAreas";

try {
  const result = await syncSeoulRealtimeAreas();
  console.log(
    `서울 실시간 영역 ${result.areaCount}개와 장소 연결 ${result.linkedPlaceCount}개를 동기화했습니다.`,
  );
} finally {
  await prisma.$disconnect();
}
