import "./globals.css";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createDb } from "@shadowapi/db";
import { tenants } from "@shadowapi/db/schema";
import { eq } from "drizzle-orm";
import { authorIsActive, loadPortalUser } from "../src/accounts";
import { readSession } from "../src/session";
import { Shell } from "./shell";

export const metadata: Metadata = {
  icons: { icon: "/favicon.svg" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get("portal_session")?.value;
  const path = (await headers()).get("x-pathname") ?? "";
  const session = readSession(token);
  if (!session || !process.env.DATABASE_URL || path === "/login" || path === "/signup") {
    return (
      <html lang="en">
        <body>{children}</body>
      </html>
    );
  }
  const handle = createDb(process.env.DATABASE_URL);
  const user = await loadPortalUser(handle.db, session.userId);
  const tenant = user
    ? (await handle.db.select().from(tenants).where(eq(tenants.id, user.tenantId)).limit(1))[0]
    : undefined;
  await handle.close();
  const admin = user?.role === "admin";
  if (admin && path && !path.startsWith("/admin") && !path.startsWith("/api")) redirect("/admin");
  return (
    <html lang="en">
      <body>
        <Shell
          title={user?.email ?? "Account"}
          plan={admin ? undefined : tenant?.plan}
          author={Boolean(user && authorIsActive(user.role, user.authorUntil))}
          admin={admin}
        >
          {children}
        </Shell>
      </body>
    </html>
  );
}
