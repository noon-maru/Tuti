CREATE TYPE "InquiryCategory" AS ENUM (
  'account',
  'service',
  'place',
  'privacy',
  'other'
);

CREATE TYPE "InquiryStatus" AS ENUM (
  'pending',
  'reviewing',
  'answered',
  'closed'
);

CREATE TABLE "customer_inquiries" (
  "id" TEXT NOT NULL,
  "requester_user_id" TEXT,
  "requester_email" TEXT,
  "category" "InquiryCategory" NOT NULL,
  "subject" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" "InquiryStatus" NOT NULL DEFAULT 'pending',
  "admin_response" TEXT,
  "handled_by_user_id" TEXT,
  "handled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "customer_inquiries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_inquiries_status_created_at_idx"
ON "customer_inquiries"("status", "created_at");

CREATE INDEX "customer_inquiries_requester_user_id_created_at_idx"
ON "customer_inquiries"("requester_user_id", "created_at");

CREATE INDEX "customer_inquiries_requester_email_idx"
ON "customer_inquiries"("requester_email");
