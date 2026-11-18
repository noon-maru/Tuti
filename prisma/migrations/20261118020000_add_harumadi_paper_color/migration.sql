-- 기존 본문·표지·저장된 PDF는 변경하지 않는다. 속지는 흰색을 기본값으로 한다.
BEGIN;
ALTER TABLE "harumadis" ADD COLUMN "paper_color" TEXT NOT NULL DEFAULT 'white';
ALTER TABLE "harumadis" ADD CONSTRAINT "harumadis_paper_color_check"
  CHECK ("paper_color" IN ('white', 'ivory', 'green', 'blue', 'pink', 'lavender'));
ALTER TABLE "harumadis" DROP CONSTRAINT "harumadis_cover_style_check";
ALTER TABLE "harumadis" ADD CONSTRAINT "harumadis_cover_style_check" CHECK (
  "cover_style" IN ('white-plain','white-image','green-plain','green-image',
    'blue-plain','blue-image','peach-plain','peach-image','pink-plain','pink-image','lavender-plain','lavender-image')
);
ALTER TABLE "harumadi_pdfs" DROP CONSTRAINT "harumadi_pdf_cover_style_check";
ALTER TABLE "harumadi_pdfs" ADD CONSTRAINT "harumadi_pdf_cover_style_check" CHECK (
  "cover_style" IS NULL OR "cover_style" IN ('white-plain','white-image','green-plain','green-image',
    'blue-plain','blue-image','peach-plain','peach-image','pink-plain','pink-image','lavender-plain','lavender-image')
);
COMMIT;
