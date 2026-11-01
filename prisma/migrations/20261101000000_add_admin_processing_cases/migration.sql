-- 번호는 DB 시퀀스로 발급한다. 중복은 없지만 롤백·실패 시 결번은 허용한다.
CREATE TABLE "admin_processing_cases" (
  "number" BIGSERIAL PRIMARY KEY,
  "subject_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "actor_user_id" TEXT NOT NULL,
  "purpose" TEXT NOT NULL CHECK ("purpose" IN ('support', 'incident', 'rights', 'security')),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "admin_processing_cases_subject_user_id_created_at_idx"
  ON "admin_processing_cases"("subject_user_id", "created_at");
