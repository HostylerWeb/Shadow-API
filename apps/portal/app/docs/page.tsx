import Link from "next/link";
import { requireSession } from "../actions";

export default async function DocsPage() {
  await requireSession();
  const base = process.env.GATEWAY_URL ?? "http://localhost:3000";
  return (
    <main className="customer-page docs">
      <header className="page-head">
        <h1>Call your endpoint from code</h1>
        <p>Use an API key on your server. Replace the connector id and field names with yours from My endpoints.</p>
      </header>
      <section className="card">
        <h2>Start</h2>
        <pre>{`curl -s -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \\
  -d '{"connector_id":"custom_your_name","inputs":{"your_field":"value"}}' \\
  ${base}/v1/jobs`}</pre>
      </section>
      <section className="card">
        <h2>Wait, then read the result</h2>
        <pre>{`curl -s -H "Authorization: Bearer $API_KEY" ${base}/v1/jobs/REQUEST_ID
curl -s -H "Authorization: Bearer $API_KEY" ${base}/v1/jobs/REQUEST_ID/result`}</pre>
      </section>
      <p>
        <Link href="/keys">API keys</Link> · <Link href="/endpoints">My endpoints</Link>
      </p>
    </main>
  );
}
