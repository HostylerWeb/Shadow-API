import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTeachApiBrowseResponse,
  readDocumentBase,
  rootFallbackAssetUrl,
  rewriteCss,
  rewriteHtml,
  rewriteUrl,
  shouldPassThroughBrowseBody,
  spaStaticAssetFallbackUrls,
  stripTeachTrackerScripts,
  isTeachCmpTelemetryPath,
  teachStubUnauthorizedBody,
  upstreamBrowseRequestHeaders,
  teachCmpTelemetryStub,
} from "../src/browse/rewrite.js";
import {
  browseCookieJarKey,
  clearBrowseCookieJars,
  mergeBrowseSetCookies,
  readBrowseCookieHeader,
} from "../src/browse/browse-cookie-jar.js";

describe("browse rewrite", () => {
  it("rewrites root-relative url() in CSS against the real stylesheet URL", () => {
    const sheet = new URL("https://cdn.example.com/stylesheets/site.css");
    const css = `.btn { background: url(/images/search/search-button.png); }`;
    const out = rewriteCss(css, sheet);
    assert.match(out, /\/api\/browse\?u=/);
    assert.ok(out.includes(encodeURIComponent("https://cdn.example.com/images/search/search-button.png")));
  });

  it("rewrites script src in HTML", () => {
    const page = new URL("https://find.example.gov.uk/search");
    const html = `<html><head><script src="https://cdn.example.com/app.js"></script></head></html>`;
    const out = rewriteHtml(html, page, "");
    assert.match(out, /src="\/?[^"]*\?u=/);
    assert.doesNotMatch(out, /src="https:\/\/cdn\.example\.com/);
  });

  it("rewrites root-relative script src (SPA base href sites)", () => {
    const portal = "http://localhost:3001";
    const page = new URL("https://7daysperformance.co.uk/");
    const html = `<html><head><base href="/"><script src="/config/env.js"></script></head></html>`;
    const out = rewriteHtml(html, page, "", portal);
    assert.match(out, /src="http:\/\/localhost:3001\/api\/browse\?u=/);
    assert.match(out, /href="https:\/\/7daysperformance\.co\.uk\/"/);
  });

  it("leaves data urls unchanged", () => {
    const sheet = new URL("https://cdn.example.com/a.css");
    const css = `x { background: url(data:image/png;base64,abc); }`;
    assert.equal(rewriteCss(css, sheet), css);
  });

  it("rewriteUrl resolves relative paths from page", () => {
    const page = new URL("https://example.com/path/page.html");
    const proxied = rewriteUrl("../assets/x.woff2", page);
    assert.ok(proxied?.includes(encodeURIComponent("https://example.com/assets/x.woff2")));
  });

  it("detects API JSON bodies that should not be rewritten as HTML", () => {
    const api = new URL("https://7daysperformance.co.uk/api/v2/homepage-banner/active");
    assert.equal(shouldPassThroughBrowseBody(api, "text/html; charset=UTF-8", '{"code":404}'), true);
    assert.equal(shouldPassThroughBrowseBody(new URL("https://example.com/"), "text/html", "<!doctype html>"), false);
  });

  it("rewrites relative bundle scripts from document base href not route URL", () => {
    const portal = "http://localhost:3001";
    const page = new URL("https://7daysperformance.co.uk/product/win-this-car");
    const html = `<html><head><base href="/"><script src="main.abc.js" type="module"></script></head></html>`;
    const out = rewriteHtml(html, page, "", portal);
    assert.match(out, /7daysperformance\.co\.uk%2Fmain\.abc\.js/);
    assert.doesNotMatch(out, /product%2Fmain/);
  });

  it("rootFallbackAssetUrl maps nested SPA paths to root bundles", () => {
    const nested = new URL("https://7daysperformance.co.uk/product/main.abc.js");
    const root = rootFallbackAssetUrl(nested);
    assert.equal(root?.href, "https://7daysperformance.co.uk/main.abc.js");
  });

  it("spaStaticAssetFallbackUrls finds /assets/fonts paths", () => {
    const nested = new URL("https://7daysperformance.co.uk/product/assets/fonts/roboto.woff2");
    const urls = spaStaticAssetFallbackUrls(nested);
    assert.ok(urls.some((u) => u.href.endsWith("/assets/fonts/roboto.woff2")));
  });

  it("rewrites root-relative font urls inside inline style tags", () => {
    const portal = "http://localhost:3001";
    const page = new URL("https://7daysperformance.co.uk/");
    const html = `<html><head><base href="/"><style>@font-face{font-family:R;src:url(/assets/fonts/a.woff2)}</style></head></html>`;
    const out = rewriteHtml(html, page, "", portal);
    assert.match(out, /api\/browse\?u=.*assets%2Ffonts%2Fa\.woff2/);
    assert.doesNotMatch(out, /url\(\/assets\/fonts/);
  });

  it("readDocumentBase honors base href", () => {
    const page = new URL("https://7daysperformance.co.uk/deep/route");
    const base = readDocumentBase(`<head><base href="/"></head>`, page);
    assert.equal(base.href, "https://7daysperformance.co.uk/");
  });

  it("normalizes HTTP 404 JSON API bodies to 200 for teach preview", () => {
    const api = new URL("https://7daysperformance.co.uk/api/v2/homepage-banner/active");
    const body = '{"string":"No active banner.","code":404}';
    const out = normalizeTeachApiBrowseResponse(api, 404, body);
    assert.equal(out.status, 200);
    assert.equal(out.body, body);
    assert.match(out.contentType ?? "", /json/);
  });

  it("decodes &amp; in href before proxying", () => {
    const page = new URL("https://www.royalmail.com/track");
    const html = `<iframe src="https://consent.trustarc.com/notice?domain=royalmail.com&amp;c=teconsent"></iframe>`;
    const out = rewriteHtml(html, page, "", "http://localhost:3001");
    assert.doesNotMatch(out, /&amp;c=/);
    assert.match(out, /consent\.trustarc\.com%2Fnotice%3Fdomain%3Droyalmail\.com%26c%3Dteconsent/);
  });

  it("recognizes TrustArc CMP telemetry paths for teach stubs", () => {
    assert.equal(isTeachCmpTelemetryPath(new URL("https://www.royalmail.com/consent/log?type=x")), true);
    assert.equal(isTeachCmpTelemetryPath(new URL("https://www.royalmail.com/cm/royalmail.com/opt-out/domains")), true);
    assert.equal(isTeachCmpTelemetryPath(new URL("https://www.royalmail.com/track")), false);
    assert.equal(teachCmpTelemetryStub(new URL("https://x/cm/a")).body, "[]");
    assert.equal(teachCmpTelemetryStub(new URL("https://x/consent/log")).body, "{}");
  });

  it("rewrites TrustArc root /asset and /analytics paths in notice HTML", () => {
    const page = new URL("https://consent.trustarc.com/notice?domain=royalmail.com");
    const html = `<script src="/asset/notice.js/v/1"></script><a href="/analytics?action=0">x</a>`;
    const out = rewriteHtml(html, page, "", "http://localhost:3001");
    assert.match(out, /api\/browse\?u=.*consent\.trustarc\.com%2Fasset%2Fnotice\.js/);
    assert.match(out, /api\/browse\?u=.*consent\.trustarc\.com%2Fanalytics/);
    assert.doesNotMatch(out, /src="\/asset\//);
  });

  it("strips cookieyes and GTM inline loaders from HTML", () => {
    const html = `<html><head><script src="https://cdn-cookieyes.com/client_data/abc/script.js"></script><script>window.__loadInlineTrackers=function(){}</script></head></html>`;
    const out = stripTeachTrackerScripts(html);
    assert.match(out, /stripped tracker/);
    assert.doesNotMatch(out, /cookieyes/);
  });

  it("keeps __inlineTrackers queue when stripping __loadInlineTrackers bootstrap", () => {
    const html = `<html><head><script>window.__inlineTrackers=[];window.__loadInlineTrackers=function(){for(var i=0;i<queue.length;i++)queue[i]();};</script><script>window.__inlineTrackers.push(function(){});</script></head></html>`;
    const out = stripTeachTrackerScripts(html);
    assert.match(out, /window\.__inlineTrackers=window\.__inlineTrackers/);
    assert.match(out, /__inlineTrackers\.push/);
  });

  it("does not forward portal browser cookies upstream; uses server jar instead", () => {
    const target = new URL("https://api-web.royalmail.com/mailpieces/microsummary/v1/summary/AA123");
    const headers = upstreamBrowseRequestHeaders({
      incoming: {
        get(name: string) {
          if (name === "x-ibm-client-id") return "client-id-test";
          if (name === "cookie") return "portal_session=abc; ak_bmsc=should-not-forward";
          if (name === "x-shadow-teach-site") return "https://www.royalmail.com/track-your-item";
          return null;
        },
      },
      target,
      defaultUserAgent: "ua",
      defaultAccept: "application/json",
      upstreamCookie: "lagrange_session=xyz",
    });
    assert.equal(headers["x-ibm-client-id"], "client-id-test");
    assert.equal(headers.cookie, "lagrange_session=xyz");
    assert.equal(headers.referer, "https://www.royalmail.com/track-your-item");
    assert.equal(headers.origin, "https://www.royalmail.com");
  });

  it("stores Set-Cookie from upstream on the teach jar", () => {
    clearBrowseCookieJars();
    const target = new URL("https://goldprice.org/live-gold-price.html");
    const key = browseCookieJarKey("tenant-1", target);
    mergeBrowseSetCookies(key, {
      headers: {
        getSetCookie: () => ["wcid=abc; Path=/; HttpOnly", "lagrange_session=s1; Path=/"],
      },
    } as Response);
    assert.equal(readBrowseCookieHeader(key), "wcid=abc; lagrange_session=s1");
    clearBrowseCookieJars();
  });

  it("stubs plain unauthorized access bodies for teach preview", () => {
    const stub = teachStubUnauthorizedBody("UnAuthorized Access!");
    assert.ok(stub);
    assert.equal(stub?.body, "{}");
  });
});
