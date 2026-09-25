import { createDb } from "@shadowapi/db";
import { listApiKeys } from "../../src/accounts";
import { createKeyAction, requireSession, revokeKeyAction } from "../actions";

export default async function KeysPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const session = await requireSession();
  const created = (await searchParams).created;
  const handle = createDb(process.env.DATABASE_URL!);
  const keys = await listApiKeys(handle.db, session.tenantId);
  await handle.close();
  return (
    <main>
      <h1>API keys</h1>
      <p>The full secret is shown once. Store it on your server. Do not put it in browser JavaScript.</p>
      {created ? (
        <p>
          New key (copy now): <code>{created}</code>
        </p>
      ) : null}
      <form action={createKeyAction}>
        <input name="name" placeholder="Key name" defaultValue="server" />
        <button type="submit">Create key</button>
      </form>
      <ul>
        {keys.map((key) => (
          <li key={key.id}>
            {key.name} · {key.keyPrefix}… {key.revokedAt ? "(revoked)" : ""}
            {key.revokedAt ? null : (
              <form action={revokeKeyAction}>
                <input type="hidden" name="id" value={key.id} />
                <button type="submit">Revoke</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
