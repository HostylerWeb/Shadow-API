import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const startSchema = z
  .object({
    connector_id: z.string(),
    inputs: z.record(z.string(), z.unknown()).optional(),
    session_id: z.string().optional(),
    run_mode: z.enum(["live", "cached"]).optional(),
    idempotency_key: z.string().optional(),
  })
  .passthrough();

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function jsonResult(status: number, body: unknown, note?: string): ToolResult {
  const payload = note ? { note, ...(typeof body === "object" && body ? body : { body }) } : body;
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    isError: status >= 400,
  };
}

async function forward(
  app: FastifyInstance,
  authorization: string,
  method: "GET" | "POST" | "DELETE",
  url: string,
  payload?: unknown,
): Promise<{ status: number; body: unknown }> {
  const response = (await app.inject({
    method,
    url,
    headers: { authorization, "content-type": "application/json" },
    payload: payload as Record<string, unknown> | undefined,
  })) as LightMyRequestResponse;
  return { status: response.statusCode, body: response.json() };
}

export function createShadowMcp(app: FastifyInstance, authorization: string): McpServer {
  const mcp = new McpServer({ name: "shadowapi", version: "0.0.0" });

  mcp.registerTool(
    "shadow_start_workflow",
    {
      description:
        "Queue a connector job and return immediately. Poll shadow_get_job_status until result_ready or a terminal failure. Do not wait on this call for the browser run.",
      inputSchema: startSchema,
    },
    async (args) => {
      const allowed = new Set(["connector_id", "inputs", "session_id", "run_mode", "idempotency_key"]);
      const unknown = Object.keys(args).filter((key) => !allowed.has(key));
      if (unknown.length > 0) {
        return jsonResult(400, {
          failure: { code: "VALIDATION_ERROR", message: `Unknown field: ${unknown.join(", ")}` },
        });
      }
      const result = await forward(app, authorization, "POST", "/v1/jobs", args);
      return jsonResult(result.status, result.body);
    },
  );

  mcp.registerTool(
    "shadow_get_job_status",
    {
      description:
        "Read job status. Poll again until result_ready or a terminal status. If status is blocked, a human must fix access. Do not retry in a loop.",
      inputSchema: z.object({ job_id: z.string() }).strict(),
    },
    async ({ job_id }) => {
      const result = await forward(app, authorization, "GET", `/v1/jobs/${job_id}`);
      const body = result.body as { status?: string };
      const note =
        body.status === "blocked"
          ? "blocked: a human must fix access. Do not retry in a loop."
          : "Poll until result_ready or a terminal status. This call does not run the browser.";
      return jsonResult(result.status, result.body, note);
    },
  );

  mcp.registerTool(
    "shadow_get_job_result",
    {
      description: "Read outputs after result_ready. Same body as GET /v1/jobs/:id/result.",
      inputSchema: z.object({ job_id: z.string() }).strict(),
    },
    async ({ job_id }) => {
      const result = await forward(app, authorization, "GET", `/v1/jobs/${job_id}/result`);
      return jsonResult(result.status, result.body);
    },
  );

  mcp.registerTool(
    "shadow_cancel_job",
    {
      description: "Cancel a job that is not finished. Returns immediately.",
      inputSchema: z.object({ job_id: z.string() }).strict(),
    },
    async ({ job_id }) => {
      const result = await forward(app, authorization, "DELETE", `/v1/jobs/${job_id}`);
      return jsonResult(result.status, result.body);
    },
  );

  mcp.registerTool(
    "shadow_list_connectors",
    {
      description: "List connectors this API key may call. Returns immediately.",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const result = await forward(app, authorization, "GET", "/v1/connectors");
      return jsonResult(result.status, result.body);
    },
  );

  return mcp;
}

export function registerMcpRoute(app: FastifyInstance): void {
  app.post("/mcp", async (request, reply) => {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      return reply.code(401).send({
        failure: { code: "VALIDATION_ERROR", message: "Missing Bearer API key" },
      });
    }
    const mcp = createShadowMcp(app, authorization);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await mcp.connect(transport);
    reply.hijack();
    await transport.handleRequest(request.raw, reply.raw, request.body);
    reply.raw.on("close", () => {
      void transport.close();
      void mcp.close();
    });
  });
}
