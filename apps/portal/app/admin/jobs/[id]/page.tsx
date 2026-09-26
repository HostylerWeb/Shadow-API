import { notFound, redirect } from "next/navigation";
import { createDb } from "@shadowapi/db";
import { jobs } from "@shadowapi/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../../../../src/admin";
import { adminCancelJobAction, requireSession } from "../../../actions";

export default async function AdminJobPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const handle = createDb(process.env.DATABASE_URL!);
  if (!(await requireAdmin(handle.db, session.userId))) {
    await handle.close();
    redirect("/endpoints");
  }
  const job = (await handle.db.select().from(jobs).where(eq(jobs.id, id)).limit(1))[0];
  await handle.close();
  if (!job) notFound();
  return (
    <main>
      <h1>{job.status}</h1>
      <p>{job.connectorId}</p>
      {job.failureCode ? (
        <p>
          {job.failureCode}: {job.failureMessage}
        </p>
      ) : null}
      <pre>{JSON.stringify(job.outputs, null, 2)}</pre>
      {job.status === "queued" || job.status === "running" ? (
        <form action={adminCancelJobAction}>
          <input type="hidden" name="id" value={job.id} />
          <button type="submit">Cancel job</button>
        </form>
      ) : null}
    </main>
  );
}
