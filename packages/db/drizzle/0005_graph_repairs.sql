CREATE TABLE "graph_repairs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid,
  "tenant_id" uuid NOT NULL,
  "connector_id" text NOT NULL,
  "connector_version" text NOT NULL,
  "last_good_graph_version" text NOT NULL,
  "accessibility_snapshot" text NOT NULL,
  "proposed_diff" jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "graph_repairs" ADD CONSTRAINT "graph_repairs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "graph_repairs" ADD CONSTRAINT "graph_repairs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "graph_repairs_tenant_status_idx" ON "graph_repairs" USING btree ("tenant_id","status");
