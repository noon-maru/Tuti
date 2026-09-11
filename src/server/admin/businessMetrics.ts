import type {
  AdminBusinessMetricCohort,
  AdminBusinessMetricDay,
  AdminBusinessMetricsResponse,
} from "@/shared/api/admin";

const DAY_MS = 24 * 60 * 60 * 1_000;
const PLATFORM_ORDER = ["web", "android", "ios"] as const;

type MetricUser = {
  id: string;
  createdAt: Date;
  authenticated: boolean;
};

type SessionEvent = {
  userId: string;
  platform: (typeof PLATFORM_ORDER)[number];
  createdAt: Date;
};

type ProductEvent = {
  userId: string;
  action: string;
  createdAt: Date;
};

type RecommendationSignal = {
  userId: string;
  createdAt: Date;
};

type RecommendationActionSignal = RecommendationSignal & {
  action: string;
};

export type BusinessMetricInput = {
  now: Date;
  periodDays: 30 | 90;
  trackingStartedAt: Date | null;
  users: MetricUser[];
  sessions: SessionEvent[];
  firstSessions: Array<{ userId: string; createdAt: Date }>;
  productEvents: ProductEvent[];
  recommendationRuns: RecommendationSignal[];
  recommendationActions: RecommendationActionSignal[];
};

export function calculateBusinessMetrics(
  input: BusinessMetricInput,
): AdminBusinessMetricsResponse {
  const today = toKoreanDay(input.now);
  const periodStart = today - input.periodDays + 1;
  const mauStart = today - 29;
  const wauStart = today - 6;
  const userById = new Map(input.users.map((user) => [user.id, user]));
  const firstDayByUser = new Map(
    input.firstSessions.map((event) => [
      event.userId,
      toKoreanDay(event.createdAt),
    ]),
  );
  const activityDays = new Map<string, Set<number>>();
  const latestMauPlatform = new Map<
    string,
    { platform: SessionEvent["platform"]; createdAt: Date }
  >();

  for (const session of input.sessions) {
    const day = toKoreanDay(session.createdAt);
    const days = activityDays.get(session.userId) ?? new Set<number>();
    days.add(day);
    activityDays.set(session.userId, days);
    if (day < mauStart || day > today) continue;
    const current = latestMauPlatform.get(session.userId);
    if (!current || current.createdAt < session.createdAt) {
      latestMauPlatform.set(session.userId, {
        platform: session.platform,
        createdAt: session.createdAt,
      });
    }
  }

  const activeInRange = usersActiveBetween(activityDays, periodStart, today);
  const dau = usersActiveBetween(activityDays, today, today);
  const wau = usersActiveBetween(activityDays, wauStart, today);
  const mau = usersActiveBetween(activityDays, mauStart, today);
  const returningMau = new Set(
    [...mau].filter((userId) =>
      countDaysBetween(activityDays.get(userId), mauStart, today, 2),
    ),
  );
  const newUsers30d = input.users.filter((user) => {
    const day = toKoreanDay(user.createdAt);
    return day >= mauStart && day <= today;
  }).length;
  const authenticatedMau = [...mau].filter(
    (userId) => userById.get(userId)?.authenticated,
  ).length;

  const stageSignals = buildStageSignals(input, periodStart, today);
  const stages = [
    { key: "active" as const, label: "활성 사용자", signal: activeInRange },
    { key: "intake" as const, label: "상태 입력 완료", signal: stageSignals.intake },
    { key: "recommended" as const, label: "추천 확인", signal: stageSignals.recommended },
    { key: "selected" as const, label: "장소 선택", signal: stageSignals.selected },
    { key: "departure" as const, label: "출발 준비", signal: stageSignals.departure },
    { key: "navigation" as const, label: "길찾기 시작", signal: stageSignals.navigation },
    { key: "converted" as const, label: "방문 확인·기록", signal: stageSignals.converted },
  ];
  let previous = new Set(activeInRange);
  const serializedStages = stages.map((stage, index) => {
    const users =
      index === 0
        ? new Set(activeInRange)
        : new Set([...previous].filter((userId) => stage.signal.has(userId)));
    const result = {
      key: stage.key,
      label: stage.label,
      users: users.size,
      rateFromActive: percentage(users.size, activeInRange.size),
      rateFromPrevious: percentage(users.size, previous.size),
    };
    previous = users;
    return result;
  });

  return {
    generatedAt: input.now.toISOString(),
    trackingStartedAt: input.trackingStartedAt?.toISOString() ?? null,
    periodDays: input.periodDays,
    audience: {
      dau: dau.size,
      wau: wau.size,
      mau: mau.size,
      dauMauRate: percentage(dau.size, mau.size),
      newUsers30d,
      returningUsers30d: returningMau.size,
      returnRate30d: percentage(returningMau.size, mau.size),
      authenticatedMau,
      authenticatedMauRate: percentage(authenticatedMau, mau.size),
    },
    stages: serializedStages,
    daily: buildDaily(input, activityDays, firstDayByUser, periodStart, today),
    cohorts: buildCohorts(input, activityDays, firstDayByUser, today),
    platforms: PLATFORM_ORDER.map((platform) => {
      const users = [...latestMauPlatform.values()].filter(
        (value) => value.platform === platform,
      ).length;
      return {
        platform,
        users,
        rate: percentage(users, mau.size),
      };
    }),
  };
}

