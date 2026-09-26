/** Plain JS injected into proxied pages — must not use imports at runtime. */
export function browseProxyClientScript(pageUrl: string, portalOrigin: string): string {
  return `(function(){
  var real = ${JSON.stringify(pageUrl)};
  var portal = ${JSON.stringify(portalOrigin.replace(/\/$/, ""))};
  var siteOrigin = new URL(real).origin;

  window.dataLayer = window.dataLayer || [];
  if (typeof window.dataLayer.push !== "function") {
    window.dataLayer.push = function () { return window.dataLayer.length; };
  }
  window.gtag = window.gtag || function () {};
  window.__inlineTrackers = window.__inlineTrackers || [];
  if (typeof window.__inlineTrackers.push !== "function") {
    window.__inlineTrackers.push = function () { return window.__inlineTrackers.length; };
  }
  window.__loadInlineTrackers = window.__loadInlineTrackers || function () {};

  function nestedSiteUrl() {
    try {
      var q = new URLSearchParams(location.search).get("u");
      if (q) return new URL(q);
    } catch (e) { /* ignore */ }
    return new URL(real);
  }

  var siteRoot = siteOrigin + "/";

  function mirrorBrowsePath(siteUrl) {
    var u = new URL(String(siteUrl), real);
    if (u.origin !== siteOrigin) return null;
    var path = u.pathname + u.search;
    var join = path.indexOf("?") >= 0 ? "&" : "?";
    return path + join + "u=" + encodeURIComponent(siteRoot) + (u.hash || "");
  }

  function isBrowseFrame() {
    try {
      if (location.search.indexOf("u=") === -1) return false;
      if (location.pathname === "/api/browse") return true;
      if (location.pathname.indexOf("/_next") === 0) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  function patchLocationGetter(name, pick) {
    try {
      var proto = Location.prototype;
      var desc = Object.getOwnPropertyDescriptor(proto, name);
      if (!desc || !desc.get) return;
      var orig = desc.get;
      Object.defineProperty(proto, name, {
        get: function () {
          if (isBrowseFrame() && this === window.location) {
            return pick(nestedSiteUrl());
          }
          return orig.call(this);
        },
        configurable: true,
      });
    } catch (e) { /* ignore — browser may block Location patches */ }
  }

  patchLocationGetter("pathname", function (u) { return u.pathname; });
  patchLocationGetter("search", function (u) { return u.search; });
  patchLocationGetter("hash", function (u) { return u.hash; });

  window.addEventListener("error", function (e) {
    var m = (e && e.message) ? String(e.message) : "";
    if (m.indexOf("CookieYes") !== -1 || m.indexOf("cookieyes") !== -1) {
      e.preventDefault();
      return true;
    }
  }, true);

  function browsePath(abs) {
    try {
      var u = new URL(String(abs), location.href);
      if (u.origin === location.origin && u.pathname === "/api/browse") {
        var nested = u.searchParams.get("u");
        if (nested) {
          var mirrored = mirrorBrowsePath(nested);
          if (mirrored) return mirrored;
        }
        return u.pathname + u.search + (u.hash || "");
      }
      if (u.origin === siteOrigin) {
        var path = mirrorBrowsePath(u.toString());
        if (path) return path;
      }
      if (u.origin === location.origin && u.searchParams.get("u")) {
        return u.pathname + u.search + (u.hash || "");
      }
    } catch (e) { /* ignore */ }
    return abs;
  }

  function browseAbsolute(abs) {
    try {
      var u = new URL(String(abs), real);
      if (u.origin === siteOrigin) {
        return portal + "/api/browse?u=" + encodeURIComponent(u.toString());
      }
    } catch (e) { /* ignore */ }
    var path = browsePath(abs);
    if (path.charAt(0) === "/") return portal + path;
    return path;
  }

  ["pushState", "replaceState"].forEach(function (name) {
    var original = history[name];
    history[name] = function (state, title, url) {
      if (arguments.length < 3 || url == null || url === "") {
        return original.apply(this, arguments);
      }
      var fixed = browsePath(url);
      try {
        return original.call(this, state, title, fixed);
      } catch (e) {
        try {
          return original.call(this, state, title);
        } catch (e2) { /* ignore */ }
      }
    };
  });

  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      try {
        var raw = typeof input === "string" ? input : input && input.url ? input.url : "";
        if (raw) {
          var u = new URL(raw, real);
          if (u.origin === siteOrigin) {
            return origFetch.call(this, browseAbsolute(u.toString()), init);
          }
        }
      } catch (e) { /* fall through */ }
      return origFetch.apply(this, arguments);
    };
  }

  var XO = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    try {
      var u = new URL(String(url), real);
      if (u.origin === siteOrigin) {
        return XO.apply(this, [method, browseAbsolute(u.toString())].concat([].slice.call(arguments, 2)));
      }
    } catch (e) { /* ignore */ }
    return XO.apply(this, arguments);
  };

  function proxied(input) {
    try {
      var abs = new URL(input, real);
      if (abs.protocol !== "http:" && abs.protocol !== "https:") return null;
      if (abs.origin === siteOrigin) {
        var path = mirrorBrowsePath(abs.toString());
        if (path) return portal + path;
      }
      if (abs.origin === location.origin || abs.hostname === "localhost") {
        var nested = abs.searchParams.get("u") || abs.searchParams.get("url");
        if (nested) {
          var fromNested = mirrorBrowsePath(nested);
          if (fromNested) return portal + fromNested;
        }
        var local = mirrorBrowsePath(siteOrigin + abs.pathname + abs.search);
        if (local) return portal + local;
      }
      return portal + "/api/browse?u=" + encodeURIComponent(abs.toString());
    } catch (e) { return null; }
  }

  document.addEventListener("click", function (event) {
    if (window.__shadowPickMode && window.__shadowPickMode() !== "off") return;
    var node = event.target && event.target.closest ? event.target.closest("a[href]") : null;
    if (!node) return;
    var href = node.getAttribute("href") || "";
    if (!href || href.charAt(0) === "#" || href.indexOf("javascript:") === 0) return;
    var next = proxied(href);
    if (!next) return;
    event.preventDefault();
    location.href = next;
  }, true);

  document.addEventListener("submit", function (event) {
    var form = event.target;
    if (!form || !form.getAttribute) return;
    var action = form.getAttribute("action") || real;
    var next = proxied(action);
    if (!next) return;
    if ((form.getAttribute("method") || "get").toLowerCase() === "get") {
      event.preventDefault();
      var dest = new URL(action, real);
      var nested = dest.searchParams.get("u");
      if (nested) dest = new URL(nested);
      new FormData(form).forEach(function (value, key) { dest.searchParams.append(key, String(value)); });
      var path = mirrorBrowsePath(dest.toString());
      if (path) location.href = portal + path;
      return;
    }
    form.setAttribute("action", next);
  }, true);
})();`;
}
