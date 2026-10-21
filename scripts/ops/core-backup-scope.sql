\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';
WITH excluded(table_name) AS (VALUES
  ('accommodation_source_records'),
  ('external_data_sync_checkpoints'),
  ('external_data_sync_runs'),
  ('municipal_core_tourism_source_records'),
  ('place_crowd_estimates'),
  ('regional_visitor_count_records'),
  ('related_tourism_source_records'),
  ('seoul_realtime_population_cache'),
  ('tourism_photo_gallery_source_records'),
  ('tourism_region_metrics'),
  ('tourist_spot_concentration_rate_records'),
  ('wellness_tourism_source_records')
), inventory AS (
  SELECT s.schemaname, s.relname, s.relid,
    pg_total_relation_size(s.relid) AS total_bytes,
    EXISTS (SELECT 1 FROM excluded e WHERE s.schemaname = 'public' AND e.table_name = s.relname) AS excluded_data
  FROM pg_stat_user_tables s
), blockers AS (
  SELECT nc.nspname || '.' || c.relname AS child_table, np.nspname || '.' || p.relname AS parent_table
  FROM pg_constraint fk
  JOIN pg_class c ON c.oid = fk.conrelid JOIN pg_namespace nc ON nc.oid = c.relnamespace
  JOIN pg_class p ON p.oid = fk.confrelid JOIN pg_namespace np ON np.oid = p.relnamespace
  WHERE fk.contype = 'f'
    AND np.nspname = 'public' AND p.relname IN (SELECT table_name FROM excluded)
    AND NOT (nc.nspname = 'public' AND c.relname IN (SELECT table_name FROM excluded))
)
SELECT json_build_object(
  'scope', 'core-backup-candidate-plan-only',
  'schemaPolicy', 'retain-full-schema',
  'dataPolicy', 'retain-all-except-explicit-rebuildable-public-tables',
  'retainedTableCount', (SELECT count(*) FROM inventory WHERE NOT excluded_data),
  'retainedSourceDiskBytes', COALESCE((SELECT sum(total_bytes) FROM inventory WHERE NOT excluded_data), 0),
  'excludedTableCount', (SELECT count(*) FROM inventory WHERE excluded_data),
  'excludedSourceDiskBytes', COALESCE((SELECT sum(total_bytes) FROM inventory WHERE excluded_data), 0),
  'excludedTables', COALESCE((SELECT json_agg(json_build_object('table', relname, 'sourceDiskBytes', total_bytes) ORDER BY total_bytes DESC) FROM inventory WHERE excluded_data), '[]'::json),
  'retainedLargestTables', COALESCE((SELECT json_agg(json_build_object('table', schemaname || '.' || relname, 'sourceDiskBytes', total_bytes)) FROM (SELECT * FROM inventory WHERE NOT excluded_data ORDER BY total_bytes DESC LIMIT 8) largest), '[]'::json),
  'dependencyBlockers', COALESCE((SELECT json_agg(json_build_object('child', child_table, 'omittedParent', parent_table)) FROM blockers), '[]'::json),
  'missingPolicyTables', COALESCE((SELECT json_agg(table_name) FROM excluded e WHERE NOT EXISTS (SELECT 1 FROM inventory i WHERE i.schemaname = 'public' AND i.relname = e.table_name)), '[]'::json),
  'backupCreated', false,
  'restorationPerformed', false,
  'diskSizeIsNotArchiveSize', true
);
ROLLBACK;
