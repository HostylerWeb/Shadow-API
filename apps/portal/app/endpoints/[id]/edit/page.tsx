import { notFound, redirect } from "next/navigation";
import { createDb } from "@shadowapi/db";
import { listUserEndpoints } from "../../../../src/accounts";
import { requireSession } from "../../../actions";

export default async function EditEndpointPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const handle = createDb(process.env.DATABASE_URL!);
  const row = (await listUserEndpoints(handle.db, session.tenantId)).find((item) => item.connectorId === id);
  await handle.close();
  if (!row) notFound();
  redirect(
    `/endpoints/new/record?title=${encodeURIComponent(row.title)}&description=${encodeURIComponent(row.description)}&url=${encodeURIComponent(row.startUrl)}`,
  );
}
