import { Prisma } from "@/generated/prisma/client";
import { analyticsPeriod } from "./analyticsScope";
import type { LifelogActivity } from "@/shared/api/lifelogMetrics";

// Aggregate in PostgreSQL; never load an arbitrary user-list sample as a population.
export function lifelogActivitySql(period: ReturnType<typeof analyticsPeriod>) {
  const thirty = analyticsPeriod(30, new Date(period.asOf));
  return Prisma.sql`
    WITH p AS (SELECT ${period.start}::timestamp AS since, ${period.end}::timestamp AS until, ${thirty.start}::timestamp AS monthly),
    eligible AS (SELECT id,created_at FROM users WHERE role='user' AND analytics_excluded_at IS NULL),
    e AS (SELECT ev.* FROM lifecycle_events ev JOIN eligible u ON u.id=ev.user_id,p WHERE ev.occurred_at<p.until AND ev.retention_until>p.until),
    coverage AS (SELECT min(occurred_at) AS since FROM lifecycle_events,p WHERE occurred_at<p.until AND retention_until>p.until),
    current_books AS (SELECT b.id FROM harumadis b JOIN eligible u ON u.id=b.owner_id),
    collab AS (SELECT l.harumadi_id FROM harumadi_entry_links l JOIN current_books b ON b.id=l.harumadi_id
      JOIN journal_entries j ON j.id=l.entry_id JOIN eligible u ON u.id=j.owner_id WHERE j.sensitive_withdrawn_at IS NULL GROUP BY l.harumadi_id HAVING count(DISTINCT j.owner_id)>=2),
    firsts AS (SELECT u.id,u.created_at,min(e.occurred_at) FILTER(WHERE name IN('home_viewed','invite_viewed')) AS entered,
      min(e.occurred_at) FILTER(WHERE name='madi_created') AS first_madi FROM eligible u LEFT JOIN e ON e.user_id=u.id GROUP BY u.id,u.created_at),
    new_entries AS (SELECT f.* FROM firsts f,p,coverage c WHERE f.created_at>=c.since AND f.entered>=p.since AND f.entered<p.until),
    mature AS (SELECT f.* FROM new_entries f,p WHERE f.entered+interval '7 days'<=p.until),
    converted AS (SELECT * FROM mature WHERE first_madi>=entered AND first_madi<entered+interval '7 days'),
    invites AS (SELECT e.* FROM e,p WHERE name='invite_created' AND occurred_at>=p.since),
    accepted AS (SELECT i.id,i.occurred_at,EXISTS(SELECT 1 FROM e a WHERE a.name='invite_accepted' AND a.entity_id=i.entity_id
      AND a.occurred_at>=i.occurred_at AND a.occurred_at<i.occurred_at+interval '7 days') AS converted FROM invites i),
    day_writes AS (SELECT to_char(occurred_at+interval '9 hours','YYYY-MM-DD') AS day,count(1) AS madis,count(DISTINCT user_id) AS writers
      FROM e,p WHERE name='madi_created' AND occurred_at>=p.since GROUP BY 1),
    repeat_writers AS (SELECT user_id FROM e,p WHERE name='madi_created' AND occurred_at>=p.monthly
      GROUP BY user_id HAVING count(DISTINCT (occurred_at+interval '9 hours')::date)>=2),
    cohort_users AS (SELECT f.id,f.first_madi,to_char(date_trunc('week',f.first_madi+interval '9 hours'),'YYYY-MM-DD') AS week
      FROM firsts f,p,coverage c WHERE f.created_at>=c.since AND f.first_madi>=p.since),
    cohorts AS (SELECT week,count(1) AS users,
      CASE WHEN max(first_madi)+interval '14 days'<=(SELECT until FROM p) THEN round(100.0*count(1) FILTER(WHERE EXISTS(
        SELECT 1 FROM e WHERE e.user_id=c.id AND name='madi_created' AND occurred_at>=c.first_madi+interval '7 days' AND occurred_at<c.first_madi+interval '14 days'))/count(1),1) END AS w1,
      CASE WHEN max(first_madi)+interval '35 days'<=(SELECT until FROM p) THEN round(100.0*count(1) FILTER(WHERE EXISTS(
        SELECT 1 FROM e WHERE e.user_id=c.id AND name='madi_created' AND occurred_at>=c.first_madi+interval '28 days' AND occurred_at<c.first_madi+interval '35 days'))/count(1),1) END AS w4
      FROM cohort_users c GROUP BY week),
    path_entries AS (SELECT user_id,CASE WHEN name='invite_viewed' THEN 'invite' WHEN name='explore_viewed' THEN 'explore' ELSE 'home' END AS source,min(occurred_at) AS entered
      FROM e,p WHERE name IN('home_viewed','invite_viewed','explore_viewed') AND occurred_at>=p.since GROUP BY 1,2),
    path_counts AS (SELECT x.source,count(1) AS entrants,
      count(1) FILTER(WHERE EXISTS(SELECT 1 FROM e s WHERE s.user_id=x.user_id
        AND s.name=CASE WHEN x.source='invite' THEN 'invite_accepted' ELSE 'compose_started' END
        AND (x.source='invite' OR CASE WHEN s.source='book' THEN 'home' ELSE s.source END=x.source)
        AND s.occurred_at>=x.entered AND s.occurred_at<x.entered+interval '7 days')) AS starters,
      count(1) FILTER(WHERE EXISTS(SELECT 1 FROM e s JOIN e done ON done.user_id=s.user_id
        AND done.name=CASE WHEN x.source='invite' THEN 'shared_first_contribution' ELSE 'madi_created' END
        AND done.occurred_at>=s.occurred_at AND done.occurred_at<x.entered+interval '7 days'
        AND (CASE WHEN x.source='invite' THEN done.book_id=s.book_id ELSE done.flow_id=s.flow_id AND s.flow_id IS NOT NULL END)
        WHERE s.user_id=x.user_id AND s.name=CASE WHEN x.source='invite' THEN 'invite_accepted' ELSE 'compose_started' END
        AND (x.source='invite' OR CASE WHEN s.source='book' THEN 'home' ELSE s.source END=x.source)
        AND s.occurred_at>=x.entered AND s.occurred_at<x.entered+interval '7 days')) AS successes
      FROM path_entries x GROUP BY x.source)
    SELECT json_build_object(
      'retainedSince',(SELECT since AT TIME ZONE 'UTC' FROM coverage),
      'writerUsers',(SELECT count(DISTINCT user_id) FROM e,p WHERE name='madi_created' AND occurred_at>=p.since),
      'newMadis',(SELECT count(1) FROM e,p WHERE name='madi_created' AND occurred_at>=p.since),
      'repeatWriters30d',(SELECT count(1) FROM repeat_writers),
      'updatedBooks',(SELECT count(DISTINCT book_id) FROM e JOIN current_books b ON b.id=e.book_id,p WHERE name='madi_added' AND occurred_at>=p.since),
      'activeCollaborativeBooks',(SELECT count(DISTINCT book_id) FROM e JOIN collab c ON c.harumadi_id=e.book_id,p WHERE name='madi_added' AND occurred_at>=p.since),
      'invites',(SELECT count(1) FROM invites),
      'acceptedInvites',(SELECT count(1) FROM accepted WHERE converted),
      'matureInvites',(SELECT count(1) FROM accepted,p WHERE occurred_at+interval '7 days'<=p.until),
      'matureAccepted',(SELECT count(1) FROM accepted,p WHERE converted AND occurred_at+interval '7 days'<=p.until),
      'contributors',(SELECT count(DISTINCT user_id) FROM e JOIN collab c ON c.harumadi_id=e.book_id,p WHERE name='madi_added' AND occurred_at>=p.since),
      'firstContributors',(SELECT count(DISTINCT user_id) FROM e,p WHERE name='shared_first_contribution' AND occurred_at>=p.since),
      'pdfs',(SELECT count(1) FROM e,p WHERE name='pdf_created' AND occurred_at>=p.since),
      'exporters',(SELECT count(DISTINCT user_id) FROM e,p WHERE name='pdf_exported' AND occurred_at>=p.since),
      'purchaseViewers',(SELECT count(DISTINCT user_id) FROM e,p WHERE name='purchase_viewed' AND occurred_at>=p.since),
      'purchaseClickers',(SELECT count(DISTINCT user_id) FROM e,p WHERE name='purchase_clicked' AND occurred_at>=p.since
        AND EXISTS(SELECT 1 FROM e v WHERE v.user_id=e.user_id AND v.name='purchase_viewed' AND v.occurred_at>=p.since AND v.occurred_at<=e.occurred_at)),
      'activation',json_build_object('eligible',(SELECT count(1) FROM mature),'pending',(SELECT count(1) FROM new_entries)-(SELECT count(1) FROM mature),
        'converted',(SELECT count(1) FROM converted),'rate',(SELECT round(100.0*(SELECT count(1) FROM converted)/nullif(count(1),0),1) FROM mature),
        'medianMinutes',(SELECT percentile_cont(0.5) WITHIN GROUP(ORDER BY extract(epoch FROM first_madi-entered)/60) FROM converted)),
      'cohorts',coalesce((SELECT json_agg(cohorts ORDER BY week) FROM cohorts),'[]'::json),
      'paths',coalesce((SELECT json_agg(path_counts ORDER BY source) FROM path_counts),'[]'::json),
      'daily',coalesce((SELECT json_agg(day_writes ORDER BY day) FROM day_writes),'[]'::json)
    ) AS value
  `;
}
export async function readLifelogActivity(period: ReturnType<typeof analyticsPeriod>): Promise<LifelogActivity> {
  const { prisma } = await import("@/server/db/prisma");
  const [row] = await prisma.$queryRaw<Array<{ value: LifelogActivity }>>(lifelogActivitySql(period));
  return row.value;
}
