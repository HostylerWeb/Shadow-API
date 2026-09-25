import { spawn } from "node:child_process";

const ports = [3000, 3010];
const children = ports.map((port) =>
  spawn("pnpm", ["--filter", "@shadowapi/gateway", "dev"], {
    stdio: "inherit",
    env: { ...process.env, GATEWAY_PORT: String(port) },
  }),
);

function stop() {
  for (const child of children) child.kill("SIGTERM");
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
