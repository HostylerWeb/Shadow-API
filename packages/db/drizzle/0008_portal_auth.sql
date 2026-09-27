ALTER TABLE "portal_users" ADD COLUMN IF NOT EXISTS "email_verified" boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS "portal_password_resets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "portal_users"("id") ON DELETE cascade,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "portal_password_resets_token_hash_idx" ON "portal_password_resets" ("token_hash");
