import { NextRequest, NextResponse } from "next/server";
import { readSession } from "../../../../src/session";
import { mintStudioToken, studioBrowserConfigured } from "../../../../src/studio-token";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  if (!studioBrowserConfigured()) {
    return NextResponse.json({ error: "studio_browser_not_configured" }, { status: 503 });
  }
  const token = (await cookies()).get("portal_session")?.value;
  const session = readSession(token);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json()) as { startUrl?: string };
  const startUrl = body.startUrl?.trim();
  if (!startUrl) return NextResponse.json({ error: "startUrl required" }, { status: 400 });
  const studioToken = mintStudioToken({ tenantId: session.tenantId, userId: session.userId });
  const base = process.env.STUDIO_BROWSER_URL!.replace(/\/$/, "");
  const res = await fetch(`${base}/v1/sessions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${studioToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ startUrl }),
  });
  const payload = await res.json();
  if (!res.ok) {
    return NextResponse.json(payload, { status: res.status });
  }
  const wsPath = payload.wsUrl as string;
  const wsUrl = `${base.replace(/^http/, "ws")}${wsPath}?token=${encodeURIComponent(studioToken)}`;
  return NextResponse.json({ sessionId: payload.sessionId, wsUrl, frameToken: studioToken });
}
