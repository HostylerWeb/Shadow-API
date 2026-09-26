import { notFound } from "next/navigation";
import { createDb } from "@shadowapi/db";
import { publishEndpointAction, requireSession } from "../../../actions";
import { getTenantConnector } from "../../../../src/dashboard";
import { draftFromManifest } from "../../../../src/teach/saved-draft";
import { Breadcrumb } from "../../../breadcrumb";
import { SiteBrowser } from "../../new/record/site-browser";

export default async function EditEndpointPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const handle = createDb(process.env.DATABASE_URL!);
  const row = await getTenantConnector(handle.db, session.tenantId, id);
  await handle.close();
  if (!row) notFound();
  const manifest = row.manifest as Record<string, unknown>;
  const title = typeof manifest.title === "string" ? manifest.title : id;
  const description = typeof manifest.description === "string" ? manifest.description : "";
  const url = typeof manifest.start_url === "string" ? manifest.start_url : "";
  const saved = draftFromManifest(id, manifest);
  if (!url || !saved) notFound();
  return (
    <main className="customer-page customer-page-teach">
      <Breadcrumb items={[{ href: "/endpoints", label: "My endpoints" }, { label: title }]} />
      <SiteBrowser
        action={publishEndpointAction}
        title={title}
        description={description}
        url={url}
        saved={saved}
      />
    </main>
  );
}
