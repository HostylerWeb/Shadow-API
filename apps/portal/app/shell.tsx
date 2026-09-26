import { signOutAction } from "./actions";
import { NavIcon } from "./nav-icon";
import { NavShell, NavToggle } from "./nav-shell";
import { SideNav } from "./side-nav";

const customerLinks = [
  { href: "/endpoints", label: "My endpoints", icon: "endpoints" },
  { href: "/jobs", label: "Activity", icon: "activity" },
  { href: "/keys", label: "API keys", icon: "keys" },
  { href: "/usage", label: "Plan", icon: "plan" },
  { href: "/docs", label: "Documentation", icon: "docs" },
] as const;

const adminLinks = [
  { href: "/admin", label: "Overview", icon: "overview" },
  { href: "/admin/tenants", label: "Tenants", icon: "tenants" },
  { href: "/admin/jobs", label: "Jobs", icon: "jobs" },
  { href: "/admin/connectors", label: "Connectors", icon: "connectors" },
  { href: "/admin/repairs", label: "Repairs", icon: "repairs" },
  { href: "/admin/health", label: "Health", icon: "health" },
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
    <NavShell admin={admin}>
      <aside className="side">
        <NavToggle />
        <p className="brand">{admin ? "Admin" : "ShadowAPI"}</p>
        <p className="who">{title}</p>
        {plan ? <p className="who">Plan {plan}</p> : null}
        <SideNav
          items={
            admin
              ? [...adminLinks]
              : [...customerLinks, ...(author ? [{ href: "/repairs", label: "Repairs", icon: "repairs" }] : [])]
          }
        />
        <form action={signOutAction}>
          <button type="submit" title="Sign out">
            <NavIcon name="out" />
            <span className="nav-label">Sign out</span>
          </button>
        </form>
      </aside>
      <div className="main">{children}</div>
    </NavShell>
  );
}
