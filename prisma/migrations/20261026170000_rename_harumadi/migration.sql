-- 이미 적용된 이름 변경 이력을 보존하며 최종 명칭으로 이전한다. 행과 객체 키는 보존한다.
ALTER TABLE harugalpi_pdfs RENAME TO harumadi_pdfs;
ALTER TABLE harumadi_pdfs RENAME CONSTRAINT harugalpi_pdfs_pkey TO harumadi_pdfs_pkey;
ALTER TABLE harumadi_pdfs RENAME CONSTRAINT harugalpi_pdfs_owner_id_fkey TO harumadi_pdfs_owner_id_fkey;
ALTER TABLE harumadi_pdfs RENAME CONSTRAINT harugalpi_pdf_cover_style_check TO harumadi_pdf_cover_style_check;
ALTER TABLE harumadi_pdfs RENAME CONSTRAINT harugalpi_pdf_cover_thumbnail_check TO harumadi_pdf_cover_thumbnail_check;
ALTER INDEX harugalpi_pdfs_object_key_key RENAME TO harumadi_pdfs_object_key_key;
ALTER INDEX harugalpi_pdfs_owner_id_created_at_idx RENAME TO harumadi_pdfs_owner_id_created_at_idx;
ALTER TABLE harugalpis RENAME TO harumadis;
ALTER TABLE harumadis RENAME CONSTRAINT harugalpis_pkey TO harumadis_pkey;
ALTER TABLE harumadis RENAME CONSTRAINT harugalpis_owner_id_fkey TO harumadis_owner_id_fkey;
ALTER TABLE harumadis RENAME CONSTRAINT harugalpis_title_check TO harumadis_title_check;
ALTER TABLE harumadis RENAME CONSTRAINT harugalpis_cover_style_check TO harumadis_cover_style_check;
ALTER TABLE harumadis RENAME CONSTRAINT harugalpis_inner_style_check TO harumadis_inner_style_check;
ALTER TABLE harumadis RENAME CONSTRAINT harugalpis_revision_check TO harumadis_revision_check;
ALTER INDEX harugalpis_owner_id_created_at_idx RENAME TO harumadis_owner_id_created_at_idx;
ALTER TABLE harugalpi_entry_links RENAME TO harumadi_entry_links;
ALTER TABLE harumadi_entry_links RENAME COLUMN harugalpi_id TO harumadi_id;
ALTER TABLE harumadi_entry_links RENAME CONSTRAINT harugalpi_entry_links_pkey TO harumadi_entry_links_pkey;
ALTER TABLE harumadi_entry_links RENAME CONSTRAINT harugalpi_entry_links_harugalpi_id_fkey TO harumadi_entry_links_harumadi_id_fkey;
ALTER TABLE harumadi_entry_links RENAME CONSTRAINT harugalpi_entry_links_entry_id_fkey TO harumadi_entry_links_entry_id_fkey;
ALTER INDEX harugalpi_entry_links_entry_id_idx RENAME TO harumadi_entry_links_entry_id_idx;
ALTER TYPE "ProductActivityType" RENAME VALUE 'harugalpi_entered' TO 'harumadi_entered';
ALTER TYPE "ProductActivityType" RENAME VALUE 'harugalpi_selection_viewed' TO 'harumadi_selection_viewed';
ALTER TYPE "ProductActivityType" RENAME VALUE 'harugalpi_details_viewed' TO 'harumadi_details_viewed';
ALTER TYPE "ProductActivityType" RENAME VALUE 'harugalpi_preview_viewed' TO 'harumadi_preview_viewed';
ALTER TYPE "ProductActivityType" RENAME VALUE 'harugalpi_selection_exited' TO 'harumadi_selection_exited';
ALTER TYPE "ProductActivityType" RENAME VALUE 'harugalpi_details_exited' TO 'harumadi_details_exited';
ALTER TYPE "ProductActivityType" RENAME VALUE 'harugalpi_preview_exited' TO 'harumadi_preview_exited';
ALTER TYPE "ProductActivityType" RENAME VALUE 'harugalpi_completed' TO 'harumadi_completed';
ALTER TYPE "ProductActivityType" RENAME VALUE 'harugalpi_saved' TO 'harumadi_saved';

UPDATE system_logs SET action = 'harumadi_purchase_clicked' WHERE category = 'product' AND action = 'harugalpi_purchase_clicked';
UPDATE system_logs SET metadata = jsonb_set(metadata, '{surface}', '"completed_harumadi"'::jsonb) WHERE category = 'product' AND metadata->>'surface' = 'completed_harugalpi';

