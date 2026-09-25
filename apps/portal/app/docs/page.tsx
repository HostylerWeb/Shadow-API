import { quickstartText } from "../../src/accounts";
import { requireSession } from "../actions";

export default async function DocsPage() {
  await requireSession();
  const text = quickstartText();
  return (
    <main>
      <h1>Quickstart</h1>
      <pre>{text}</pre>
    </main>
  );
}
