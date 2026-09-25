import { createDb } from "@shadowapi/db";
import { authorIsActive, loadPortalUser } from "../../src/accounts";
import { publishStudioAction, requireSession } from "../actions";
import { redirect } from "next/navigation";

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ published?: string; error?: string }> }) {
  const session = await requireSession();
  const query = await searchParams;
  const handle = createDb(process.env.DATABASE_URL!);
  const user = await loadPortalUser(handle.db, session.userId);
  await handle.close();
  if (!user || !authorIsActive(user.role, user.authorUntil)) redirect("/keys");
  return (
    <main>
      <h1>Studio</h1>
      <p>Record two URLs. Publish stores one connector. The steps stay inside the graph.</p>
      {query.published ? <p>Published studio_tracking. Call POST /v1/jobs with that connector id.</p> : null}
      {query.error ? <p>Publish refused. Staging replay did not pass.</p> : null}
      <form action={publishStudioAction}>
        <label>
          First URL
          <input name="url1" required defaultValue="https://staging.local/tracking" />
        </label>
        <label>
          Second URL
          <input name="url2" required defaultValue="https://staging.local/tracking?tracking=123" />
        </label>
        <label>
          Pattern
          <select name="pattern" defaultValue="P2">
            <option value="P1">P1 same page</option>
            <option value="P2">P2 query</option>
            <option value="P3">P3 path</option>
          </select>
        </label>
        <label>
          Input
          <input name="inputName" defaultValue="tracking_number" />
        </label>
        <label>
          Output
          <input name="outputName" defaultValue="status" />
        </label>
        <button type="submit">Publish</button>
      </form>
    </main>
  );
}
