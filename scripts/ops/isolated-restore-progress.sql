\set ON_ERROR_STOP on
SET statement_timeout = '5s';
SELECT json_build_object(
  'stage', 'isolated-postgres-progress',
  'databaseBytes', pg_database_size(current_database()),
  'activeRestoreSessions', count(*) FILTER (WHERE application_name = 'pg_restore' AND state = 'active'),
  'copyOperations', count(*) FILTER (WHERE application_name = 'pg_restore' AND state = 'active' AND query ~* '^COPY '),
  'indexOperations', count(*) FILTER (WHERE application_name = 'pg_restore' AND state = 'active' AND query ~* '^CREATE (UNIQUE )?INDEX '),
  'lockWaits', count(*) FILTER (WHERE application_name = 'pg_restore' AND wait_event_type = 'Lock'),
  'ioWaits', count(*) FILTER (WHERE application_name = 'pg_restore' AND wait_event_type = 'IO'),
  'copyBytesProcessed', COALESCE((SELECT sum(bytes_processed) FROM pg_stat_progress_copy WHERE datname = current_database()), 0),
  'indexBlocksTotal', COALESCE((SELECT sum(blocks_total) FROM pg_stat_progress_create_index WHERE datname = current_database()), 0),
  'indexBlocksDone', COALESCE((SELECT sum(blocks_done) FROM pg_stat_progress_create_index WHERE datname = current_database()), 0)
) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid();
