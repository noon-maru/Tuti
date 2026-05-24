import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type MovementLevel } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the database.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

type SeedPlace = {
  id: string;
  name: string;
  phrase: string;
  note: string;
  image: string;
  travelTime: string;
  crowd: string;
  today: string;
  fatigue: number;
  movementLevel: MovementLevel;
  moodTags: string[];
  latitude: string;
  longitude: string;
};

const places: SeedPlace[] = [
  {
    id: "river-bench",
    name: "물가 옆 벤치",
    phrase: "생각 조금 비우기 좋은 공기",
    note: "오래 머물지 않아도 괜찮은 자리예요.",
    image:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
    travelTime: "약 18분",
    crowd: "낮음",
    today: "지금 가능",
    fatigue: 22,
    movementLevel: "near",
    moodTags: ["water", "quiet", "alone"],
    latitude: "37.529540",
    longitude: "126.932940",
  },
  {
    id: "small-park",
    name: "작은 동네 공원",
    phrase: "오늘은 이 정도 거리면 충분할지도",
    note: "걸음이 길지 않아도 바깥으로 나왔다는 느낌이 남아요.",
    image:
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80",
    travelTime: "약 12분",
    crowd: "낮음",
    today: "지금 가능",
    fatigue: 18,
    movementLevel: "near",
    moodTags: ["walk", "quiet", "alone"],
    latitude: "37.544380",
    longitude: "127.037450",
  },
  {
    id: "quiet-cafe",
    name: "조용한 창가 카페",
    phrase: "혼자 있어도 어색하지 않은 곳",
    note: "말하지 않고 앉아 있어도 되는 분위기예요.",
    image:
      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80",
    travelTime: "약 24분",
    crowd: "보통",
    today: "오후 가능",
    fatigue: 34,
    movementLevel: "short",
    moodTags: ["quiet", "alone"],
    latitude: "37.555850",
    longitude: "126.923720",
  },
  {
    id: "slow-walk",
    name: "짧은 산책길",
    phrase: "같은 공기만 아니면 되는 날",
    note: "목적지보다 돌아오는 길이 더 가벼울 수 있어요.",
    image:
      "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=1200&q=80",
    travelTime: "약 30분",
    crowd: "낮음",
    today: "지금 가능",
    fatigue: 39,
    movementLevel: "short",
    moodTags: ["walk", "quiet"],
    latitude: "37.549720",
    longitude: "126.914350",
  },
  {
    id: "wide-river",
    name: "넓은 강변",
    phrase: "눈앞이 조금 넓어지는 곳",
    note: "멀리 보이는 물결만 봐도 하루가 살짝 바뀌어요.",
    image:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
    travelTime: "약 45분",
    crowd: "보통",
    today: "반나절 가능",
    fatigue: 48,
    movementLevel: "short",
    moodTags: ["water", "open"],
    latitude: "37.526340",
    longitude: "126.933270",
  },
  {
    id: "rail-trip",
    name: "기차로 닿는 바깥",
    phrase: "조금 더 멀어져도 괜찮은 날",
    note: "계획은 짧게, 창밖은 길게 두면 충분해요.",
    image:
      "https://images.unsplash.com/photo-1474487548417-781cb71495f3?auto=format&fit=crop&w=1200&q=80",
    travelTime: "약 1시간 40분",
    crowd: "보통",
    today: "반나절 가능",
    fatigue: 67,
    movementLevel: "half",
    moodTags: ["open", "quiet"],
    latitude: "37.554680",
    longitude: "126.970610",
  },
];

for (const place of places) {
  await prisma.place.upsert({
    where: { id: place.id },
    update: place,
    create: place,
  });

  await prisma.$executeRaw`
    UPDATE "places"
    SET "location" = ST_SetSRID(
      ST_MakePoint(${Number(place.longitude)}, ${Number(place.latitude)}),
      4326
    )
    WHERE "id" = ${place.id}
  `;
}

await prisma.$disconnect();
