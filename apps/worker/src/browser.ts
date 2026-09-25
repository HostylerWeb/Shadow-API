import { Camoufox } from "camoufox-js";
import type { Browser, BrowserContext, BrowserContextOptions } from "playwright-core";
import { loadCarrierManifest } from "@shadowapi/graph-runner";

type ProxySettings = {
  server: string;
  username?: string;
  password?: string;
};

let browserPromise: Promise<Browser> | null = null;

export function resolveCarrierProxy(sessionId?: string | null): ProxySettings | undefined {
  const profile = loadCarrierManifest().runtime_profile;
  if (!profile) return undefined;
  const datacenter = process.env[profile.datacenter_proxy_env];
  const residential = process.env[profile.residential_proxy_env];
  const raw = datacenter || residential;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    let username = decodeURIComponent(url.username);
    if (sessionId) {
      username = username ? `${username}-sticky-${sessionId}` : `sticky-${sessionId}`;
    }
    return {
      server: `${url.protocol}//${url.host}`,
      username: username || undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
    };
  } catch {
    return undefined;
  }
}

export function proxyConfigError(): boolean {
  const profile = loadCarrierManifest().runtime_profile;
  if (!profile) return false;
  const raw = process.env[profile.datacenter_proxy_env] || process.env[profile.residential_proxy_env];
  if (!raw) return false;
  try {
    new URL(raw);
    return false;
  } catch {
    return true;
  }
}

export async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = Camoufox({ headless: true }) as Promise<Browser>;
  }
  return browserPromise;
}

export async function withJobContext<T>(
  options: { sessionId?: string | null; storageState?: BrowserContextOptions["storageState"] },
  run: (context: BrowserContext) => Promise<T>,
): Promise<T> {
  const browser = await getBrowser();
  const proxy = resolveCarrierProxy(options.sessionId);
  const context = await browser.newContext({
    ...(proxy ? { proxy } : {}),
    ...(options.storageState ? { storageState: options.storageState } : {}),
  });
  try {
    return await run(context);
  } finally {
    await context.close();
  }
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise;
  browserPromise = null;
  await browser.close();
}
