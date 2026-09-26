import Link from "next/link";
import { signOutAction } from "./actions";

const customerLinks = [
  { href: "/endpoints", label: "My endpoints" },
  { href: "/jobs", label: "Activity" },
  { href: "/keys", label: "API keys" },
  { href: "/usage", label: "Plan" },
] as const;

export function Shell({
  title,
  plan,
  author,
  admin,
  children,
}: {
  title: string;
  plan?: string;
  author?: boolean;
  admin?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={admin ? "shell admin-shell" : "shell"}>
      <aside className="side">
        <p className="brand">{admin ? "Admin" : "ShadowAPI"}</p>
        <p className="who">{title}</p>
        {plan ? <p className="who">Plan {plan}</p> : null}
        <nav>
          {admin ? (
            <>
              <Link href="/admin">Overview</Link>
              <Link href="/admin/tenants">Tenants</Link>
              <Link href="/admin/jobs">Jobs</Link>
              <Link href="/admin/connectors">Connectors</Link>
              <Link href="/admin/repairs">Repairs</Link>
              <Link href="/admin/health">Health</Link>
            </>
          ) : (
            customerLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))
          )}
          {!admin && author ? <Link href="/repairs">Repairs</Link> : null}
        </nav>
        <form action={signOutAction}>
          <button type="submit">Sign out</button>
        </form>
      </aside>
      <div className="main">{children}</div>
    </div>
  );
}
