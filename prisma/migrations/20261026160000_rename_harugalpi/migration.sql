-- 기존 행·객체 키·PDF 내용은 보존하고 관계 이름만 이전한다.
ALTER TABLE journal_books RENAME TO harugalpi_pdfs;
ALTER TABLE harugalpi_pdfs RENAME CONSTRAINT journal_books_pkey TO harugalpi_pdfs_pkey;
ALTER TABLE harugalpi_pdfs RENAME CONSTRAINT journal_books_owner_id_fkey TO harugalpi_pdfs_owner_id_fkey;
ALTER TABLE harugalpi_pdfs RENAME CONSTRAINT journal_book_cover_style_check TO harugalpi_pdf_cover_style_check;
ALTER TABLE harugalpi_pdfs RENAME CONSTRAINT journal_book_cover_thumbnail_check TO harugalpi_pdf_cover_thumbnail_check;
ALTER INDEX journal_books_object_key_key RENAME TO harugalpi_pdfs_object_key_key;
ALTER INDEX journal_books_owner_id_created_at_idx RENAME TO harugalpi_pdfs_owner_id_created_at_idx;

ALTER TABLE journal_notebooks RENAME TO harugalpis;
ALTER TABLE harugalpis RENAME CONSTRAINT journal_notebooks_pkey TO harugalpis_pkey;
ALTER TABLE harugalpis RENAME CONSTRAINT journal_notebooks_owner_id_fkey TO harugalpis_owner_id_fkey;
ALTER TABLE harugalpis RENAME CONSTRAINT journal_notebooks_title_check TO harugalpis_title_check;
ALTER TABLE harugalpis RENAME CONSTRAINT journal_notebooks_cover_style_check TO harugalpis_cover_style_check;
ALTER TABLE harugalpis RENAME CONSTRAINT journal_notebooks_inner_style_check TO harugalpis_inner_style_check;
ALTER TABLE harugalpis RENAME CONSTRAINT journal_notebooks_revision_check TO harugalpis_revision_check;
ALTER INDEX journal_notebooks_owner_id_created_at_idx RENAME TO harugalpis_owner_id_created_at_idx;

ALTER TABLE journal_notebook_entries RENAME TO harugalpi_entry_links;
ALTER TABLE harugalpi_entry_links RENAME COLUMN notebook_id TO harugalpi_id;
ALTER TABLE harugalpi_entry_links RENAME CONSTRAINT journal_notebook_entries_pkey TO harugalpi_entry_links_pkey;
ALTER TABLE harugalpi_entry_links RENAME CONSTRAINT journal_notebook_entries_notebook_id_fkey TO harugalpi_entry_links_harugalpi_id_fkey;
ALTER TABLE harugalpi_entry_links RENAME CONSTRAINT journal_notebook_entries_entry_id_fkey TO harugalpi_entry_links_entry_id_fkey;
ALTER INDEX journal_notebook_entries_entry_id_idx RENAME TO harugalpi_entry_links_entry_id_idx;

ALTER TYPE "ProductActivityType" RENAME VALUE 'journal_book_entered' TO 'harugalpi_entered';
ALTER TYPE "ProductActivityType" RENAME VALUE 'journal_book_selection_viewed' TO 'harugalpi_selection_viewed';
ALTER TYPE "ProductActivityType" RENAME VALUE 'journal_book_details_viewed' TO 'harugalpi_details_viewed';
ALTER TYPE "ProductActivityType" RENAME VALUE 'journal_book_preview_viewed' TO 'harugalpi_preview_viewed';
ALTER TYPE "ProductActivityType" RENAME VALUE 'journal_book_selection_exited' TO 'harugalpi_selection_exited';
ALTER TYPE "ProductActivityType" RENAME VALUE 'journal_book_details_exited' TO 'harugalpi_details_exited';
ALTER TYPE "ProductActivityType" RENAME VALUE 'journal_book_preview_exited' TO 'harugalpi_preview_exited';
ALTER TYPE "ProductActivityType" RENAME VALUE 'journal_book_completed' TO 'harugalpi_completed';
ALTER TYPE "ProductActivityType" RENAME VALUE 'journal_book_saved' TO 'harugalpi_saved';

-- 제품 관심 집계만 이전한다. 보안/권리 감사 로그와 서명 원장은 변경하지 않는다.
UPDATE system_logs SET action = 'harugalpi_purchase_clicked'
WHERE category = 'product' AND action = 'journal_book_purchase_clicked';
UPDATE system_logs SET metadata = jsonb_set(metadata, '{surface}', '"completed_harugalpi"'::jsonb)
WHERE category = 'product' AND metadata->>'surface' = 'completed_book';
