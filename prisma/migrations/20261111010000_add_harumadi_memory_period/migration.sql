ALTER TABLE "harumadis"
  ADD COLUMN "period_start" DATE,
  ADD COLUMN "period_end" DATE,
  ADD CONSTRAINT "harumadi_memory_period_pair" CHECK (
    ("period_start" IS NULL AND "period_end" IS NULL) OR
    ("period_start" IS NOT NULL AND "period_end" IS NOT NULL AND "period_start" <= "period_end"
      AND "period_start" >= DATE '0001-01-01' AND "period_end" <= DATE '9999-12-31')
  );
-- Existing books stay undated; this range never expires writing or membership.
