import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type MovementLevel } from "../src/generated/prisma/client";
import type { AirAnswer } from "../src/shared/tuti/types";

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
  crowd: "낮음" | "보통" | "높음";
  today: string;
  fatigue: number;
  movementLevel: MovementLevel;
  moodTags: Array<AirAnswer | "solitude">;
  latitude: string;
  longitude: string;
};

const places: SeedPlace[] = [
  {
    id: "river-bench",
    name: "강변의 조용한 벤치",
    phrase: "시야만 조금 멀어져도 괜찮은 날",
    note: "오래 머물지 않아도 바람이 잠깐 머리를 식혀줘요.",
    image:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
    travelTime: "약 18분",
    crowd: "낮음",
    today: "지금 가능",
    fatigue: 22,
    movementLevel: "near",
    moodTags: ["open", "quiet", "solitude"],
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
    crowd: "보통",
    today: "지금 가능",
    fatigue: 18,
    movementLevel: "near",
    moodTags: ["walk"],
    latitude: "37.544380",
    longitude: "127.037450",
  },
  {
    id: "neighborhood-plaza",
    name: "동네 열린 광장",
    phrase: "사람들 사이의 가벼운 온기가 필요한 날",
    note: "잠깐 서 있어도 주변의 움직임이 기분을 환기해줘요.",
    image:
      "https://images.unsplash.com/photo-1494522358652-f30e61a60313?auto=format&fit=crop&w=1200&q=80",
    travelTime: "약 15분",
    crowd: "높음",
    today: "지금 가능",
    fatigue: 26,
    movementLevel: "near",
    moodTags: ["open"],
    latitude: "37.566200",
    longitude: "126.977900",
  },
  {
    id: "quiet-cafe",
    name: "조용한 창가 카페",
    phrase: "말하지 않고 머물러도 자연스러운 곳",
    note: "말하지 않고 앉아 있어도 되는 분위기예요.",
    image:
      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80",
    travelTime: "약 24분",
    crowd: "보통",
    today: "오후 가능",
    fatigue: 34,
    movementLevel: "short",
    moodTags: ["quiet", "solitude"],
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
    moodTags: ["walk", "quiet", "solitude"],
    latitude: "37.549720",
    longitude: "126.914350",
  },
  {
    id: "wide-river",
    name: "강변 문화광장",
    phrase: "탁 트인 곳에서 일상의 활기를 만나는 시간",
    note: "넓은 시야와 오가는 사람들의 움직임이 함께 있는 곳이에요.",
    image:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
    travelTime: "약 38분",
    crowd: "높음",
    today: "저녁까지 가능",
    fatigue: 46,
    movementLevel: "short",
    moodTags: ["open"],
    latitude: "37.526340",
    longitude: "126.933270",
  },
  {
    id: "forest-retreat",
    name: "숲속 작은 쉼터",
    phrase: "조용한 공기 속에 오래 머물고 싶은 날",
    note: "나무 사이의 소리만 들으며 혼자만의 속도로 쉬어갈 수 있어요.",
    image:
      "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=80",
    travelTime: "약 1시간 10분",
    crowd: "낮음",
    today: "해 지기 전 가능",
    fatigue: 58,
    movementLevel: "half",
    moodTags: ["quiet", "solitude"],
    latitude: "37.659000",
    longitude: "126.977000",
  },
  {
    id: "rail-trip",
    name: "기차로 닿는 바깥",
    phrase: "조금 멀어져 넓은 풍경을 보고 싶은 날",
    note: "계획은 짧게 두고 창밖의 시야만 길게 열어둬도 충분해요.",
    image:
      "https://images.unsplash.com/photo-1474487548417-781cb71495f3?auto=format&fit=crop&w=1200&q=80",
    travelTime: "약 1시간 40분",
    crowd: "보통",
    today: "반나절 가능",
    fatigue: 67,
    movementLevel: "half",
    moodTags: ["open"],
    latitude: "37.263600",
    longitude: "127.028600",
  },
  {
    id: "market-walk",
    name: "오래된 시장 산책",
    phrase: "생동감 있는 골목을 천천히 걷는 시간",
    note: "목적지를 정하지 않아도 사람 냄새 나는 길이 자연스럽게 이어져요.",
    image:
      "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=80",
    travelTime: "약 1시간 20분",
    crowd: "높음",
    today: "저녁까지 가능",
    fatigue: 64,
    movementLevel: "half",
    moodTags: ["walk"],
    latitude: "37.570000",
    longitude: "126.999000",
  },
];

validateSeedCoverage(places);

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

function validateSeedCoverage(seedPlaces: SeedPlace[]) {
  const ids = new Set(seedPlaces.map((place) => place.id));

  if (ids.size !== seedPlaces.length) {
    throw new Error("Seed place IDs must be unique.");
  }

  const movementLevels: MovementLevel[] = ["near", "short", "half"];
  const airTags: AirAnswer[] = ["quiet", "open", "walk"];
  const crowdLevels: SeedPlace["crowd"][] = ["낮음", "보통", "높음"];

  for (const movementLevel of movementLevels) {
    for (const airTag of airTags) {
      const hasCombination = seedPlaces.some(
        (place) =>
          place.movementLevel === movementLevel &&
          place.moodTags.includes(airTag),
      );

      if (!hasCombination) {
        throw new Error(
          `Missing seed combination: ${movementLevel} + ${airTag}`,
        );
      }
    }
  }

  for (const crowdLevel of crowdLevels) {
    if (!seedPlaces.some((place) => place.crowd === crowdLevel)) {
      throw new Error(`Missing seed crowd level: ${crowdLevel}`);
    }
  }
}
