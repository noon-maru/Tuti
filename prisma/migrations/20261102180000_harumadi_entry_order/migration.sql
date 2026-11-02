-- 미지정 연결은 기존 날짜순을 유지한다. 새로 담은 마디는 지정 순서 뒤에 놓는다.
ALTER TABLE "harumadi_entry_links" ADD COLUMN "position" INTEGER;
ALTER TABLE "harumadi_entry_links" ADD CONSTRAINT "harumadi_entry_position_nonnegative"
  CHECK ("position" IS NULL OR "position" >= 0);
CREATE INDEX "harumadi_entry_links_harumadi_id_position_idx"
  ON "harumadi_entry_links"("harumadi_id", "position");
