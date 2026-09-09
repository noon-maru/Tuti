CREATE TABLE "journal_books" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "entry_ids" TEXT[] NOT NULL,
    "object_key" TEXT NOT NULL,
    "page_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_books_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "journal_books_object_key_key" ON "journal_books"("object_key");
CREATE INDEX "journal_books_owner_id_created_at_idx" ON "journal_books"("owner_id", "created_at");

ALTER TABLE "journal_books"
ADD CONSTRAINT "journal_books_owner_id_fkey"
FOREIGN KEY ("owner_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
