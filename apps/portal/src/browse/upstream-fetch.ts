import http from "node:http";
import https from "node:https";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";

/** Some public sites return header blocks larger than Node fetch's default 16KB limit. */
const MAX_HEADER_BYTES = 256 * 1024;
const MAX_REDIRECTS = 5;

type UpstreamInit = {
  method: string;
  headers: Record<string, string>;
  body?: Uint8Array;
};

function decodeBody(body: Buffer, encoding: string): Buffer {
  if (encoding.includes("br")) return brotliDecompressSync(body);
  if (encoding.includes("gzip")) return gunzipSync(body);
  if (encoding.includes("deflate")) return inflateSync(body);
  return body;
}

function requestOnce(target: URL, init: UpstreamInit): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  const lib = target.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      target,
      {
        method: init.method,
        headers: init.headers,
        maxHeaderSize: MAX_HEADER_BYTES,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
      },
    );
    req.on("error", reject);
    if (init.body && init.body.byteLength > 0) req.write(Buffer.from(init.body));
    req.end();
  });
}

/** Fetch an upstream page without the default header-size cap that drops large public sites. */
export async function fetchUpstreamDocument(target: URL, init: UpstreamInit, redirects = 0): Promise<Response> {
  if (redirects > MAX_REDIRECTS) throw new Error("Too many redirects");
  const result = await requestOnce(target, init);
  const location = result.headers.location;
  const loc = Array.isArray(location) ? location[0] : location;
  if (result.status >= 300 && result.status < 400 && loc && init.method !== "POST") {
    return fetchUpstreamDocument(new URL(loc, target), { ...init, method: "GET", body: undefined }, redirects + 1);
  }
  const encoding = String(result.headers["content-encoding"] ?? "");
  const body = decodeBody(result.body, encoding);
  const headers = new Headers();
  for (const [key, value] of Object.entries(result.headers)) {
    if (value == null) continue;
    if (key === "content-encoding" || key === "content-length" || key === "transfer-encoding") continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  const response = new Response(body, { status: result.status, headers });
  Object.defineProperty(response, "url", { value: target.toString() });
  return response;
}
