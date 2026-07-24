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

type SeedJournalEntry = {
  id: string;
  title: string;
  content: string;
  image: string | null;
  crowd: "한적함" | "보통" | "활기참";
  placeName: string;
  difficulty: "가벼움" | "적당함" | "조금 힘듦";
  visitedAt: Date;
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

const journalEntries: SeedJournalEntry[] = [
  {
    id: "journal-2026-06-26",
    title: "바람이 오래 머물던 오후",
    content:
      "푸른 나무들이 우거진 곳에서 벗어난 듯 고요한 여유를 느낄 수 있는 곳으로, 시야를 가득 채우는 짙은 초록빛 덕분에 답답했던 마음을 환기하기에 가벼운 산책이 되었습니다. 나무 사이로 불어오던 바람과 한적한 길을 걷다 보니 온전히 나만의 시간에 집중하게 되는 매력적인 공간입니다.",
    image:
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80",
    crowd: "한적함",
    placeName: "작은 동네 공원",
    difficulty: "가벼움",
    visitedAt: new Date("2026-06-26T16:20:00+09:00"),
  },
  {
    id: "journal-2026-06-18",
    title: "천천히 걸었던 강변",
    content:
      "해가 조금씩 내려앉는 시간에 물가를 따라 천천히 걸었습니다. 서두르지 않아도 되는 길이라 복잡했던 생각이 물결을 따라 조금씩 느려졌고, 돌아오는 길에는 처음보다 가벼운 마음이 남았습니다.",
    image:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
    crowd: "보통",
    placeName: "강변 문화광장",
    difficulty: "적당함",
    visitedAt: new Date("2026-06-18T19:10:00+09:00"),
  },
  {
    id: "journal-2026-06-09",
    title: "조용한 창가 자리",
    content:
      "창가에 앉아 지나가는 사람들을 바라보며 따뜻한 차를 천천히 마셨습니다. 특별히 무언가를 하지 않아도 어색하지 않은 곳이어서, 말없이 머무는 것만으로도 충분했던 시간이었습니다.",
    image:
      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80",
    crowd: "한적함",
    placeName: "조용한 창가 카페",
    difficulty: "가벼움",
    visitedAt: new Date("2026-06-09T14:40:00+09:00"),
  },
  {
    id: "journal-2026-05-30",
    title: "목적지 없이 이어진 길",
    content:
      "돌아갈 시간을 정하지 않은 채 오래된 골목과 시장 사이를 걸었습니다. 사람들의 목소리와 가게 앞의 작은 풍경이 계속 이어져서, 목적지가 없어도 발걸음이 자연스럽게 다음 길을 찾아갔습니다.",
    image:
      "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=80",
    crowd: "활기참",
    placeName: "오래된 시장 산책",
    difficulty: "조금 힘듦",
    visitedAt: new Date("2026-05-30T17:30:00+09:00"),
  },
  {
    id: "journal-2026-05-21",
    title: "나무 사이의 작은 쉼",
    content:
      "숲 안쪽의 작은 쉼터에 앉아 한동안 나뭇잎이 흔들리는 소리를 들었습니다. 도시의 소리가 멀어진 자리에서는 다른 생각을 애써 정리하지 않아도 괜찮았고, 잠깐의 고요만으로도 충분히 쉬어갈 수 있었습니다.",
    image:
      "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=80",
    crowd: "한적함",
    placeName: "숲속 작은 쉼터",
    difficulty: "적당함",
    visitedAt: new Date("2026-05-21T12:50:00+09:00"),
  },
  {
    id: "journal-2026-05-12",
    title: "강바람에 잠시 멈춘 날",
    content:
      "강변 벤치에 앉아 지나가는 자전거와 물결을 한참 바라봤습니다. 오래 걷지 않았는데도 시야가 멀어지니 답답했던 마음에 작은 틈이 생겼고, 바람이 잦아들 때쯤 천천히 집으로 돌아왔습니다.",
    image:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
    crowd: "한적함",
    placeName: "강변의 조용한 벤치",
    difficulty: "가벼움",
    visitedAt: new Date("2026-05-12T18:10:00+09:00"),
  },
  {
    id: "journal-2026-05-03",
    title: "사람들 사이에서 찾은 온기",
    content:
      "열린 광장을 천천히 가로지르며 오가는 사람들의 표정과 소리를 바라봤습니다. 혼자 걷고 있었지만 주변의 가벼운 활기가 부담스럽지 않았고, 잠깐 섞여 있는 것만으로도 기분이 환기되는 시간이었습니다.",
    image:
      "https://images.unsplash.com/photo-1494522358652-f30e61a60313?auto=format&fit=crop&w=1200&q=80",
    crowd: "활기참",
    placeName: "동네 열린 광장",
    difficulty: "가벼움",
    visitedAt: new Date("2026-05-03T15:20:00+09:00"),
  },
  {
    id: "journal-2026-04-24",
    title: "익숙한 길을 느리게",
    content:
      "늘 빠르게 지나치던 산책길을 오늘은 목적 없이 천천히 걸었습니다. 익숙한 나무와 모퉁이도 속도를 낮추니 다르게 보였고, 짧은 거리였지만 하루의 리듬을 다시 맞추기에 충분했습니다.",
    image:
      "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=1200&q=80",
    crowd: "보통",
    placeName: "짧은 산책길",
    difficulty: "적당함",
    visitedAt: new Date("2026-04-24T17:45:00+09:00"),
  },
  {
    id: "journal-2026-04-13",
    title: "창밖 풍경이 길어진 오후",
    content:
      "기차에 올라 평소보다 조금 먼 곳까지 다녀왔습니다. 계획을 빽빽하게 세우지 않고 창밖으로 바뀌는 풍경을 바라보니 이동하는 시간 자체가 쉼처럼 느껴졌고, 돌아오는 길에도 여유가 남았습니다.",
    image:
      "https://images.unsplash.com/photo-1474487548417-781cb71495f3?auto=format&fit=crop&w=1200&q=80",
    crowd: "보통",
    placeName: "기차로 닿는 바깥",
    difficulty: "조금 힘듦",
    visitedAt: new Date("2026-04-13T13:30:00+09:00"),
  },
  {
    id: "journal-2026-04-02",
    title: "비 온 뒤의 작은 공원",
    content:
      "비가 그친 뒤 가까운 공원에 들렀습니다. 젖은 흙 냄새와 선명해진 잎의 색을 따라 천천히 한 바퀴 돌았고, 멀리 가지 않아도 공기가 달라졌다는 사실만으로 충분히 기분 좋은 저녁이었습니다.",
    image:
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80",
    crowd: "한적함",
    placeName: "작은 동네 공원",
    difficulty: "가벼움",
    visitedAt: new Date("2026-04-02T18:35:00+09:00"),
  },
];

validateSeedCoverage(places);
validateJournalSeed(journalEntries);

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

for (const journalEntry of journalEntries) {
  await prisma.journalEntry.upsert({
    where: { id: journalEntry.id },
    update: journalEntry,
    create: journalEntry,
  });
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

function validateJournalSeed(seedEntries: SeedJournalEntry[]) {
  const ids = new Set(seedEntries.map((entry) => entry.id));

  if (seedEntries.length !== 10) {
    throw new Error("Journal seed must contain exactly 10 entries.");
  }

  if (ids.size !== seedEntries.length) {
    throw new Error("Seed journal entry IDs must be unique.");
  }
}
