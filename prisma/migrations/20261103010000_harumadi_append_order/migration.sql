BEGIN;

-- 최초 연결 시각은 과거에 저장하지 않았다. 현재 표시 순서를 고정하며
-- 이미 지정한 수동 순서는 보존한다. 없는 삽입 이력을 추정해 만들지 않는다.
LOCK TABLE "harumadi_entry_links" IN SHARE ROW EXCLUSIVE MODE;
WITH ranked AS (
  SELECT l.harumadi_id, l.entry_id,
    (row_number() OVER (
      PARTITION BY l.harumadi_id
      ORDER BY l.position ASC NULLS LAST, j.visited_at ASC, l.entry_id ASC
    ) - 1)::integer AS next_position
  FROM "harumadi_entry_links" l
  JOIN "journal_entries" j ON j.id = l.entry_id
)
UPDATE "harumadi_entry_links" l SET position = r.next_position
FROM ranked r WHERE l.harumadi_id = r.harumadi_id AND l.entry_id = r.entry_id;

-- 첫 마디·골라 담기·함께 채우기·일괄 연결을 모두 같은 규칙으로 처리한다.
-- 책 행 잠금은 순서 변경 API와도 공유하므로 동시에 추가해도 위치가 겹치지 않는다.
CREATE FUNCTION "tuti_harumadi_append_position"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.position IS NULL THEN
    PERFORM id FROM harumadis WHERE id = NEW.harumadi_id FOR UPDATE;
    SELECT coalesce(max(position), -1) + 1 INTO NEW.position
      FROM harumadi_entry_links WHERE harumadi_id = NEW.harumadi_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "harumadi_append_position"
  BEFORE INSERT ON "harumadi_entry_links"
  FOR EACH ROW EXECUTE FUNCTION "tuti_harumadi_append_position"();

COMMIT;
