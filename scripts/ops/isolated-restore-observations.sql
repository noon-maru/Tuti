\set ON_ERROR_STOP on
SELECT json_build_object(
  'accounts', (SELECT count(*) FROM users),
  'journals', (SELECT count(*) FROM journal_entries),
  'books', (SELECT count(*) FROM journal_books),
  'migrations', (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL),
  'failedMigrations', (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL),
  'unvalidatedForeignKeys', (SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND NOT convalidated),
  'postgresMajor', current_setting('server_version_num')::int / 10000,
  'images', COALESCE((SELECT json_agg(DISTINCT image) FROM journal_entries WHERE image LIKE 'journal-images/%'), '[]'::json),
  'pdfs', COALESCE((SELECT json_agg(json_build_object('key', object_key, 'pageCount', page_count)) FROM journal_books), '[]'::json),
  'externalImages', (SELECT count(*) FROM journal_entries WHERE image ~ '^https?://'),
  'embeddedImages', (SELECT count(*) FROM journal_entries WHERE image LIKE 'data:%')
);
