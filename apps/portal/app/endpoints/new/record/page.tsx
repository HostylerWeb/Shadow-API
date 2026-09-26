import { redirect } from "next/navigation";
import { Breadcrumb } from "../../../breadcrumb";
import { publishEndpointAction, requireSession } from "../../../actions";
import { SiteBrowser } from "./site-browser";

export default async function RecordEndpointPage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string; description?: string; url?: string; error?: string }>;
}) {
  await requireSession();
  const query = await searchParams;
  const title = query.title?.trim() ?? "";
  const description = query.description?.trim() ?? "";
  const url = query.url?.trim() ?? "";
  if (!title || !description || !url) redirect("/endpoints/new");
  return (
    <main className="customer-page customer-page-teach">
      <Breadcrumb items={[{ href: "/endpoints", label: "My endpoints" }, { href: "/endpoints/new", label: "New endpoint" }, { label: title }]} />
      <SiteBrowser
        action={publishEndpointAction}
        title={title}
        description={description}
        url={url}
        showError={Boolean(query.error)}
      />
    </main>
  );
}
