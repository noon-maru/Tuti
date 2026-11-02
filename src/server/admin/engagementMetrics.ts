import { Prisma } from "@/generated/prisma/client";
import { analyticsPeriod } from "./analyticsScope";
import type { EngagementMetrics } from "@/shared/api/engagementMetrics";

export function engagementMetricsSql(period: ReturnType<typeof analyticsPeriod>) {
  return Prisma.sql`
    WITH p AS (SELECT ${period.start}::timestamp AS since, ${period.end}::timestamp AS until,
      (${period.end}::timestamp+interval '9 hours')::date AS today),
    eligible AS (SELECT id FROM users WHERE role='user' AND analytics_excluded_at IS NULL),
    e AS (SELECT l.* FROM lifecycle_events l JOIN eligible u ON u.id=l.user_id,p
      WHERE l.occurred_at<p.until AND l.retention_until>p.until),
    current_events AS (SELECT e.* FROM e,p WHERE occurred_at>=p.since),
    legacy AS (SELECT a.* FROM product_activity_events a JOIN eligible u ON u.id=a.user_id,p
      WHERE a.created_at>=p.since AND a.created_at<p.until AND a.retention_until>p.until),
    activity AS (SELECT user_id,platform,coalesce(app_version,'unknown') AS version FROM current_events
      UNION ALL SELECT user_id,platform,coalesce(app_version,'unknown') FROM legacy),
    slices AS (SELECT e.user_id,e.session_id,
      extract(epoch FROM least(e.occurred_at,p.until)-greatest(e.active_started_at,p.since))*1000 AS ms
      FROM e,p WHERE e.name='session_active' AND e.active_started_at<p.until AND e.occurred_at>p.since),
    durations AS (SELECT user_id,session_id,sum(ms)/1000.0 AS seconds FROM slices GROUP BY user_id,session_id),
    sessions AS (SELECT user_id,session_id,max(occurred_at) AS last_at,
      bool_or(name='session_started') AS has_start,
      count(1) FILTER(WHERE name NOT IN('session_active','daily_active')) AS span_events,
      extract(epoch FROM max(occurred_at) FILTER(WHERE name NOT IN('session_active','daily_active'))
        -min(occurred_at) FILTER(WHERE name NOT IN('session_active','daily_active'))) AS span_seconds,
      (array_agg(platform ORDER BY occurred_at DESC) FILTER(WHERE platform<>'unknown'))[1] AS platform,
      (array_agg(app_version ORDER BY occurred_at DESC) FILTER(WHERE app_version IS NOT NULL))[1] AS version
      FROM current_events WHERE session_id IS NOT NULL GROUP BY user_id,session_id),
    closed AS (SELECT s.*,d.seconds FROM sessions s LEFT JOIN durations d USING(user_id,session_id),p
      WHERE s.has_start AND s.last_at<p.until-interval '30 minutes'),
    measured AS (SELECT * FROM closed WHERE seconds>0),
    visits AS (SELECT DISTINCT user_id,(occurred_at+interval '9 hours')::date AS day FROM e
      WHERE name IN('session_started','session_active','daily_active','home_viewed','explore_viewed','book_opened','compose_started','invite_viewed')),
    first_days AS (SELECT user_id,min(day) AS day FROM visits GROUP BY user_id),
    cohort_users AS (SELECT f.* FROM first_days f,p WHERE f.day>=(p.since+interval '9 hours')::date AND f.day<=p.today),
    retention_users AS (SELECT c.user_id,c.day,v.d,c.day+v.d<p.today AS mature,
      EXISTS(SELECT 1 FROM visits r WHERE r.user_id=c.user_id AND r.day=c.day+v.d) AS returned
      FROM cohort_users c CROSS JOIN (VALUES(1),(7),(30)) v(d),p),
    ret AS (SELECT v.d AS day,count(r.user_id) FILTER(WHERE r.mature) AS eligible,
      count(r.user_id) FILTER(WHERE r.mature AND r.returned) AS returned,
      count(r.user_id) FILTER(WHERE NOT r.mature) AS pending,
      round(100.0*count(r.user_id) FILTER(WHERE r.mature AND r.returned)/nullif(count(r.user_id) FILTER(WHERE r.mature),0),1) AS rate
      FROM (VALUES(1),(7),(30)) v(d) LEFT JOIN retention_users r ON r.d=v.d GROUP BY v.d),
    cohorts AS (SELECT day::text AS day,count(DISTINCT user_id) AS users,
      max(rate) FILTER(WHERE d=1) AS d1,max(rate) FILTER(WHERE d=7) AS d7,max(rate) FILTER(WHERE d=30) AS d30
      FROM (SELECT day,d,user_id,CASE WHEN bool_and(mature) OVER(PARTITION BY day,d)
        THEN 100.0*count(1) FILTER(WHERE returned) OVER(PARTITION BY day,d)/count(1) OVER(PARTITION BY day,d) END AS rate
        FROM retention_users) r GROUP BY day),
    env AS (SELECT platform,version,count(DISTINCT user_id) AS users FROM activity GROUP BY platform,version),
    buckets AS (SELECT b.sort,b.label,count(m.user_id) AS sessions FROM (VALUES
      (1,'10초 미만',0,10),(2,'10~30초',10,30),(3,'30초~1분',30,60),
      (4,'1~3분',60,180),(5,'3~10분',180,600),(6,'10분 이상',600,2147483647)) b(sort,label,lo,hi)
      LEFT JOIN measured m ON m.seconds>=b.lo AND m.seconds<b.hi GROUP BY b.sort,b.label)
    SELECT json_build_object(
      'coverage',json_build_object('activeUsers',(SELECT count(DISTINCT user_id) FROM activity),
        'lifecycleUsers',(SELECT count(DISTINCT user_id) FROM current_events),
        'legacyOnlyUsers',(SELECT count(DISTINCT user_id) FROM legacy l WHERE NOT EXISTS(SELECT 1 FROM current_events n WHERE n.user_id=l.user_id)),
        'measuredUsers',(SELECT count(DISTINCT user_id) FROM slices),
        'rate',round(100.0*(SELECT count(DISTINCT user_id) FROM slices)/nullif((SELECT count(DISTINCT user_id) FROM activity),0),1),
        'measuredSince',(SELECT min(active_started_at) AT TIME ZONE 'UTC' FROM e WHERE name='session_active')),
      'sessions',json_build_object('observed',(SELECT count(1) FROM sessions),'measured',(SELECT count(1) FROM measured),
        'incomplete',(SELECT count(1) FROM sessions s,p WHERE NOT has_start OR last_at>=p.until-interval '30 minutes'),
        'meanSeconds',(SELECT round(avg(seconds)::numeric,1) FROM measured),
        'medianSeconds',(SELECT percentile_cont(.5) WITHIN GROUP(ORDER BY seconds) FROM measured),
        'p90Seconds',(SELECT percentile_cont(.9) WITHIN GROUP(ORDER BY seconds) FROM measured),
        'shortSessions',(SELECT count(1) FROM measured WHERE seconds<10),
        'observedSpanSessions',(SELECT count(1) FROM closed WHERE span_events>=2),
        'observedSpanMeanSeconds',(SELECT round(avg(span_seconds)::numeric,1) FROM closed WHERE span_events>=2)),
      'distribution',(SELECT json_agg(json_build_object('label',label,'sessions',sessions) ORDER BY sort) FROM buckets),
      'retention',(SELECT json_agg(ret ORDER BY day) FROM ret),
      'cohorts',coalesce((SELECT json_agg(cohorts ORDER BY day DESC) FROM cohorts),'[]'::json),
      'environments',coalesce((SELECT json_agg(json_build_object('platform',g.platform,'appVersion',g.version,'users',g.users,
        'measuredUsers',(SELECT count(DISTINCT s.user_id) FROM slices s JOIN sessions t USING(user_id,session_id)
          WHERE coalesce(t.platform,'unknown')=g.platform AND coalesce(t.version,'unknown')=g.version),
        'measuredSessions',(SELECT count(1) FROM measured m WHERE coalesce(m.platform,'unknown')=g.platform AND coalesce(m.version,'unknown')=g.version),
        'meanSeconds',(SELECT round(avg(seconds)::numeric,1) FROM measured m WHERE coalesce(m.platform,'unknown')=g.platform AND coalesce(m.version,'unknown')=g.version),
        'medianSeconds',(SELECT percentile_cont(.5) WITHIN GROUP(ORDER BY seconds) FROM measured m WHERE coalesce(m.platform,'unknown')=g.platform AND coalesce(m.version,'unknown')=g.version)
      ) ORDER BY g.platform,g.version) FROM env g),'[]'::json)
    ) AS value`;
}

export async function readEngagementMetrics(period: ReturnType<typeof analyticsPeriod>) {
  const { prisma } = await import("@/server/db/prisma");
  const [row] = await prisma.$queryRaw<Array<{ value: EngagementMetrics }>>(engagementMetricsSql(period));
  return row.value;
}
