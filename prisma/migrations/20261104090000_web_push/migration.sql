-- 추가형 변경: 기존 앱 기기·전달 이력·삭제 연쇄를 그대로 재사용한다.
ALTER TYPE "PushPlatform" ADD VALUE IF NOT EXISTS 'web';
