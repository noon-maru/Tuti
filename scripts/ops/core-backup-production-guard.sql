\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';
DO $$
DECLARE
  excluded text[] := ARRAY[
    'accommodation_source_records',
    'external_data_sync_checkpoints',
    'external_data_sync_runs',
    'municipal_core_tourism_source_records',
    'place_crowd_estimates',
    'regional_visitor_count_records',
    'related_tourism_source_records',
    'seoul_realtime_population_cache',
    'tourism_photo_gallery_source_records',
    'tourism_region_metrics',
    'tourist_spot_concentration_rate_records',
    'wellness_tourism_source_records'
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM unnest(excluded) e WHERE to_regclass('public.' || e) IS NULL) THEN
    RAISE EXCEPTION 'CORE_POLICY_TABLE_MISSING';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint f
    JOIN pg_class c ON c.oid = f.conrelid JOIN pg_namespace nc ON nc.oid = c.relnamespace
    JOIN pg_class p ON p.oid = f.confrelid JOIN pg_namespace np ON np.oid = p.relnamespace
    WHERE f.contype = 'f' AND np.nspname = 'public' AND p.relname = ANY(excluded)
      AND NOT (nc.nspname = 'public' AND c.relname = ANY(excluded))
  ) THEN RAISE EXCEPTION 'CORE_DEPENDENCY_BLOCKED'; END IF;
END $$;
ROLLBACK;
