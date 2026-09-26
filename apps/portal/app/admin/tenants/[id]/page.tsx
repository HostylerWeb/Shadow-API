import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createDb } from "@shadowapi/db";
import { adminTenant, requireAdmin } from "../../../../src/admin";
import { adminDeleteTenantAction, adminPlanAction, adminRevokeKeyAction, adminRoleAction, requireSession } from "../../../actions";

export default async function AdminTenantPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const handle = createDb(process.env.DATABASE_URL!);
  const admin = await requireAdmin(handle.db, session.userId);
  if (!admin) {
    await handle.close();
    redirect("/endpoints");
  }
  const detail = await adminTenant(handle.db, id);
  await handle.close();
  if (!detail) notFound();
  const own = detail.tenant.id === admin.tenantId;
  return (
    <main className="admin-page">
      <header className="page-head">
        <h1>{detail.user?.email ?? detail.tenant.name}</h1>
        <p>
          <Link href="/admin/tenants">Tenants</Link>
        </p>
      </header>
      <section className="card">
        <p>Plan: {detail.tenant.plan}</p>
        <p>Role: {detail.user?.role ?? "none"}</p>
        {detail.user?.authorUntil ? <p>Author until: {detail.user.authorUntil.toISOString()}</p> : null}
        <form action={adminPlanAction} className="inline">
          <input type="hidden" name="tenantId" value={detail.tenant.id} />
          <input type="hidden" name="next" value="detail" />
          <select name="plan" defaultValue={detail.tenant.plan}>
            <option value="developer">developer</option>
            <option value="agency">agency</option>
            <option value="enterprise">enterprise</option>
          </select>
          <button type="submit">Save plan</button>
        </form>
        {own ? <p>This is your admin account. Role and deletion stay locked.</p> : null}
        {own ? null : (
          <form action={adminRoleAction} className="inline">
            <input type="hidden" name="tenantId" value={detail.tenant.id} />
            <select name="role" defaultValue={detail.user?.role === "author" ? "author" : "catalog"}>
              <option value="catalog">catalog</option>
              <option value="author">author for 24 hours</option>
            </select>
            <button type="submit">Save role</button>
          </form>
        )}
      </section>
      <section className="card">
        <h2>API keys</h2>
        <p>Prefixes only. The portal key stays so the customer dashboard can keep calling the API.</p>
        <ul>
          {detail.keys.map((key) => (
            <li key={key.id}>
              {key.name} · {key.keyPrefix}… {key.revokedAt ? "(revoked)" : ""}
              {!key.revokedAt && key.name !== "dashboard" ? (
                <form action={adminRevokeKeyAction} className="inline">
                  <input type="hidden" name="tenantId" value={detail.tenant.id} />
                  <input type="hidden" name="id" value={key.id} />
                  <button type="submit">Revoke</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      <section className="card">
        <h2>Sessions</h2>
        {detail.sessions.length === 0 ? <p>No saved sessions.</p> : null}
        <ul>
          {detail.sessions.map((row) => (
            <li key={`${row.connectorId}-${row.sessionId}`}>
              {row.connectorId} · {row.sessionId} · generation {row.sessionGeneration}
            </li>
          ))}
        </ul>
      </section>
      <section className="card">
        <h2>Recent jobs</h2>
        <ul>
          {detail.recent.map((job) => (
            <li key={job.id}>
              <Link href={`/admin/jobs/${job.id}`}>
                {job.connectorId} · {job.status}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      {own ? null : (
        <form action={adminDeleteTenantAction}>
          <input type="hidden" name="tenantId" value={detail.tenant.id} />
          <button type="submit">Delete tenant</button>
        </form>
      )}
    </main>
  );
}
