ALTER TABLE "portal_users" ADD COLUMN "role" text DEFAULT 'catalog' NOT NULL;
ALTER TABLE "portal_users" ADD COLUMN "author_until" timestamp with time zone;
