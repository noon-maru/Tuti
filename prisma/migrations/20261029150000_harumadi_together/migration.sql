ALTER TABLE "harumadis" ADD COLUMN "access_revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "collaboration_started_at" TIMESTAMP(3);
ALTER TABLE "harumadi_entry_links" ADD COLUMN "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text;
CREATE UNIQUE INDEX "harumadi_entry_links_id_key" ON "harumadi_entry_links"("id");
CREATE TABLE "harumadi_members" (
  "id" TEXT PRIMARY KEY, "harumadi_id" TEXT NOT NULL, "user_id" TEXT NOT NULL,
  "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "ended_at" TIMESTAMP(3),
  CONSTRAINT "harumadi_members_harumadi_id_fkey" FOREIGN KEY ("harumadi_id") REFERENCES "harumadis"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "harumadi_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "harumadi_members_harumadi_id_user_id_key" ON "harumadi_members"("harumadi_id", "user_id");
CREATE INDEX "harumadi_members_user_id_ended_at_idx" ON "harumadi_members"("user_id", "ended_at");
CREATE TABLE "harumadi_invites" (
  "id" TEXT PRIMARY KEY, "harumadi_id" TEXT NOT NULL, "token_hash" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3), "accepted_at" TIMESTAMP(3), "accepted_by_user_id" TEXT,
  CONSTRAINT "harumadi_invites_harumadi_id_fkey" FOREIGN KEY ("harumadi_id") REFERENCES "harumadis"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "harumadi_invites_token_hash_key" ON "harumadi_invites"("token_hash");
CREATE INDEX "harumadi_invites_harumadi_id_created_at_idx" ON "harumadi_invites"("harumadi_id", "created_at");
CREATE TABLE "harumadi_comments" (
  "id" TEXT PRIMARY KEY, "harumadi_id" TEXT NOT NULL, "author_id" TEXT, "parent_id" TEXT,
  "body" TEXT NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "harumadi_comments_body_check" CHECK (char_length("body") <= 1000),
  CONSTRAINT "harumadi_comments_harumadi_id_fkey" FOREIGN KEY ("harumadi_id") REFERENCES "harumadis"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "harumadi_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "harumadi_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "harumadi_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "harumadi_comments_harumadi_id_parent_id_created_at_id_idx" ON "harumadi_comments"("harumadi_id", "parent_id", "created_at", "id");
CREATE INDEX "harumadi_comments_author_id_idx" ON "harumadi_comments"("author_id");
-- Erase comments without cascading other authors' replies. Original entries and
-- owned books already cascade; other exporters' PDF snapshots have no book FK.
CREATE FUNCTION tuti_erase_together_user() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE harumadi_comments SET body = '', author_id = NULL, deleted_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP, revision = revision + 1 WHERE author_id = OLD.id;
  UPDATE harumadis SET revision = revision + 1, access_revision = access_revision + 1,
    updated_at = CURRENT_TIMESTAMP WHERE owner_id <> OLD.id AND (
      EXISTS (SELECT 1 FROM harumadi_members m WHERE m.harumadi_id = harumadis.id AND m.user_id = OLD.id)
      OR EXISTS (SELECT 1 FROM harumadi_entry_links l JOIN journal_entries e ON e.id = l.entry_id WHERE l.harumadi_id = harumadis.id AND e.owner_id = OLD.id));
  UPDATE harumadi_invites SET accepted_by_user_id = NULL WHERE accepted_by_user_id = OLD.id;
  RETURN OLD;
END $$;
CREATE TRIGGER tuti_erase_together_user BEFORE DELETE ON users
FOR EACH ROW EXECUTE FUNCTION tuti_erase_together_user();
