ALTER TABLE journal_books
  ADD COLUMN cover_style TEXT,
  ADD COLUMN cover_thumbnail BYTEA,
  ADD COLUMN cover_ready BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE journal_books ADD CONSTRAINT journal_book_cover_style_check CHECK (
  cover_style IS NULL OR cover_style IN ('white-plain', 'green-plain', 'white-image', 'green-image')
);
ALTER TABLE journal_books ADD CONSTRAINT journal_book_cover_thumbnail_check CHECK (
  (cover_thumbnail IS NULL AND cover_ready=false) OR
  (cover_thumbnail IS NOT NULL AND cover_ready=true AND octet_length(cover_thumbnail) BETWEEN 1 AND 98304)
);
