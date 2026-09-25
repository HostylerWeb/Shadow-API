#!/usr/bin/env node
/**
 * Dev-only: clear stuck queued/running jobs so tests and TENANT_CONCURRENCY stay usable.
 * Requires DATABASE_URL in the environment.
 */
import { spawnSync } from "node:child_process";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = `
UPDATE jobs SET status = 'failed', failure_code = 'GRAPH_STEP_FAILED',
  failure_message = 'dev cleanup (stuck running)', updated_at = NOW(), completed_at = NOW()
WHERE status = 'running';
UPDATE jobs SET status = 'cancelled', updated_at = NOW(), completed_at = NOW()
WHERE status = 'queued';
`;

const result = spawnSync("psql", [url, "-c", sql], { encoding: "utf8" });
if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}
console.log("dev-clean-jobs: cleared running and queued job rows");
