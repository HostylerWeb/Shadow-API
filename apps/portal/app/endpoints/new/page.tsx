import Link from "next/link";
import { Breadcrumb } from "../../breadcrumb";
import { requireSession } from "../../actions";

export default async function NewEndpointPage() {
  await requireSession();
  return (
    <main className="customer-page">
      <Breadcrumb items={[{ href: "/endpoints", label: "My endpoints" }, { label: "New endpoint" }]} />
      <header className="page-head">
        <h1>New endpoint</h1>
        <p>Name it and give the page you want to turn into an API.</p>
      </header>
      <form className="card" action="/endpoints/new/record" method="get">
        <label>
          Name
          <input name="title" required placeholder="Support portal lookup" />
        </label>
        <label>
          What is this for?
          <textarea name="description" required rows={3} placeholder="So your team remembers what this API does" />
        </label>
        <label>
          Website URL
          <input name="url" type="url" required placeholder="https://shop.example.com" />
        </label>
        <button type="submit">Continue</button>
      </form>
      <p>
        <Link href="/endpoints">Cancel</Link>
      </p>
    </main>
  );
}
