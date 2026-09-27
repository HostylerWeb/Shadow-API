import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { verifyStudioToken } from "./auth.js";
import { closeSession, createSession, getSession } from "./sessions.js";

const host = process.env.STUDIO_BROWSER_HOST ?? "0.0.0.0";
const port = Number(process.env.STUDIO_BROWSER_PORT ?? "3020");

const app = Fastify({ logger: true });
await app.register(websocket);

function bearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

app.get("/health", async () => ({ ok: true, service: "studio-browser" }));

app.post<{ Body: { startUrl: string; storageStateJson?: string } }>("/v1/sessions", async (request, reply) => {
  const token = bearerToken(request.headers.authorization);
  if (!token) return reply.code(401).send({ error: "unauthorized" });
  const claims = verifyStudioToken(token);
  if (!claims) return reply.code(401).send({ error: "invalid_token" });
  const startUrl = request.body?.startUrl;
  if (!startUrl || typeof startUrl !== "string") {
    return reply.code(400).send({ error: "startUrl required" });
  }
  try {
    const session = await createSession(
      claims.tenantId,
      claims.userId,
      startUrl,
      request.body.storageStateJson,
    );
    return {
      sessionId: session.id,
      wsUrl: `/v1/sessions/${session.id}/ws`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "session_failed";
    return reply.code(503).send({ error: message });
  }
});

app.delete<{ Params: { id: string } }>("/v1/sessions/:id", async (request, reply) => {
  const token = bearerToken(request.headers.authorization);
  const claims = token ? verifyStudioToken(token) : null;
  if (!claims) return reply.code(401).send({ error: "unauthorized" });
  await closeSession(request.params.id, claims.tenantId);
  return { ok: true };
});

app.get<{ Params: { id: string } }>(
  "/v1/sessions/:id/ws",
  { websocket: true },
  (socket, request) => {
    const query = request.query as { token?: string };
    const token = query.token;
    const claims = typeof token === "string" ? verifyStudioToken(token) : null;
    if (!claims) {
      socket.close(4401, "unauthorized");
      return;
    }
    const session = getSession(request.params.id, claims.tenantId);
    if (!session) {
      socket.close(4404, "not_found");
      return;
    }
    const page = session.page;
    let closed = false;

    const pushFrame = async () => {
      if (closed) return;
      try {
        const buffer = await page.screenshot({ type: "jpeg", quality: 60 });
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({ type: "frame", data: buffer.toString("base64") }));
        }
      } catch {
        /* page may be navigating */
      }
    };

    const interval = setInterval(() => void pushFrame(), 500);
    void pushFrame();

    socket.on("message", (raw) => {
      void (async () => {
        try {
          const msg = JSON.parse(String(raw)) as {
            type: string;
            x?: number;
            y?: number;
            text?: string;
            key?: string;
            url?: string;
          };
          if (msg.type === "click" && typeof msg.x === "number" && typeof msg.y === "number") {
            await page.mouse.click(msg.x, msg.y);
          } else if (msg.type === "type" && typeof msg.text === "string") {
            await page.keyboard.type(msg.text);
          } else if (msg.type === "key" && typeof msg.key === "string") {
            await page.keyboard.press(msg.key);
          } else if (msg.type === "navigate" && typeof msg.url === "string") {
            await page.goto(msg.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
          } else if (msg.type === "eval" && typeof msg.text === "string") {
            const result = await page.evaluate((expr) => {
              // eslint-disable-next-line no-eval
              return eval(expr);
            }, msg.text);
            socket.send(JSON.stringify({ type: "eval_result", result }));
          }
          session.lastActive = Date.now();
        } catch (err) {
          socket.send(JSON.stringify({ type: "error", message: err instanceof Error ? err.message : String(err) }));
        }
      })();
    });

    socket.on("close", () => {
      closed = true;
      clearInterval(interval);
    });
  },
);

await app.listen({ host, port });
console.log(`studio-browser listening on http://${host}:${port}`);
