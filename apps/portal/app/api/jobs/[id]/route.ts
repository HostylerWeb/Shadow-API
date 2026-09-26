import { createDb } from "@shadowapi/db";
import { tenantJob } from "../../../../src/dashboard";
import { readSession } from "../../../../src/session";
import { cookies } from "next/headers";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = readSession((await cookies()).get("portal_session")?.value);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const handle = createDb(process.env.DATABASE_URL!);
  const job = await tenantJob(handle.db, session.tenantId, id);
  await handle.close();
  if (!job) return Response.json({ error: "not_found" }, { status: 404 });
  const outputs = job.outputs as Record<string, unknown> | null;
  const debug = outputs?._debug ?? null;
  return Response.json({
    status: job.status,
    failureCode: job.failureCode ?? null,
    failureMessage: job.failureMessage ?? null,
    hasOutputs: Boolean(job.outputs),
    debug,
  });
}
