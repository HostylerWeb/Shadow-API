import { randomUUID } from "node:crypto";
import type { Browser, BrowserContext, BrowserContextOptions, Page } from "playwright-core";
import { Camoufox } from "camoufox-js";

export type StudioSession = {
  id: string;
  tenantId: string;
  userId: string;
  context: BrowserContext;
  page: Page;
  lastActive: number;
};

const sessions = new Map<string, StudioSession>();
let browserPromise: Promise<Browser> | null = null;

const MAX_PER_TENANT = Number(process.env.STUDIO_MAX_SESSIONS_PER_TENANT ?? "2");
const IDLE_MS = Number(process.env.STUDIO_IDLE_MS ?? String(30 * 60 * 1000));

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = Camoufox({ headless: true }) as Promise<Browser>;
  }
  return browserPromise;
}

export function tenantSessionCount(tenantId: string): number {
  return [...sessions.values()].filter((s) => s.tenantId === tenantId).length;
}

export async function createSession(
  tenantId: string,
  userId: string,
  startUrl: string,
  storageState?: string,
): Promise<StudioSession> {
  if (tenantSessionCount(tenantId) >= MAX_PER_TENANT) {
    throw new Error("Tenant session limit reached");
  }
  const browser = await getBrowser();
  const context = await browser.newContext(
    storageState
      ? { storageState: JSON.parse(storageState) as BrowserContextOptions["storageState"] }
      : undefined,
  );
  const page = await context.newPage();
  await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const session: StudioSession = {
    id: randomUUID(),
    tenantId,
    userId,
    context,
    page,
    lastActive: Date.now(),
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string, tenantId: string): StudioSession | null {
  const session = sessions.get(id);
  if (!session || session.tenantId !== tenantId) return null;
  session.lastActive = Date.now();
  return session;
}

export async function closeSession(id: string, tenantId: string): Promise<void> {
  const session = sessions.get(id);
  if (!session || session.tenantId !== tenantId) return;
  sessions.delete(id);
  await session.context.close();
}

export async function exportStorageState(id: string, tenantId: string): Promise<string> {
  const session = getSession(id, tenantId);
  if (!session) throw new Error("Session not found");
  const state = await session.context.storageState();
  return JSON.stringify(state);
}

export function sweepIdleSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActive > IDLE_MS) {
      void closeSession(id, session.tenantId);
    }
  }
}

setInterval(() => sweepIdleSessions(), 60_000).unref();
