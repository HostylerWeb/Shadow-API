"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "./nav-icon";

export function SideNav({ items }: { items: Array<{ href: string; label: string; icon: string }> }) {
  const path = usePathname();
  return (
    <nav>
      {items.map((item) => {
        const active = item.href === "/admin" ? path === "/admin" : path === item.href || path.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} title={item.label} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
            <NavIcon name={item.icon} />
            <span className="nav-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
