export function WorkflowDefinition({ url, title }: { url: string; title: string }) {
  return (
    <section className="card workflow-definition">
      <h2>What ShadowAPI learns on this screen</h2>
      <p>
        You teach <strong>{title}</strong> inside the embedded browser — not by pasting URLs into a technical form. Browse
        the real site starting at{" "}
        <code className="inline-url">{trimUrl(url)}</code>, label each page, then click the fields you want in the API.
      </p>
      <ol className="teach-steps">
        <li>Browse until you see the answers you care about.</li>
        <li>When a new page loads, tell us what that page is for (start, search, or results).</li>
        <li>On the result page, click a row and each field — we build the JSON from your clicks.</li>
        <li>Review the live preview beside the page, then publish. Jobs replay in Camoufox on our servers.</li>
      </ol>
    </section>
  );
}

function trimUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.host}${path}${parsed.search}`;
  } catch {
    return raw;
  }
}
