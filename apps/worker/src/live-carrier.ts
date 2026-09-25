import { createReadStream } from "node:fs";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import type { CarrierRun } from "@shadowapi/graph-runner";
import type { BrowserContextOptions } from "playwright-core";
import { storePod } from "./artifacts.js";
import { withJobContext } from "./browser.js";

const connectorDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../connectors/carrier_x_pod",
);

const GRAPH_VERSION = "v1.0.1-g2";

export function stagingTrackingUrl(stagingOrigin: string): string {
  const graph = JSON.parse(readFileSync(path.join(connectorDir, "graph.v1.0.1-g2.json"), "utf8")) as {
    steps: Array<{ type: string; url?: string }>;
  };
  const navigate = graph.steps.find((step) => step.type === "navigate");
  if (!navigate?.url) throw new Error("graph navigate url missing");
  const target = new URL(navigate.url);
  const origin = new URL(stagingOrigin);
  target.protocol = origin.protocol;
  target.host = origin.host;
  return target.toString();
}

export function startStagingMirror(): Promise<{ origin: string; close: () => Promise<void> }> {
  const htmlPath = path.join(connectorDir, "staging/tracking.html");
  const server: Server = createServer((req, res) => {
    if (req.url?.startsWith("/pod.bin")) {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end(Buffer.from("pod-bytes"));
      return;
    }
    if (req.url?.startsWith("/tracking")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      createReadStream(htmlPath).pipe(res);
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("staging mirror failed to bind"));
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((done, fail) => {
            server.close((err) => (err ? fail(err) : done()));
          }),
      });
    });
  });
}

export type LiveCarrierResult = CarrierRun & {
  storageState?: BrowserContextOptions["storageState"];
};

export async function runLiveCarrier(options: {
  trackingNumber: string;
  stagingOrigin: string;
  sessionId?: string | null;
  storageState?: BrowserContextOptions["storageState"];
  timeoutMs?: number;
  includePod?: boolean;
  tenantId?: string;
  jobId?: string;
}): Promise<LiveCarrierResult> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const url = stagingTrackingUrl(options.stagingOrigin);
  try {
    return await withJobContext(
      { sessionId: options.sessionId, storageState: options.storageState },
      async (context) => {
        const page = await context.newPage();
        page.setDefaultTimeout(timeoutMs);
        await page.goto(url, { timeout: timeoutMs });
        await page.fill("#tracking-input", options.trackingNumber);
        await page.click("#submit-btn");

        const challenge = page.locator("#challenge:not([hidden])");
        const gate = page.locator("#gate-failed:not([hidden])");
        const status = page.locator("#status");
        const winner = await Promise.race([
          challenge.waitFor({ state: "visible", timeout: timeoutMs }).then(() => "challenge" as const),
          gate.waitFor({ state: "visible", timeout: timeoutMs }).then(() => "gate" as const),
          status.waitFor({ state: "visible", timeout: timeoutMs }).then(() => "status" as const),
        ]);
        const storageState = await context.storageState();

        if (winner === "challenge") {
          return {
            jobStatus: "blocked" as const,
            failureCode: "CHALLENGE_REQUIRED",
            outputs: {},
            graphVersion: GRAPH_VERSION,
            storageState,
          };
        }
        if (winner === "gate") {
          return {
            jobStatus: "failed" as const,
            failureCode: "ARTIFACT_GATE_FAILED",
            outputs: {},
            graphVersion: GRAPH_VERSION,
            storageState,
          };
        }

        const text = (await status.textContent())?.trim() ?? "";
        if (!text) {
          return {
            jobStatus: "failed" as const,
            failureCode: "TARGET_TIMEOUT",
            outputs: {},
            graphVersion: GRAPH_VERSION,
            storageState,
          };
        }
        const outputs: Record<string, unknown> = { status: text };
        if (options.includePod && text === "DELIVERED" && options.tenantId && options.jobId) {
          const file = await page.request.get(new URL("/pod.bin", options.stagingOrigin).toString());
          const bytes = new Uint8Array(await file.body());
          outputs.document_blob_id = await storePod(options.tenantId, options.jobId, bytes);
        }
        return {
          jobStatus: "succeeded" as const,
          outputs,
          graphVersion: GRAPH_VERSION,
          storageState,
        };
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const timedOut = /timeout/i.test(message);
    return {
      jobStatus: "failed",
      failureCode: timedOut ? "TARGET_TIMEOUT" : "GRAPH_STEP_FAILED",
      outputs: {},
      graphVersion: GRAPH_VERSION,
    };
  }
}
