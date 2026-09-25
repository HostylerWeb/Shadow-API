// WORKER_COUNT is how many worker processes to run. Raise it when the queue grows.
import { spawn } from "node:child_process";

const count = Number(process.env.WORKER_COUNT ?? 1);
const children = Array.from({ length: count }, () =>
  spawn("pnpm", ["--filter", "@shadowapi/worker", "dev"], {
    stdio: "inherit",
    env: process.env,
  }),
);

function stop() {
  for (const child of children) child.kill("SIGTERM");
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
