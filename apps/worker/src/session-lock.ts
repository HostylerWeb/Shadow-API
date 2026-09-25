import { randomBytes } from "node:crypto";
import type { Redis } from "ioredis";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withSessionLock<T>(
  redis: Redis,
  lockKey: string,
  mode: "exclusive" | "read_shared" | "none",
  run: () => Promise<T>,
): Promise<T> {
  if (mode === "none") return run();

  if (mode === "read_shared") {
    const readers = `${lockKey}:readers`;
    const deadline = Date.now() + 5_000;
    while ((await redis.get(lockKey)) && Date.now() < deadline) await sleep(40);
    await redis.incr(readers);
    await redis.pexpire(readers, 30_000);
    try {
      return await run();
    } finally {
      await redis.decr(readers);
    }
  }

  const token = randomBytes(8).toString("hex");
  const deadline = Date.now() + 5_000;
  let acquired = false;
  while (Date.now() < deadline) {
    const ok = await redis.set(lockKey, token, "PX", 30_000, "NX");
    if (ok === "OK") {
      acquired = true;
      break;
    }
    await sleep(40);
  }
  if (!acquired) throw new Error("SESSION_LOCK_TIMEOUT");
  try {
    return await run();
  } finally {
    if ((await redis.get(lockKey)) === token) await redis.del(lockKey);
  }
}
