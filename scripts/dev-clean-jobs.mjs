#!/usr/bin/env node
/**
 * Dev-only: clear stuck queued/running jobs so tests and TENANT_CONCURRENCY stay usable.
 * Requires DATABASE_URL in the environment.
 */
import { createDb } from "@shadowapi/db";
import { sql } from "drizzle-orm";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const { db, close } = createDb(url);
const running = await db.execute(sql`
  UPDATE jobs SET status = 'failed', failure_code = 'GRAPH_STEP_FAILED',
    failure_message = 'dev cleanup (stuck running)', updated_at = NOW(), completed_at = NOW()
  WHERE status = 'running'
`);
const queued = await db.execute(sql`
  UPDATE jobs SET status = 'cancelled', updated_at = NOW(), completed_at = NOW()
  WHERE status = 'queued'
`);
console.log("dev-clean-jobs: cleared running and queued job rows");
await close();
