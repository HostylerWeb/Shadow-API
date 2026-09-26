import Link from "next/link";
import { redirect } from "next/navigation";
import { createDb } from "@shadowapi/db";
import { PAGE_SIZE, adminTenants, requireAdmin } from "../../../src/admin";
import { adminPlanAction, requireSession } from "../../actions";
import { Pager } from "../../pager";

export default async function AdminTenantsPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const session = await requireSession();
  const query = await searchParams;
  const page = Number(query.page ?? 1) || 1;
  const q = query.q ?? "";
  const handle = createDb(process.env.DATABASE_URL!);
  if (!(await requireAdmin(handle.db, session.userId))) {
    await handle.close();
    redirect("/endpoints");
  }
  const { rows, total } = await adminTenants(handle.db, page, q);
  await handle.close();
  return (
    <main className="admin-page">
      <header className="page-head">
        <h1>Tenants</h1>
        <p>Each row is one customer account. Changing the plan changes their live-run cap.</p>
      </header>
      <form className="filters" action="/admin/tenants">
        <input name="q" defaultValue={q} placeholder="Search email" />
        <button type="submit">Filter</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Plan</th>
            <th>Live runs</th>
            <th>Change plan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.name}</td>
              <td>
                <Link href={`/admin/tenants/${row.id}`}>{row.email ?? row.name}</Link>
              </td>
              <td>{row.plan}</td>
              <td>{row.liveRuns}</td>
              <td>
                <form action={adminPlanAction} className="inline">
                  <input type="hidden" name="tenantId" value={row.id} />
                  <select name="plan" defaultValue={row.plan ?? "developer"}>
                    <option value="developer">developer</option>
                    <option value="agency">agency</option>
                    <option value="enterprise">enterprise</option>
                  </select>
                  <button type="submit">Save</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager page={page} total={total} pageSize={PAGE_SIZE} href={(n) => `/admin/tenants?page=${n}&q=${encodeURIComponent(q)}`} />
    </main>
  );
}
