import { Prisma } from "@/generated/prisma/client";
import type { AdminUserActivityResponse } from "@/shared/api/admin";
import { analyticsPeriod } from "./analyticsScope";

export function lifelogUsersSql(period: ReturnType<typeof analyticsPeriod>, cursor: string | null) {
  return Prisma.sql`
    WITH p AS (SELECT ${period.start}::timestamp AS since,${period.end}::timestamp AS until,${cursor}::text AS cursor),
    life AS (SELECT user_id,name,occurred_at,retention_until,session_id,platform,app_version FROM lifecycle_events l,p WHERE occurred_at>=p.since AND occurred_at<p.until AND retention_until>p.until),
    old AS (SELECT user_id,created_at,platform,app_version,client_session_id FROM product_activity_events a,p WHERE created_at>=p.since AND created_at<p.until),
    journals AS (SELECT owner_id,created_at FROM journal_entries j,p WHERE created_at>=p.since AND created_at<p.until AND sensitive_withdrawn_at IS NULL),
    runs AS (SELECT user_id,created_at FROM recommendation_runs r,p WHERE created_at>=p.since AND created_at<p.until),
    actions AS (SELECT user_id,created_at FROM recommendation_actions a,p WHERE created_at>=p.since AND created_at<p.until),
    signals AS (SELECT user_id,occurred_at AS at,name IN('madi_created','book_opened','madi_added','pdf_created') AS meaningful,name='madi_created' AS written FROM life
      UNION ALL SELECT user_id,created_at,false,false FROM old
      UNION ALL SELECT owner_id,created_at,true,true FROM journals),
    recent AS (SELECT u.id,u.role,u.created_at,u.display_name,u.last_accessed_at,u.analytics_excluded_at,u.analytics_exclusion_reason FROM users u,p WHERE (u.created_at>=p.since AND u.created_at<p.until) OR EXISTS(SELECT 1 FROM signals s WHERE s.user_id=u.id)
      OR EXISTS(SELECT 1 FROM runs r WHERE r.user_id=u.id) OR EXISTS(SELECT 1 FROM actions a WHERE a.user_id=u.id)),
    eligible AS (SELECT * FROM recent WHERE role='user' AND analytics_excluded_at IS NULL),
    page AS (SELECT u.* FROM recent u,p WHERE p.cursor IS NULL OR (u.created_at,u.id)<(SELECT created_at,id FROM recent WHERE id=p.cursor)
      ORDER BY u.created_at DESC,u.id DESC LIMIT 101),
    counts AS (SELECT user_id,count(1) FILTER(WHERE name='madi_created') AS writes,
      count(DISTINCT (occurred_at+interval '9 hours')::date) FILTER(WHERE name='madi_created') AS days,
      count(1) FILTER(WHERE name='book_opened') AS opens,count(1) FILTER(WHERE name='madi_added') AS contributions,
      count(1) FILTER(WHERE name='pdf_created') AS pdfs,count(DISTINCT session_id) FILTER(WHERE name='session_started') AS sessions FROM life GROUP BY user_id),
    items AS (SELECT u.id AS "userId",u.display_name AS "displayName",
      CASE WHEN u.role='admin' THEN 'admin' WHEN EXISTS(SELECT 1 FROM auth_identities a WHERE a.user_id=u.id) THEN 'authenticated' ELSE 'anonymous' END AS "accountType",
      CASE WHEN EXISTS(SELECT 1 FROM journals j WHERE j.owner_id=u.id) OR coalesce(c.writes,0)>0 THEN 'converted'
        WHEN coalesce(c.opens,0)+coalesce(c.contributions,0)>0 THEN 'engaged'
        WHEN EXISTS(SELECT 1 FROM runs r WHERE r.user_id=u.id) THEN 'recommended'
        WHEN EXISTS(SELECT 1 FROM signals s WHERE s.user_id=u.id) THEN 'visited' ELSE 'created' END AS stage,
      u.role='admin' OR u.analytics_excluded_at IS NOT NULL AS excluded,
      CASE WHEN u.role='admin' THEN '관리자 계정' ELSE u.analytics_exclusion_reason END AS "exclusionReason",
      coalesce((SELECT platform FROM life l WHERE l.user_id=u.id AND platform IN('web','android','ios') ORDER BY occurred_at DESC LIMIT 1),
        (SELECT platform::text FROM old a WHERE a.user_id=u.id ORDER BY created_at DESC LIMIT 1)) AS platform,
      coalesce((SELECT app_version FROM life l WHERE l.user_id=u.id AND app_version IS NOT NULL ORDER BY occurred_at DESC LIMIT 1),
        (SELECT app_version FROM old a WHERE a.user_id=u.id ORDER BY created_at DESC LIMIT 1)) AS "appVersion",
      CASE WHEN coalesce(c.sessions,0)>0 THEN c.sessions ELSE (SELECT count(DISTINCT client_session_id) FROM old a WHERE a.user_id=u.id) END AS "sessionCount",
      (SELECT count(1) FROM runs r WHERE r.user_id=u.id) AS "recommendationRuns",
      (SELECT count(1) FROM actions a WHERE a.user_id=u.id) AS "recommendationActions",
      (SELECT count(1) FROM journals j WHERE j.owner_id=u.id) AS "journalCount",
      u.created_at AT TIME ZONE 'UTC' AS "createdAt",
      coalesce((SELECT min(at) FROM signals s WHERE s.user_id=u.id),u.created_at) AT TIME ZONE 'UTC' AS "firstActivityAt",
      greatest(u.last_accessed_at,(SELECT max(at) FROM signals s WHERE s.user_id=u.id)) AT TIME ZONE 'UTC' AS "lastActivityAt",
      json_build_object('writes',coalesce(c.writes,0),'writeDays',coalesce(c.days,0),'bookOpens',coalesce(c.opens,0),'contributions',coalesce(c.contributions,0),'pdfs',coalesce(c.pdfs,0)) AS lifelog
      FROM (SELECT * FROM page ORDER BY created_at DESC,id DESC LIMIT 100) u LEFT JOIN counts c ON c.user_id=u.id),
    daily AS (SELECT to_char(d.day,'YYYY-MM-DD') AS date,
      (SELECT count(1) FROM eligible u WHERE (u.created_at+interval '9 hours')::date=d.day::date) AS "newUsers",
      (SELECT count(DISTINCT s.user_id) FROM signals s JOIN eligible u ON u.id=s.user_id WHERE (s.at+interval '9 hours')::date=d.day::date) AS "activeUsers",
      (SELECT count(DISTINCT s.user_id) FROM signals s JOIN eligible u ON u.id=s.user_id WHERE s.meaningful AND (s.at+interval '9 hours')::date=d.day::date) AS "meaningfulUsers"
      FROM p,LATERAL generate_series((p.since+interval '9 hours')::date,(p.until+interval '9 hours')::date,interval '1 day') d(day))
    SELECT json_build_object('periodDays',${period.days}::integer,'generatedAt',${period.asOf}::text,
      'trackingStartedAt',(SELECT min(occurred_at) AT TIME ZONE 'UTC' FROM lifecycle_events),
      'summary',json_build_object('observedUsers',(SELECT count(1) FROM eligible),
        'newUsers',(SELECT count(1) FROM eligible u,p WHERE u.created_at>=p.since AND u.created_at<p.until),
        'returningUsers',(SELECT count(1) FROM eligible u WHERE (SELECT count(DISTINCT (s.at+interval '9 hours')::date) FROM signals s WHERE s.user_id=u.id)>=2),
        'meaningfulUsers',(SELECT count(DISTINCT s.user_id) FROM signals s JOIN eligible u ON u.id=s.user_id WHERE meaningful),
        'convertedUsers',(SELECT count(DISTINCT s.user_id) FROM signals s JOIN eligible u ON u.id=s.user_id WHERE written),
        'authenticatedUsers',(SELECT count(1) FROM eligible u WHERE EXISTS(SELECT 1 FROM auth_identities a WHERE a.user_id=u.id)),
        'excludedUsers',(SELECT count(1) FROM recent WHERE role<>'user' OR analytics_excluded_at IS NOT NULL)),
      'daily',coalesce((SELECT json_agg(daily ORDER BY date) FROM daily),'[]'::json),
      'users',coalesce((SELECT json_agg(items ORDER BY "createdAt" DESC,"userId" DESC) FROM items),'[]'::json),
      'nextCursor',CASE WHEN (SELECT count(1) FROM page)>100 THEN (SELECT "userId" FROM items ORDER BY "createdAt","userId" LIMIT 1) ELSE null END) AS value
  `;
}
export async function readLifelogUsers(period: ReturnType<typeof analyticsPeriod>, cursor: string | null): Promise<AdminUserActivityResponse> {
  const { prisma } = await import("@/server/db/prisma");
  const [row] = await prisma.$queryRaw<Array<{ value: AdminUserActivityResponse }>>(lifelogUsersSql(period, cursor));
  return row.value;
}
