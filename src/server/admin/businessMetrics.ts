import type {
  AdminBusinessMetricCohort,
  AdminBusinessMetricDay,
  AdminBusinessMetricsResponse,
} from "@/shared/api/admin";

const DAY_MS = 24 * 60 * 60 * 1_000;
const PLATFORM_ORDER = ["web", "android", "ios"] as const;
const ACTION_CONVERSION_EVENTS = new Set([
  "departure_plan_expanded",
  "navigation_started",
  "return_confirmed",
  "journal_created",
]);

type MetricUser = {
  id: string;
  createdAt: Date;
  authenticated: boolean;
  authenticatedAt: Date | null;
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
  });
  const newAuthenticatedUsers30d = input.users.filter((user) => {
    if (!user.authenticatedAt) return false;
    const day = toKoreanDay(user.authenticatedAt);
    return day >= mauStart && day <= today;
  }).length;
  const authenticatedNewUsers30d = newUsers30d.filter(
    (user) => user.authenticatedAt !== null,
  ).length;
  const authenticatedMau = [...mau].filter(
    (userId) => userById.get(userId)?.authenticated,
  ).length;
  const monthlyActionSignals = usersWithActionsBetween(
    input.recommendationActions,
    mauStart,
    today,
  );
  const monthlyActionUsers = new Set(
    [...monthlyActionSignals].filter((userId) => mau.has(userId)),
  );
  const monthlyRecommendationRuns = input.recommendationRuns.filter(
    (run) => {
      const day = toKoreanDay(run.createdAt);
      return day >= mauStart && day <= today && mau.has(run.userId);
    },
  );
  const recommendationCountByUser = countSignalsByUser(
    monthlyRecommendationRuns,
  );
  const repeatRecommendationUsers30d = [...recommendationCountByUser.values()]
    .filter((count) => count >= 2).length;
  const firstRecommendationByUser = new Map<string, Date>();
  for (const run of input.recommendationRuns) {
    const user = userById.get(run.userId);
    if (!user || run.createdAt < user.createdAt) continue;
    const current = firstRecommendationByUser.get(run.userId);
    if (!current || run.createdAt < current) {
      firstRecommendationByUser.set(run.userId, run.createdAt);
    }
  }
  const firstRecommendationDurations = newUsers30d.flatMap((user) => {
    const firstRecommendation = firstRecommendationByUser.get(user.id);
    return firstRecommendation
      ? [(firstRecommendation.getTime() - user.createdAt.getTime()) / 60_000]
      : [];
  });
  const firstRecommendationUsers30d = firstRecommendationDurations.length;
  const previousEnd = periodStart - 1;
  const previousStart = periodStart - input.periodDays;
  const previousActive = usersActiveBetween(
    activityDays,
    previousStart,
    previousEnd,
  );
  const currentNewUsers = countUsersCreatedBetween(
    input.users,
    periodStart,
    today,
  );
  const previousNewUsers = countUsersCreatedBetween(
    input.users,
    previousStart,
    previousEnd,
  );
  const currentAuthenticatedUsers = countUsersAuthenticatedBetween(
    input.users,
    periodStart,
    today,
  );
  const previousAuthenticatedUsers = countUsersAuthenticatedBetween(
    input.users,
    previousStart,
    previousEnd,
  );
  const currentActionUsers = usersWithActionsBetween(
    input.recommendationActions,
    periodStart,
    today,
  );
  const previousActionUsers = usersWithActionsBetween(
    input.recommendationActions,
    previousStart,
    previousEnd,
  );

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
      newUsers30d: newUsers30d.length,
      newAuthenticatedUsers30d,
      newUserAuthenticationRate30d: percentage(
        authenticatedNewUsers30d,
        newUsers30d.length,
      ),
      returningUsers30d: returningMau.size,
      returnRate30d: percentage(returningMau.size, mau.size),
      authenticatedMau,
      authenticatedMauRate: percentage(authenticatedMau, mau.size),
    },
    northStar: {
      monthlyActionUsers: monthlyActionUsers.size,
      monthlyActionUserRate: percentage(monthlyActionUsers.size, mau.size),
    },
    activation: {
      firstRecommendationUsers30d,
      firstRecommendationRate30d: percentage(
        firstRecommendationUsers30d,
        newUsers30d.length,
      ),
      medianMinutesToFirstRecommendation: median(
        firstRecommendationDurations,
      ),
    },
    engagement: {
      averageActiveDaysPerMau: average(
        [...mau].map(
          (userId) =>
            [...(activityDays.get(userId) ?? [])].filter(
              (day) => day >= mauStart && day <= today,
            ).length,
        ),
      ),
      averageRecommendationsPerMau: ratio(
        monthlyRecommendationRuns.length,
        mau.size,
      ),
      repeatRecommendationUsers30d,
      repeatRecommendationRate30d: percentage(
        repeatRecommendationUsers30d,
        mau.size,
      ),
    },
    comparison: [
      comparisonItem("active", "활성 사용자", activeInRange.size, previousActive.size),
      comparisonItem("new", "신규 사용자", currentNewUsers, previousNewUsers),
      comparisonItem(
        "authenticated",
        "신규 로그인",
        currentAuthenticatedUsers,
        previousAuthenticatedUsers,
      ),
      comparisonItem(
        "action",
        "행동전환 사용자",
        currentActionUsers.size,
        previousActionUsers.size,
      ),
    ],
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
  const usersAuthenticatedByDay = new Map<number, number>();
  for (const user of input.users) {
    const day = toKoreanDay(user.createdAt);
    usersCreatedByDay.set(day, (usersCreatedByDay.get(day) ?? 0) + 1);
    if (user.authenticatedAt) {
      const authenticatedDay = toKoreanDay(user.authenticatedAt);
      usersAuthenticatedByDay.set(
        authenticatedDay,
        (usersAuthenticatedByDay.get(authenticatedDay) ?? 0) + 1,
      );
    }
  }
  const rows: AdminBusinessMetricDay[] = [];
  for (let day = start; day <= end; day += 1) {
    const active = [...activityDays].filter(([, days]) => days.has(day));
    rows.push({
      date: dayToDateKey(day),
      activeUsers: active.length,
      newUsers: usersCreatedByDay.get(day) ?? 0,
      newAuthenticatedUsers: usersAuthenticatedByDay.get(day) ?? 0,
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

function usersWithActionsBetween(
  actions: RecommendationActionSignal[],
  start: number,
  end: number,
) {
  return new Set(
    actions
      .filter((action) => {
        const day = toKoreanDay(action.createdAt);
        return (
          ACTION_CONVERSION_EVENTS.has(action.action) &&
          day >= start &&
          day <= end
        );
      })
      .map((action) => action.userId),
  );
}

function countSignalsByUser(signals: RecommendationSignal[]) {
  const counts = new Map<string, number>();
  for (const signal of signals) {
    counts.set(signal.userId, (counts.get(signal.userId) ?? 0) + 1);
  }
  return counts;
}

function countUsersCreatedBetween(
  users: MetricUser[],
  start: number,
  end: number,
) {
  return users.filter((user) => {
    const day = toKoreanDay(user.createdAt);
    return day >= start && day <= end;
  }).length;
}

function countUsersAuthenticatedBetween(
  users: MetricUser[],
  start: number,
  end: number,
) {
  return users.filter((user) => {
    if (!user.authenticatedAt) return false;
    const day = toKoreanDay(user.authenticatedAt);
    return day >= start && day <= end;
  }).length;
}

function comparisonItem(
  key: AdminBusinessMetricsResponse["comparison"][number]["key"],
  label: string,
  current: number,
  previous: number,
) {
  return {
    key,
    label,
    current,
    previous,
    changeRate: changeRate(current, previous),
  };
}

function changeRate(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return roundOne(((current - previous) / previous) * 100);
}

function average(values: number[]) {
  return values.length > 0
    ? roundOne(values.reduce((sum, value) => sum + value, 0) / values.length)
    : 0;
}

function ratio(value: number, total: number) {
  return total > 0 ? roundOne(value / total) : 0;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  return roundOne(value);
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
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
