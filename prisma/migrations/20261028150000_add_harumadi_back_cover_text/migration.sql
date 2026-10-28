-- 기존 하루마디에는 원래 문구를 유지한다. 신규 생성은 서비스에서 한 번 선택한다.
ALTER TABLE "harumadis" ADD COLUMN "back_cover_text" TEXT NOT NULL DEFAULT '오늘 가능한 만큼만,';
