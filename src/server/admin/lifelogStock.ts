import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import type { LifelogStock } from "@/shared/api/lifelogMetrics";

export async function readLifelogStock(): Promise<LifelogStock> {
  // One statement gives a consistent snapshot, regardless of user-list pagination.
  // No content, images, addresses or names leave the database.
  const [row] = await prisma.$queryRaw<Array<Record<keyof LifelogStock, bigint | number | null>>>(Prisma.sql`
    WITH eligible AS (SELECT id FROM users WHERE role='user' AND analytics_excluded_at IS NULL),
    entries AS (SELECT j.id,j.owner_id, nullif(j.image,'') IS NOT NULL AS photo FROM journal_entries j JOIN eligible u ON u.id=j.owner_id WHERE j.sensitive_withdrawn_at IS NULL),
    books AS (SELECT b.id FROM harumadis b JOIN eligible u ON u.id=b.owner_id),
    links AS (SELECT l.harumadi_id,l.entry_id,e.owner_id FROM harumadi_entry_links l JOIN books b ON b.id=l.harumadi_id JOIN entries e ON e.id=l.entry_id),
    sizes AS (SELECT b.id,count(l.entry_id) AS n,count(DISTINCT l.owner_id) AS authors FROM books b LEFT JOIN links l ON l.harumadi_id=b.id GROUP BY b.id),
    members AS (SELECT m.harumadi_id,m.user_id FROM harumadi_members m JOIN books b ON b.id=m.harumadi_id JOIN eligible u ON u.id=m.user_id WHERE m.ended_at IS NULL),
    pdfs AS (SELECT p.owner_id,p.page_count FROM harumadi_pdfs p JOIN eligible u ON u.id=p.owner_id)
    SELECT (SELECT count(1) FROM eligible) AS accounts,
      (SELECT count(DISTINCT owner_id) FROM entries) AS writers,
      (SELECT count(1) FROM entries) AS madis,
      (SELECT count(1) FROM entries WHERE photo) AS "withPhoto",
      (SELECT count(1) FROM entries WHERE NOT photo) AS "textOnly",
      (SELECT count(1) FROM entries e WHERE NOT EXISTS(SELECT 1 FROM links l WHERE l.entry_id=e.id)) AS unfiled,
      (SELECT count(1) FROM books) AS books,
      (SELECT count(1) FROM sizes WHERE n=0) AS "emptyBooks",
      (SELECT count(1) FROM sizes WHERE n>0) AS "filledBooks",
      (SELECT avg(n) FROM sizes) AS "meanEntries",
      (SELECT percentile_cont(0.5) WITHIN GROUP(ORDER BY n) FROM sizes) AS "medianEntries",
      (SELECT percentile_cont(0.9) WITHIN GROUP(ORDER BY n) FROM sizes) AS "p90Entries",
      (SELECT count(DISTINCT harumadi_id) FROM members) AS "sharedBooks",
      (SELECT count(1) FROM sizes WHERE authors>=2) AS "collaborativeBooks",
      (SELECT count(DISTINCT user_id) FROM members) AS participants,
      (SELECT count(1) FROM harumadi_comments c JOIN books b ON b.id=c.harumadi_id JOIN eligible u ON u.id=c.author_id WHERE c.deleted_at IS NULL) AS comments,
      (SELECT count(1) FROM pdfs) AS pdfs,
      (SELECT count(DISTINCT owner_id) FROM pdfs) AS "pdfOwners",
      (SELECT coalesce(sum(page_count),0) FROM pdfs) AS "pdfPages"
  `);
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Math.round(Number(value ?? 0) * 10) / 10])) as LifelogStock;
}