function buildStageSignals(
  input: BusinessMetricInput,
  start: number,
  end: number,
) {
  const within = (date: Date) => {
    const day = toKoreanDay(date);
    return day >= start && day <= end;
  };
  const product = (action: string) =>
    new Set(
      input.productEvents
        .filter((event) => event.action === action && within(event.createdAt))
        .map((event) => event.userId),
    );
  const actions = (...names: string[]) =>
    new Set(
      input.recommendationActions
        .filter(
          (event) => names.includes(event.action) && within(event.createdAt),
        )
        .map((event) => event.userId),
    );

  return {
    intake: product("entry_completed"),
    recommended: new Set(
      input.recommendationRuns
        .filter((event) => within(event.createdAt))
        .map((event) => event.userId),
    ),
    selected: actions("place_selected"),
    departure: actions("departure_peek_opened", "departure_plan_expanded"),
    navigation: actions("navigation_started"),
    converted: actions("return_confirmed", "journal_created"),
  };
}

function buildDaily(
  input: BusinessMetricInput,
  activityDays: Map<string, Set<number>>,
  firstDayByUser: Map<string, number>,
  start: number,
  end: number,
) {
  const usersCreatedByDay = new Map<number, number>();
  for (const user of input.users) {
    const day = toKoreanDay(user.createdAt);
    usersCreatedByDay.set(day, (usersCreatedByDay.get(day) ?? 0) + 1);
  }
  const rows: AdminBusinessMetricDay[] = [];
  for (let day = start; day <= end; day += 1) {
    const active = [...activityDays].filter(([, days]) => days.has(day));
    rows.push({
      date: dayToDateKey(day),
      activeUsers: active.length,
      newUsers: usersCreatedByDay.get(day) ?? 0,
      returningUsers: active.filter(
        ([userId]) => (firstDayByUser.get(userId) ?? day) < day,
      ).length,
    });
  }
  return rows;
}

function buildCohorts(
  input: BusinessMetricInput,
  activityDays: Map<string, Set<number>>,
  firstDayByUser: Map<string, number>,
  today: number,
) {
  const currentWeek = startOfWeek(today);
  const trackingWeek = input.trackingStartedAt
    ? startOfWeek(toKoreanDay(input.trackingStartedAt))
    : currentWeek;
  const rows: AdminBusinessMetricCohort[] = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const cohortStart = currentWeek - offset * 7;
    if (cohortStart < trackingWeek) continue;
    const cohortUsers = [...firstDayByUser]
      .filter(([, firstDay]) =>
        firstDay >= cohortStart && firstDay < cohortStart + 7,
      )
      .map(([userId]) => userId);
    const retention = Array.from({ length: 5 }, (_, week) => {
      if (cohortUsers.length === 0) return null;
      if (week === 0) return 100;
      const weekStart = cohortStart + week * 7;
      if (today < weekStart + 6) return null;
      const returned = cohortUsers.filter((userId) =>
        [...(activityDays.get(userId) ?? [])].some(
          (day) => day >= weekStart && day < weekStart + 7,
        ),
      ).length;
      return percentage(returned, cohortUsers.length);
    });
    rows.push({
      cohortWeek: dayToDateKey(cohortStart),
      newUsers: cohortUsers.length,
      retention,
    });
  }
  return rows;
}

function usersActiveBetween(
  activityDays: Map<string, Set<number>>,
  start: number,
  end: number,
) {
  return new Set(
    [...activityDays]
      .filter(([, days]) => [...days].some((day) => day >= start && day <= end))
      .map(([userId]) => userId),
  );
}

function countDaysBetween(
  days: Set<number> | undefined,
  start: number,
  end: number,
  minimum: number,
) {
  if (!days) return false;
  let count = 0;
  for (const day of days) {
    if (day >= start && day <= end && ++count >= minimum) return true;
  }
  return false;
}

function percentage(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 1_000) / 10 : 0;
}

function toKoreanDay(value: Date) {
  const key = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
  const [year, month, day] = key.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function dayToDateKey(day: number) {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function startOfWeek(day: number) {
  const weekday = (day + 4) % 7;
  return day - ((weekday + 6) % 7);
}
