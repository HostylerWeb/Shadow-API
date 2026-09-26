/** Plain JS injected into proxied pages — must not use imports at runtime. */
export function browseProxyClientScript(pageUrl: string, portalOrigin: string): string {
  return `(function(){
  var real = ${JSON.stringify(pageUrl)};
  var portal = ${JSON.stringify(portalOrigin.replace(/\/$/, ""))};
  var siteOrigin = new URL(real).origin;

  (function suppressTeachAuthAlerts() {
    var nativeAlert = window.alert;
    window.alert = function (message) {
      var text = String(message == null ? "" : message);
      if (/unauthorized/i.test(text) && /access/i.test(text)) {
        try { console.warn("[shadow teach preview]", text); } catch (e) { /* ignore */ }
        return;
      }
      return nativeAlert.apply(this, arguments);
    };
  })();

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

  (function installTeachHcaptchaShim() {
    if (!/^(localhost|127\\.0\\.0\\.1)$/.test(location.hostname)) return;
    var stubToken = "shadow-teach-hcaptcha-stub";
    function patchHcaptcha(h) {
      if (!h || h.__shadowTeachStub) return h;
      var wrapped = Object.assign({}, h);
      wrapped.execute = function () { return Promise.resolve(stubToken); };
      wrapped.getResponse = function () { return stubToken; };
      wrapped.reset = typeof h.reset === "function" ? h.reset.bind(h) : function () {};
      wrapped.remove = typeof h.remove === "function" ? h.remove.bind(h) : function () {};
      wrapped.render = typeof h.render === "function" ? h.render.bind(h) : function () { return "0"; };
      wrapped.ready = function (cb) { if (typeof cb === "function") cb(); };
      wrapped.__shadowTeachStub = true;
      return wrapped;
    }
    var stored = patchHcaptcha({
      execute: function () { return Promise.resolve(stubToken); },
      getResponse: function () { return stubToken; },
      reset: function () {},
      remove: function () {},
      render: function () { return "0"; },
      ready: function (cb) { if (typeof cb === "function") cb(); },
    });
    try {
      Object.defineProperty(window, "hcaptcha", {
        configurable: true,
        enumerable: true,
        get: function () { return stored; },
        set: function (v) { stored = patchHcaptcha(v); },
      });
    } catch (e) { window.hcaptcha = stored; }
    var prevOnLoad = window.hcaptchaOnLoad;
    window.hcaptchaOnLoad = function () {
      stored = patchHcaptcha(window.hcaptcha || stored);
      if (typeof prevOnLoad === "function") {
        try { prevOnLoad(); } catch (e) { /* ignore */ }
      }
    };
    var repatch = setInterval(function () {
      if (window.hcaptcha && !window.hcaptcha.__shadowTeachStub) {
        stored = patchHcaptcha(window.hcaptcha);
      }
    }, 300);
    setTimeout(function () { clearInterval(repatch); }, 120000);
  })();

  function decodeAttrUrl(raw) {
    return String(raw || "").replace(/&amp;/gi, "&").replace(/&#0*38;/gi, "&");
  }

  function siteRegistrableHost(hostname) {
    return String(hostname || "").toLowerCase().replace(/^www\\./, "");
  }

  function sameTeachSite(origin) {
    try {
      var a = siteRegistrableHost(new URL(siteOrigin).hostname);
      var b = siteRegistrableHost(new URL(origin).hostname);
      if (a === b) return true;
      if (b.endsWith("." + a)) return true;
    } catch (e) { /* ignore */ }
    return origin === siteOrigin;
  }

  (function installCmpShims() {
    try {
      var stored;
      Object.defineProperty(window, "truste", {
        configurable: true,
        enumerable: true,
        get: function () { return stored; },
        set: function (v) {
          if (v && v.util) {
            var wrap = function (fn) {
              return function (name) {
                try {
                  var out = fn ? fn.call(v.util, name) : "";
                  return out == null ? "" : String(out);
                } catch (e) {
                  return "";
                }
              };
            };
            v.util.readCookie = wrap(v.util.readCookie || v.util._readCookie);
            v.util._readCookie = wrap(v.util._readCookie || v.util.readCookie);
          }
          stored = v;
        },
      });
    } catch (e) { /* ignore */ }
  })();

  function nestedSiteUrl() {
    try {
      var q = new URLSearchParams(location.search).get("u");
      if (q) return new URL(decodeAttrUrl(q));
    } catch (e) { /* ignore */ }
    return new URL(real);
  }

  var siteRoot = siteOrigin + "/";

  function withBrowseTeachInit(init) {
    var next = init ? Object.assign({}, init) : {};
    next.credentials = "include";
    var hdrs = new Headers(next.headers || undefined);
    if (!hdrs.has("X-Shadow-Teach-Site")) hdrs.set("X-Shadow-Teach-Site", real);
    next.headers = hdrs;
    return next;
  }

  function markShadowBrowseXhr(xhr) {
    try {
      xhr.__shadowBrowseSite = real;
    } catch (e) { /* ignore */ }
  }

  var XSet = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    return XSet.call(this, name, value);
  };

  var XSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    if (this.__shadowBrowseSite) {
      try {
        XSet.call(this, "X-Shadow-Teach-Site", this.__shadowBrowseSite);
      } catch (e) { /* ignore */ }
    }
    return XSend.call(this, body);
  };

  function mirrorBrowsePath(siteUrl) {
    var u = new URL(String(siteUrl), real);
    if (u.origin !== siteOrigin && !sameTeachSite(u.origin)) return null;
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
  patchLocationGetter("hostname", function (u) { return u.hostname; });
  patchLocationGetter("host", function (u) { return u.host; });
  patchLocationGetter("origin", function (u) { return u.origin; });
  patchLocationGetter("protocol", function (u) { return u.protocol; });
  patchLocationGetter("href", function (u) { return u.href; });

  var TRUSTARC_ORIGIN = "https://consent.trustarc.com";

  function portalHostnameMatch(u) {
    if (u.hostname !== location.hostname) return false;
    var lp = location.port || (location.protocol === "https:" ? "443" : "80");
    var up = u.port || (u.protocol === "https:" ? "443" : "80");
    return lp === up;
  }

  function proxySitePathOnPortal(raw) {
    try {
      var u = new URL(String(raw), location.href);
      if (!portalHostnameMatch(u)) return null;
      if (u.pathname.indexOf("/asset/") === 0 || u.pathname.indexOf("/analytics") === 0) {
        var trust = new URL(u.pathname + u.search + u.hash, TRUSTARC_ORIGIN);
        return browseAbsolute(trust.toString());
      }
      if (u.pathname === "/api/browse" || u.pathname.indexOf("/_next") === 0) return null;
      var nested = nestedSiteUrl();
      var siteAbs = new URL(u.pathname + u.search + u.hash, nested.origin);
      if (siteAbs.origin === siteOrigin || sameTeachSite(siteAbs.origin)) {
        return browseAbsolute(siteAbs.toString());
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function rewritePortalOrUpstreamUrl(raw) {
    var fixed = proxySitePathOnPortal(raw);
    if (fixed) return fixed;
    try {
      var u = new URL(String(raw), real);
      if (u.origin === siteOrigin || sameTeachSite(u.origin)) {
        return browseAbsolute(u.toString());
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  (function patchDynamicResourceUrls() {
    try {
      var origSetAttribute = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (name, value) {
        if ((name === "src" || name === "href") && value != null) {
          var raw = String(value);
          if (/hcaptcha\\.com/i.test(raw)) {
            value = "data:text/javascript,window.hcaptchaOnLoad%26%26window.hcaptchaOnLoad()";
          } else {
            var next = rewritePortalOrUpstreamUrl(raw);
            if (next) value = next;
          }
        }
        return origSetAttribute.call(this, name, value);
      };
      var srcDesc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, "src");
      if (srcDesc && srcDesc.set) {
        var origSrcSet = srcDesc.set;
        Object.defineProperty(HTMLScriptElement.prototype, "src", {
          get: srcDesc.get,
          set: function (v) {
            var raw = String(v);
            if (/hcaptcha\\.com/i.test(raw)) {
              return origSrcSet.call(this, "data:text/javascript,window.hcaptchaOnLoad%26%26window.hcaptchaOnLoad()");
            }
            var next = rewritePortalOrUpstreamUrl(raw);
            return origSrcSet.call(this, next || v);
          },
          configurable: true,
          enumerable: srcDesc.enumerable,
        });
      }
    } catch (e) { /* ignore */ }
  })();

  window.addEventListener("error", function (e) {
    var m = (e && e.message) ? String(e.message) : "";
    if (m.indexOf("CookieYes") !== -1 || m.indexOf("cookieyes") !== -1) {
      e.preventDefault();
      return true;
    }
    if (m.indexOf("truste.util") !== -1 || (m.indexOf("reading 'replace'") !== -1 && m.indexOf("_readCookie") !== -1)) {
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
          var mirrored = mirrorBrowsePath(decodeAttrUrl(nested));
          if (mirrored) return mirrored;
        }
        return u.pathname + u.search + (u.hash || "");
      }
      if (u.origin === siteOrigin || sameTeachSite(u.origin)) {
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
      if (sameTeachSite(u.origin)) {
        return portal + "/api/browse?u=" + encodeURIComponent(u.toString());
      }
      if (u.origin === TRUSTARC_ORIGIN) {
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
          var portalFixed = proxySitePathOnPortal(raw);
          if (portalFixed) return origFetch.call(this, portalFixed, init);
          var u = new URL(raw, real);
          if (u.origin === siteOrigin || sameTeachSite(u.origin)) {
            return origFetch.call(this, browseAbsolute(u.toString()), withBrowseTeachInit(init));
          }
        }
      } catch (e) { /* fall through */ }
      return origFetch.apply(this, arguments);
    };
  }

  var origBeacon = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
  if (origBeacon) {
    navigator.sendBeacon = function (url, data) {
      try {
        var fixed = proxySitePathOnPortal(url);
        if (fixed) return origBeacon(fixed, data);
        var u = new URL(String(url), real);
        if (u.origin === siteOrigin || sameTeachSite(u.origin)) {
          return origBeacon(browseAbsolute(u.toString()), data);
        }
      } catch (e) { /* ignore */ }
      return origBeacon(url, data);
    };
  }

  var XO = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    try {
      var fixed = proxySitePathOnPortal(url);
      if (fixed) {
        markShadowBrowseXhr(this);
        return XO.apply(this, [method, fixed].concat([].slice.call(arguments, 2)));
      }
      var u = new URL(String(url), real);
      if (u.origin === siteOrigin || sameTeachSite(u.origin)) {
        markShadowBrowseXhr(this);
        return XO.apply(this, [method, browseAbsolute(u.toString())].concat([].slice.call(arguments, 2)));
      }
    } catch (e) { /* ignore */ }
    return XO.apply(this, arguments);
  };

  function proxied(input) {
    try {
      var abs = new URL(input, real);
      if (abs.protocol !== "http:" && abs.protocol !== "https:") return null;
      if (abs.origin === siteOrigin || sameTeachSite(abs.origin)) {
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
