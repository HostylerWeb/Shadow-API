import { loadCatalog } from "../../src/accounts";
import { requireSession } from "../actions";

export default async function CatalogPage() {
  await requireSession();
  const catalog = loadCatalog();
  return (
    <main>
      <h1>{catalog.id}</h1>
      <p>{catalog.summary}</p>
      <h2>You send</h2>
      <ul>
        {catalog.inputs.map((field) => (
          <li key={field.name}>
            <code>{field.name}</code> ({field.type}
            {field.required ? ", required" : ""}): {field.plain}
          </li>
        ))}
      </ul>
      <h2>You get back</h2>
      <ul>
        {catalog.outputs.map((field) => (
          <li key={field.name}>
            <code>{field.name}</code>: {field.plain}
          </li>
        ))}
      </ul>
    </main>
  );
}
