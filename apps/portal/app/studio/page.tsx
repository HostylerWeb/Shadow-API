import Link from "next/link";
import { requireSession } from "../actions";
import { studioBrowserConfigured } from "../../src/studio-token";

export default async function StudioHubPage() {
  await requireSession();
  const camoufox = studioBrowserConfigured();
  return (
    <main className="customer-page">
      <h1>Studio</h1>
      <p className="muted">Author connectors with Camoufox (live browser) or the legacy iframe teach flow.</p>
      <ul className="card-list">
        <li className="card">
          <h2>Teach a new endpoint</h2>
          <p>Record inputs, outputs, and publish a tenant API.</p>
          <Link className="btn-primary" href="/endpoints/new">New endpoint</Link>
        </li>
        <li className="card">
          <h2>Camoufox studio</h2>
          <p>
            {camoufox
              ? "STUDIO_BROWSER_URL is configured — the record screen uses embedded Camoufox."
              : "Set STUDIO_BROWSER_URL and STUDIO_BROWSER_SECRET, run pnpm dev:studio-browser, then teach on the record screen."}
          </p>
        </li>
        <li className="card">
          <h2>My endpoints</h2>
          <Link href="/endpoints">View published endpoints</Link>
        </li>
      </ul>
    </main>
  );
}
