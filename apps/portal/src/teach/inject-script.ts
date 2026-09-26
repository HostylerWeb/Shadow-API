/** Injected into proxied HTML — must be plain JS string, no imports. */
export function teachInjectScript(pageUrl: string): string {
  return `(function(){
  var real = ${JSON.stringify(pageUrl)};
  var parentOrigin = "*";
  var pickMode = "off";
  window.__shadowPickMode = function () { return pickMode; };
  var rowSelectorForPick = "";
  var style = document.createElement("style");
  style.textContent = ".shadow-teach-hover{outline:2px solid #0c4f8a!important;outline-offset:2px;cursor:crosshair!important}.shadow-teach-active{outline:3px solid #16a34a!important;outline-offset:2px}";
  (document.head || document.documentElement).appendChild(style);

  function notifyNav() {
    var url = document.documentElement.getAttribute("data-shadow-url") || real;
    if (window.parent !== window) {
      window.parent.postMessage({ type: "shadow:navigate", url: url }, parentOrigin);
    }
  }

  function cssEscape(value) {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\\\$&");
  }

  function isNoiseClass(cls) {
    if (!cls || cls.indexOf("shadow-teach") === 0) return true;
    if (cls === "ng-star-inserted" || cls.indexOf("ng-") === 0) return true;
    if (cls.indexOf("css-") === 0 || /^[a-z]{1,3}[0-9]+$/i.test(cls)) return false;
    return false;
  }

  function stableClasses(el) {
    var out = [];
    if (!el || !el.classList) return out;
    for (var i = 0; i < el.classList.length; i++) {
      var cls = el.classList[i];
      if (!isNoiseClass(cls)) out.push(cls);
    }
    return out;
  }

  function uniqueClassSelector(scope, el) {
    var classes = stableClasses(el);
    var tag = el.tagName ? el.tagName.toLowerCase() : "";
    for (var i = 0; i < classes.length; i++) {
      var sel = "." + cssEscape(classes[i]);
      try {
        var found = scope.querySelectorAll(sel);
        if (found.length === 1 && found[0] === el) return sel;
        if (tag) {
          var tagged = tag + sel;
          var taggedFound = scope.querySelectorAll(tagged);
          if (taggedFound.length === 1 && taggedFound[0] === el) return tagged;
        }
      } catch (e) { /* ignore */ }
    }
    return "";
  }

  function segmentFor(node, amongParent) {
    var tag = node.tagName ? node.tagName.toLowerCase() : "div";
    var classes = stableClasses(node);
    var part = tag;
    var distinctive = "";
    if (amongParent) {
      for (var i = 0; i < classes.length; i++) {
        var shared = 0;
        for (var c = 0; c < amongParent.children.length; c++) {
          var child = amongParent.children[c];
          var childClasses = stableClasses(child);
          var has = false;
          for (var k = 0; k < childClasses.length; k++) if (childClasses[k] === classes[i]) has = true;
          if (has) shared++;
        }
        if (shared === 1) {
          distinctive = classes[i];
          break;
        }
      }
    }
    if (distinctive) return part + "." + cssEscape(distinctive);
    if (classes.length) part += "." + cssEscape(classes[0]);
    if (!amongParent) return part;
    var same = 0;
    var index = 0;
    for (var j = 0; j < amongParent.children.length; j++) {
      if (amongParent.children[j].tagName === node.tagName) {
        same++;
        if (amongParent.children[j] === node) index = same;
      }
    }
    if (same > 1 && !distinctive) part += ":nth-of-type(" + index + ")";
    return part;
  }

  function cssSelector(el) {
    if (!el || el.nodeType !== 1) return "";
    if (el.id) return "#" + cssEscape(el.id);
    var short = uniqueClassSelector(document, el);
    if (short) return short;
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      parts.unshift(segmentFor(node, node.parentElement));
      if (node.id) break;
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  function relativeSelector(row, target) {
    if (!row || !target || !row.contains(target)) return cssSelector(target);
    var short = uniqueClassSelector(row, target);
    if (short) return short;
    var parts = [];
    var node = target;
    while (node && node !== row) {
      parts.unshift(segmentFor(node, node.parentElement && node.parentElement !== row ? node.parentElement : node.parentElement));
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  function generalizeRowSelector(el) {
    var tag = el.tagName ? el.tagName.toLowerCase() : "div";
    var classes = stableClasses(el);
    for (var c = 0; c < classes.length; c++) {
      var candidate = tag + "." + cssEscape(classes[c]);
      try {
        if (document.querySelectorAll(candidate).length > 1) return candidate;
      } catch (e) {}
    }
    try {
      if (document.querySelectorAll(tag).length > 1) return tag;
    } catch (e) {}
    var parent = el.parentElement;
    if (!parent) return cssSelector(el);
    var sig = tag;
    if (classes.length) sig += "." + cssEscape(classes[0]);
    var parentSel = cssSelector(parent);
    if (parentSel) return parentSel + " > " + sig;
    return cssSelector(el);
  }

  function publicUrl(raw) {
    var href = raw;
    try { href = new URL(raw, document.baseURI).href; } catch (e) { return raw; }
    try {
      var parsed = new URL(href);
      if (parsed.pathname === "/api/browse" || parsed.pathname.slice(-11) === "/api/browse") {
        var nested = parsed.searchParams.get("u");
        if (nested && /^https?:/i.test(nested)) return nested;
      }
    } catch (e2) { /* keep */ }
    return href;
  }

  function textOf(el) {
    if (!el) return "";
    var own = (el.textContent || "").replace(/\\s+/g, " ").trim();
    var img = el.tagName === "IMG" ? el : (!own && el.querySelector ? el.querySelector("img") : null);
    if (img) {
      var srcset = img.getAttribute("srcset") || "";
      var fromSet = srcset ? (srcset.split(",")[0] || "").trim().split(/\\s+/)[0] : "";
      var raw = img.currentSrc || img.getAttribute("src") || img.getAttribute("data-src") || fromSet || "";
      if (raw) return publicUrl(raw);
    }
    var anchor = el.closest ? el.closest("a[href]") : null;
    if (anchor) {
      var href = anchor.getAttribute("href") || "";
      if (href && href.charAt(0) !== "#" && href.toLowerCase().indexOf("javascript:") !== 0) {
        var nodes = anchor.querySelectorAll("*");
        var leaves = [];
        for (var i = 0; i < nodes.length; i++) {
          var node = nodes[i];
          if (node.children.length === 0 && (node.textContent || "").replace(/\\s+/g, " ").trim()) leaves.push(node);
        }
        var absHref = publicUrl(href);
        var role = el.getAttribute ? el.getAttribute("role") : "";
        if (el.tagName === "BUTTON" || role === "button" || role === "link") return absHref;
        if (el === anchor && leaves.length > 1) return absHref;
        if (el.children.length === 0 && leaves.length > 1 && leaves[leaves.length - 1] === el) return absHref;
      }
    }
    return own.slice(0, 500);
  }

  function describePick(el) {
    var tag = el.tagName ? el.tagName.toLowerCase() : "node";
    var text = textOf(el);
    var inputCount = 0;
    if (el.matches && el.matches("input,textarea,select")) inputCount = 1;
    else inputCount = el.querySelectorAll ? el.querySelectorAll("input,textarea,select").length : 0;
    var matchingRows = 0;
    try { matchingRows = document.querySelectorAll(generalizeRowSelector(el)).length; } catch (e) { matchingRows = 0; }
    var kind = "element";
    if (inputCount === 1 && text.length < 80) kind = "input";
    else if (matchingRows > 1) kind = "repeating";
    else if (text.length > 140 || inputCount > 1) kind = "container";
    return { tag: tag, kind: kind, textLength: text.length, inputCount: inputCount, matchingRows: matchingRows };
  }

  function postPicked(el, relativeSelector) {
    window.parent.postMessage({
      type: "shadow:teach:picked",
      selector: cssSelector(el),
      relativeSelector: relativeSelector || "",
      text: textOf(el),
      meta: describePick(el)
    }, parentOrigin);
  }

  var highlightNodes = [];
  function clearHighlight() {
    for (var i = 0; i < highlightNodes.length; i++) highlightNodes[i].classList.remove("shadow-teach-active");
    highlightNodes = [];
  }

  function applyHighlight(payload) {
    clearHighlight();
    if (!payload || !payload.fields || !payload.fields.length) return;
    var rowSel = payload.row_selector;
    if (rowSel) {
      var rows = document.querySelectorAll(rowSel);
      for (var r = 0; r < rows.length && r < 8; r++) rows[r].classList.add("shadow-teach-active");
      highlightNodes = highlightNodes.concat([].slice.call(rows, 0, 8));
      if (rows[0]) {
        for (var f = 0; f < payload.fields.length; f++) {
          var inner = rows[0].querySelector(payload.fields[f].selector);
          if (inner) { inner.classList.add("shadow-teach-hover"); highlightNodes.push(inner); }
        }
      }
      return;
    }
    for (var j = 0; j < payload.fields.length; j++) {
      var node = document.querySelector(payload.fields[j].selector);
      if (node) { node.classList.add("shadow-teach-active"); highlightNodes.push(node); }
    }
  }

  function sampleList(spec) {
    var rows = document.querySelectorAll(spec.row_selector);
    if (!rows.length) return { error: "No rows matched row_selector" };
    var out = [];
    for (var i = 0; i < rows.length && out.length < 50; i++) {
      var row = rows[i];
      var item = {};
      for (var f = 0; f < spec.fields.length; f++) {
        var field = spec.fields[f];
        var el = row.querySelector(field.selector);
        item[field.key] = el ? textOf(el) : "";
      }
      if (Object.keys(item).some(function (k) { return item[k]; })) out.push(item);
    }
    if (!out.length) return { error: "Rows matched but fields were empty" };
    return { results: out };
  }

  function sampleComposite(spec) {
    var out = {};
    for (var bi = 0; bi < spec.blocks.length; bi++) {
      var block = spec.blocks[bi];
      if (block.type === "scalar") {
        var sel = block.selector.replace(/\.shadow-teach-hover\b/g, "").replace(/\.shadow-teach-active\b/g, "").trim();
        var el = document.querySelector(sel);
        out[block.key] = el ? textOf(el) : "";
      } else if (block.type === "fields") {
        for (var fi = 0; fi < block.fields.length; fi++) {
          var fld = block.fields[fi];
          var fsel = fld.selector.replace(/\.shadow-teach-hover\b/g, "").replace(/\.shadow-teach-active\b/g, "").trim();
          var fel = document.querySelector(fsel);
          out[fld.key] = fel ? textOf(fel) : "";
        }
      } else if (block.type === "list") {
        var rowSel = block.row_selector.replace(/\.shadow-teach-hover\b/g, "").replace(/\.shadow-teach-active\b/g, "").trim();
        var rows = document.querySelectorAll(rowSel);
        var items = [];
        for (var ri = 0; ri < rows.length && items.length < 50; ri++) {
          var row = rows[ri];
          var item = {};
          for (var lf = 0; lf < block.fields.length; lf++) {
            var lfld = block.fields[lf];
            var lsel = lfld.selector.replace(/\.shadow-teach-hover\b/g, "").replace(/\.shadow-teach-active\b/g, "").trim();
            var lel = row.querySelector(lsel);
            item[lfld.key] = lel ? textOf(lel) : "";
          }
          if (Object.keys(item).some(function (k) { return item[k]; })) items.push(item);
        }
        out[block.key] = items;
      }
    }
    return out;
  }

  function sampleSingle(spec) {
    var el = document.querySelector(spec.selector);
    if (!el) return { error: "Element not found" };
    return { value: textOf(el) };
  }

  var hoverEl = null;
  function clearHover() {
    if (hoverEl) hoverEl.classList.remove("shadow-teach-hover");
    hoverEl = null;
  }

  function postRecorded(action, el, value) {
    if (!el) return;
    window.parent.postMessage({
      type: "shadow:teach:recorded",
      action: action,
      selector: cssSelector(el),
      value: value == null ? "" : String(value),
      text: textOf(el).slice(0, 120)
    }, parentOrigin);
  }

  document.addEventListener("change", function (event) {
    if (pickMode !== "record") return;
    var el = event.target;
    if (!el || !el.matches) return;
    if (!el.matches("input, textarea, select")) return;
    if (el.type === "hidden" || el.type === "submit" || el.type === "button") return;
    postRecorded("fill", el, el.value);
  }, true);

  document.addEventListener("mouseover", function (event) {
    if (pickMode !== "pickField" && pickMode !== "pickRow") return;
    var t = event.target;
    if (!t || !t.closest) return;
    if (pickMode === "pickField" && rowSelectorForPick) {
      var row = t.closest(rowSelectorForPick);
      if (!row) return;
    }
    var el = t.nodeType === 1 ? t : t.parentElement;
    if (!el) return;
    clearHover();
    hoverEl = el;
    el.classList.add("shadow-teach-hover");
  }, true);

  document.addEventListener("mouseout", function () {
    if (pickMode !== "pickField" && pickMode !== "pickRow") return;
    clearHover();
  }, true);

  document.addEventListener("click", function (event) {
    if (pickMode === "record") {
      var rec = event.target && event.target.closest ? event.target.closest("button, a, input[type=submit], input[type=button], [role=button]") : null;
      if (rec) postRecorded("click", rec, "");
      return;
    }
    if (pickMode === "off") return;
    var t = event.target;
    if (!t || !t.closest) return;
    event.preventDefault();
    event.stopPropagation();
    var el = t.nodeType === 1 ? t : t.parentElement;
    if (!el) return;
    if (pickMode === "pickField" && rowSelectorForPick) {
      var row = el.closest(rowSelectorForPick);
      if (!row) return;
      window.parent.postMessage({
        type: "shadow:teach:picked",
        selector: cssSelector(el),
        relativeSelector: relativeSelector(row, el),
        text: textOf(el),
        meta: describePick(el)
      }, parentOrigin);
      return;
    }
    if (pickMode === "pickField") {
      postPicked(el, "");
      return;
    }
    if (pickMode === "pickRow") {
      window.parent.postMessage({
        type: "shadow:teach:picked",
        selector: generalizeRowSelector(el),
        relativeSelector: "",
        text: textOf(el),
        meta: describePick(el)
      }, parentOrigin);
      return;
    }
  }, true);

  window.addEventListener("message", function (event) {
    if (parentOrigin !== "*" && event.origin !== parentOrigin) return;
    var data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "shadow:portal:origin") {
      parentOrigin = data.origin || parentOrigin;
      notifyNav();
      return;
    }
    if (data.type === "shadow:teach:mode") {
      pickMode = data.mode || "off";
      rowSelectorForPick = data.rowSelector || "";
      clearHover();
      return;
    }
    if (data.type === "shadow:teach:sample") {
      var spec = data.spec;
      var requestId = data.requestId;
      try {
        if (!spec) {
          window.parent.postMessage({ type: "shadow:teach:sampleResult", requestId: requestId, results: null, error: "Missing spec" }, parentOrigin);
          return;
        }
        if (spec.kind === "marked_list") {
          var list = sampleList(spec);
          if (list.error) {
            window.parent.postMessage({ type: "shadow:teach:sampleResult", requestId: requestId, results: null, error: list.error }, parentOrigin);
          } else {
            window.parent.postMessage({ type: "shadow:teach:sampleResult", requestId: requestId, results: list.results }, parentOrigin);
          }
        } else if (spec.kind === "marked_single") {
          var single = sampleSingle(spec);
          if (single.error) {
            window.parent.postMessage({ type: "shadow:teach:sampleSingle", requestId: requestId, value: null, error: single.error }, parentOrigin);
          } else {
            window.parent.postMessage({ type: "shadow:teach:sampleSingle", requestId: requestId, value: single.value }, parentOrigin);
          }
        } else if (spec.kind === "marked_page") {
          var obj = {};
          for (var pf = 0; pf < spec.fields.length; pf++) {
            var pfld = spec.fields[pf];
            var pel = document.querySelector(pfld.selector);
            obj[pfld.key] = pel ? textOf(pel) : "";
          }
          window.parent.postMessage({ type: "shadow:teach:sampleObject", requestId: requestId, object: obj }, parentOrigin);
        } else if (spec.kind === "composite") {
          var compositeObj = sampleComposite(spec);
          window.parent.postMessage({ type: "shadow:teach:sampleObject", requestId: requestId, object: compositeObj }, parentOrigin);
        }
      } catch (err) {
        window.parent.postMessage({ type: "shadow:teach:sampleResult", requestId: requestId, results: null, error: String(err) }, parentOrigin);
      }
      return;
    }
    if (data.type === "shadow:teach:highlight") {
      applyHighlight(data);
      return;
    }
    if (data.type === "shadow:teach:rowCount") {
      var rcReq = data.requestId;
      var rowSel = data.row_selector;
      try {
        if (!rowSel) {
          window.parent.postMessage({ type: "shadow:teach:rowCount", requestId: rcReq, count: 0, error: "Missing row_selector" }, parentOrigin);
          return;
        }
        var n = document.querySelectorAll(rowSel).length;
        window.parent.postMessage({ type: "shadow:teach:rowCount", requestId: rcReq, count: n }, parentOrigin);
      } catch (err2) {
        window.parent.postMessage({ type: "shadow:teach:rowCount", requestId: rcReq, count: 0, error: String(err2) }, parentOrigin);
      }
    }
  });

  notifyNav();
})();`;
}
