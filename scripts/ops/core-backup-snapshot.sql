\set ON_ERROR_STOP on
SET statement_timeout = '120s';
CREATE TEMP TABLE core_test_excluded (table_name text PRIMARY KEY);
\copy core_test_excluded FROM '/sandbox-policy/excluded.txt'
CREATE FUNCTION pg_temp.core_snapshot() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  item record;
  row_count bigint;
  fingerprint text;
  retained jsonb := '[]'::jsonb;
  omitted jsonb := '[]'::jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM core_test_excluded e WHERE NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = e.table_name AND c.relkind IN ('r', 'p')
  )) THEN RAISE EXCEPTION 'CORE_POLICY_TABLE_MISSING'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint f
    JOIN pg_catalog.pg_class c ON c.oid = f.conrelid JOIN pg_catalog.pg_namespace nc ON nc.oid = c.relnamespace
    JOIN pg_catalog.pg_class p ON p.oid = f.confrelid JOIN pg_catalog.pg_namespace np ON np.oid = p.relnamespace
    WHERE f.contype = 'f' AND np.nspname = 'public' AND p.relname IN (SELECT table_name FROM core_test_excluded)
      AND NOT (nc.nspname = 'public' AND c.relname IN (SELECT table_name FROM core_test_excluded))
  ) THEN RAISE EXCEPTION 'CORE_DEPENDENCY_BLOCKED'; END IF;
  FOR item IN
    SELECT schemaname, relname, (schemaname = 'public' AND relname IN (SELECT table_name FROM core_test_excluded)) AS excluded
    FROM pg_catalog.pg_stat_user_tables WHERE schemaname !~ '^pg_' AND schemaname <> 'information_schema'
    ORDER BY schemaname, relname
  LOOP
    IF item.excluded THEN
      EXECUTE format('SELECT count(*) FROM %I.%I', item.schemaname, item.relname) INTO row_count;
      omitted := omitted || jsonb_build_array(jsonb_build_object('table', item.schemaname || '.' || item.relname, 'rows', row_count));
    ELSE
      EXECUTE format('SELECT count(*), md5(coalesce(string_agg(md5(row_to_json(t)::text), '''' ORDER BY md5(row_to_json(t)::text)), '''')) FROM %I.%I t', item.schemaname, item.relname) INTO row_count, fingerprint;
      retained := retained || jsonb_build_array(jsonb_build_object('table', item.schemaname || '.' || item.relname, 'rows', row_count, 'fingerprint', fingerprint));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('retained', retained, 'omitted', omitted);
END;
$$;
SELECT pg_temp.core_snapshot();
