import Link from "next/link";
import { cookies } from "next/headers";
import { createDb } from "@shadowapi/db";
import { authorIsActive, loadPortalUser } from "../src/accounts";
import { readSession } from "../src/session";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get("portal_session")?.value;
  const session = readSession(token);
  let showStudio = false;
  if (session && process.env.DATABASE_URL) {
    const handle = createDb(process.env.DATABASE_URL);
    const user = await loadPortalUser(handle.db, session.userId);
    showStudio = Boolean(user && authorIsActive(user.role, user.authorUntil));
    await handle.close();
  }
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", margin: "2rem", maxWidth: 720 }}>
        <header style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
          <strong>ShadowAPI portal</strong>
          {session ? (
            <>
              <Link href="/keys">Keys</Link>
              <Link href="/catalog">Catalog</Link>
              <Link href="/docs">Quickstart</Link>
              <Link href="/usage">Usage</Link>
              {showStudio ? <Link href="/studio">Studio</Link> : null}
              {showStudio ? <Link href="/repairs">Repairs</Link> : null}
            </>
          ) : (
            <>
              <Link href="/login">Sign in</Link>
              <Link href="/signup">Sign up</Link>
            </>
          )}
        </header>
        {children}
      </body>
    </html>
  );
}
