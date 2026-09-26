import { cookies } from "next/headers";
import Link from "next/link";
import { createDb } from "@shadowapi/db";
import { MAX_CUSTOMER_KEYS, listApiKeys, userCreatedKeyCount } from "../../src/accounts";
import { createKeyAction, dismissKeyAction, requireSession, revealKeyAction, revokeKeyAction } from "../actions";
import { RevealKey } from "./reveal-key";

export default async function KeysPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireSession();
  const query = await searchParams;
  const created = (await cookies()).get("portal_key_once")?.value;
  const handle = createDb(process.env.DATABASE_URL!);
  const keys = await listApiKeys(handle.db, session.tenantId);
  const used = await userCreatedKeyCount(handle.db, session.tenantId);
  await handle.close();
  return (
    <main className="customer-page">
      <header className="page-head">
        <h1>API keys</h1>
        <p>
          Put a key on your server only. {used} of {MAX_CUSTOMER_KEYS} keys in use.{" "}
          <Link href="/docs">Example request</Link>
        </p>
      </header>
      {query.error === "reserved" ? <p className="banner">That name is reserved.</p> : null}
      {query.error === "limit" ? <p className="banner">Delete a key before creating another.</p> : null}
      {created ? (
        <div className="card">
          <p>
            Copy now: <code>{created}</code>
          </p>
          <form action={dismissKeyAction}>
            <button type="submit">I copied it</button>
          </form>
        </div>
      ) : null}
      {used >= MAX_CUSTOMER_KEYS ? null : (
        <form action={createKeyAction} className="filters">
          <input name="name" placeholder="Key name" defaultValue="production" />
          <button type="submit">Create key</button>
        </form>
      )}
      <ul className="key-list">
        {keys.length === 0 ? <li className="card empty-state">No keys yet. Create one when you are ready to call an endpoint from code.</li> : null}
        {keys.map((key) => (
          <li key={key.id}>
            <RevealKey
              keyId={key.id}
              name={key.name}
              prefix={key.keyPrefix}
              canReveal={Boolean(key.hasSecret)}
              reveal={revealKeyAction}
            />
            <form action={revokeKeyAction}>
              <input type="hidden" name="id" value={key.id} />
              <button type="submit" className="btn-ghost">
                Delete
              </button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
