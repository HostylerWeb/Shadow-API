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
    if (cls === "is-open" || cls === "is-focused" || cls === "is-active" || cls === "is-highlighted") return true;
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

  function parentEl(node) {
    if (!node) return null;
    if (node.parentElement) return node.parentElement;
    var root = node.getRootNode ? node.getRootNode() : null;
    if (root && root.host) return root.host;
    return null;
  }

  function cssSelector(el) {
    if (!el || el.nodeType !== 1) return "";
    var inDocument = !el.getRootNode || el.getRootNode() === document;
    if (el.id && inDocument) return "#" + cssEscape(el.id);
    var short = inDocument ? uniqueClassSelector(document, el) : "";
    if (short) return short;
    var parts = [];
    var pierce = false;
    var node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      var parent = parentEl(node);
      if (parent && node.parentElement !== parent) pierce = true;
      parts.unshift(segmentFor(node, node.parentElement));
      if (node.id && (!node.getRootNode || node.getRootNode() === document)) break;
      node = parent;
    }
    return pierce ? parts.join(" ") : parts.join(" > ");
  }

  function allElements(root) {
    var out = [];
    var list = root.querySelectorAll ? root.querySelectorAll("*") : [];
    for (var i = 0; i < list.length; i++) {
      out.push(list[i]);
      if (list[i].shadowRoot) {
        var inner = allElements(list[i].shadowRoot);
        for (var j = 0; j < inner.length; j++) out.push(inner[j]);
      }
    }
    return out;
  }

  function queryDeepAll(selector, root) {
    root = root || document;
    try {
      var direct = root.querySelectorAll(selector);
      if (direct && direct.length) return direct;
    } catch (e) { /* ignore */ }
    var last = String(selector || "").trim().split(/\\s+/).pop();
    var matched = [];
    var all = allElements(root);
    for (var n = 0; n < all.length; n++) {
      try {
        if (all[n].matches(selector) || (last && last !== selector && all[n].matches(last))) matched.push(all[n]);
      } catch (e2) { /* ignore */ }
    }
    return matched;
  }

  function queryDeep(selector, root) {
    var all = queryDeepAll(selector, root);
    return all.length ? all[0] : null;
  }

  function deepTarget(event) {
    var path = event.composedPath ? event.composedPath() : [];
    for (var i = 0; i < path.length; i++) {
      var node = path[i];
      if (node && node.nodeType === 1 && node !== document.documentElement) return node;
    }
    var t = event.target;
    if (!t) return null;
    return t.nodeType === 1 ? t : t.parentElement;
  }

  function fieldElement(row, selector) {
    if (!selector || selector === ":scope") return row;
    return queryDeep(selector, row) || queryDeep(selector, document);
  }

  function relativeSelector(row, target) {
    if (row && target && row === target) return ":scope";
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

  function directChildSelector(el) {
    var tag = el.tagName ? el.tagName.toLowerCase() : "div";
    var parent = el.parentElement;
    if (!parent) return tag;
    var classes = stableClasses(el);
    for (var c = 0; c < classes.length; c++) {
      var sel = tag + "." + cssEscape(classes[c]);
      try {
        if (parent.querySelectorAll(":scope > " + sel).length > 1) return sel;
      } catch (e) { /* ignore */ }
    }
    return tag;
  }

  function rowCandidate(node) {
    var parent = node.parentElement;
    if (!parent || parent === document.documentElement) return null;
    var childSel = directChildSelector(node);
    if (parent === document.body && (childSel === "div" || childSel === "span" || childSel === "p")) return null;
    var count = 0;
    try { count = parent.querySelectorAll(":scope > " + childSel).length; } catch (e) { count = 0; }
    if (count < 2) return null;
    var parentSel = cssSelector(parent);
    if (!parentSel) return null;
    return { selector: parentSel + " > " + childSel, count: count, tag: (node.tagName || "").toLowerCase() };
  }

  /** Prefer the biggest repeating group that still fits a confirmable list. */
  function generalizeRowSelector(el) {
    var candidates = [];
    var node = el;
    for (var depth = 0; depth < 8 && node && node.parentElement; depth++) {
      var found = rowCandidate(node);
      if (found) candidates.push(found);
      node = node.parentElement;
    }
    if (!candidates.length) return cssSelector(el);
    candidates.sort(function (a, b) { return b.count - a.count; });
    var best = candidates[0];
    if (best.tag === "td" || best.tag === "th") {
      for (var i = 0; i < candidates.length; i++) {
        var row = candidates[i];
        if (row.tag === "tr" && row.count > 1) return row.selector;
      }
    }
    return best.selector;
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
    try { matchingRows = queryDeepAll(generalizeRowSelector(el)).length; } catch (e) { matchingRows = 0; }
    var kind = "element";
    if (inputCount === 1 && text.length < 80) kind = "input";
    else if (matchingRows > 1) kind = "repeating";
    else if (text.length > 140 || inputCount > 1) kind = "container";
    return { tag: tag, kind: kind, textLength: text.length, inputCount: inputCount, matchingRows: matchingRows, control: controlOf(el) };
  }

  function controlOf(el) {
    var tag = el.tagName ? String(el.tagName).toLowerCase() : "";
    if (tag === "select") return "select";
    if (tag === "textarea") return "text";
    if (tag === "button" || (el.getAttribute && el.getAttribute("role") === "button")) return "click";
    if (tag === "input") {
      var type = String(el.type || "text").toLowerCase();
      if (type === "checkbox" || type === "radio") return "checkbox";
      if (type === "button" || type === "submit") return "click";
      return "text";
    }
    if (tag === "a") return "click";
    return "element";
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
      var rows = queryDeepAll(rowSel);
      for (var r = 0; r < rows.length && r < 8; r++) rows[r].classList.add("shadow-teach-active");
      highlightNodes = highlightNodes.concat([].slice.call(rows, 0, 8));
      if (rows[0]) {
        for (var f = 0; f < payload.fields.length; f++) {
          var inner = fieldElement(rows[0], payload.fields[f].selector);
          if (inner) { inner.classList.add("shadow-teach-hover"); highlightNodes.push(inner); }
        }
      }
      return;
    }
    for (var j = 0; j < payload.fields.length; j++) {
      var node = queryDeep(payload.fields[j].selector);
      if (node) { node.classList.add("shadow-teach-active"); highlightNodes.push(node); }
    }
  }

  function sampleList(spec) {
    var rows = queryDeepAll(spec.row_selector);
    if (!rows.length) return { error: "No rows matched row_selector" };
    var out = [];
    for (var i = 0; i < rows.length && out.length < 50; i++) {
      var row = rows[i];
      var item = {};
      for (var f = 0; f < spec.fields.length; f++) {
        var field = spec.fields[f];
        var el = fieldElement(row, field.selector);
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
        var el = queryDeep(sel);
        out[block.key] = el ? textOf(el) : "";
      } else if (block.type === "fields") {
        for (var fi = 0; fi < block.fields.length; fi++) {
          var fld = block.fields[fi];
          var fsel = fld.selector.replace(/\.shadow-teach-hover\b/g, "").replace(/\.shadow-teach-active\b/g, "").trim();
          var fel = queryDeep(fsel);
          out[fld.key] = fel ? textOf(fel) : "";
        }
      } else if (block.type === "list") {
        var rowSel = block.row_selector.replace(/\.shadow-teach-hover\b/g, "").replace(/\.shadow-teach-active\b/g, "").trim();
        var rows = queryDeepAll(rowSel);
        var items = [];
        for (var ri = 0; ri < rows.length && items.length < 50; ri++) {
          var row = rows[ri];
          var item = {};
          for (var lf = 0; lf < block.fields.length; lf++) {
            var lfld = block.fields[lf];
            var lsel = lfld.selector.replace(/\.shadow-teach-hover\b/g, "").replace(/\.shadow-teach-active\b/g, "").trim();
            var lel = fieldElement(row, lsel);
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
    var el = queryDeep(spec.selector);
    if (!el) return { error: "Element not found" };
    return { value: textOf(el) };
  }

  var hoverEl = null;
  function clearHover() {
    if (hoverEl) hoverEl.classList.remove("shadow-teach-hover");
    hoverEl = null;
  }

  function keyHint(el) {
    if (!el || !el.getAttribute) return "";
    var aria = el.getAttribute("aria-label") || el.getAttribute("name") || el.getAttribute("placeholder") || "";
    if (aria) return aria;
    if (el.id) {
      try {
        var lab = document.querySelector('label[for="' + String(el.id).replace(/"/g, "") + '"]');
        if (lab && lab.textContent) return lab.textContent;
      } catch (e) { /* ignore */ }
    }
    var wrap = el.closest ? el.closest("label") : null;
    return wrap && wrap.textContent ? wrap.textContent : "";
  }

  function postRecorded(action, el, value, controlOverride) {
    if (!el) return;
    window.parent.postMessage({
      type: "shadow:teach:recorded",
      action: action,
      selector: cssSelector(el),
      value: value == null ? "" : String(value),
      text: textOf(el).slice(0, 120),
      control: controlOverride || (action === "click" ? "click" : controlOf(el)),
      keyHint: keyHint(el).replace(/\\s+/g, " ").trim().slice(0, 80)
    }, parentOrigin);
  }

  function applyReplayStep(step) {
    var el = queryDeep(step.selector);
    if (!el) throw new Error("Missing " + step.selector);
    if (step.kind === "click") {
      el.click();
      return;
    }
    if (step.kind === "checkbox") {
      el.checked = step.value === "true" || step.value === "1" || step.value === "on";
    } else if (step.kind === "select") {
      var wanted = step.value == null ? "" : String(step.value);
      if (el.tagName !== "SELECT") {
        el.click();
        var choices = document.querySelectorAll("[role=option], [role=menuitem]");
        for (var c = 0; c < choices.length; c++) {
          var label = (choices[c].textContent || "").replace(/\\s+/g, " ").trim();
          if (label && (label === wanted || label.indexOf(wanted) !== -1)) {
            choices[c].click();
            return;
          }
        }
      }
      var matched = false;
      var options = el.options || [];
      for (var i = 0; i < options.length; i++) {
        if (options[i].value === wanted || options[i].text === wanted) {
          el.selectedIndex = i;
          matched = true;
          break;
        }
      }
      if (!matched) el.value = wanted;
    } else {
      el.value = step.value == null ? "" : String(step.value);
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  document.addEventListener("change", function (event) {
    if (pickMode !== "record") return;
    var el = deepTarget(event);
    if (!el || !el.matches) return;
    if (!el.matches("input, textarea, select")) return;
    if (el.type === "hidden" || el.type === "submit" || el.type === "button") return;
    if (el.matches("select") && (el.hasAttribute("hidden") || String(el.className || "").indexOf("choices__input") !== -1 || String(el.className || "").indexOf("select2-hidden") !== -1)) return;
    if (el.type === "checkbox") {
      postRecorded("fill", el, el.checked ? "true" : "false");
      return;
    }
    postRecorded("fill", el, el.value);
  }, true);

  document.addEventListener("click", function (event) {
    if (pickMode !== "record") return;
    var hit = deepTarget(event);
    var box = hit && hit.closest ? hit.closest("[role=checkbox]") : null;
    if (!box || (box.matches && box.matches("input"))) return;
    setTimeout(function () {
      var on = box.getAttribute("aria-checked") === "true" || box.getAttribute("aria-pressed") === "true";
      postRecorded("fill", box, on ? "true" : "false");
    }, 0);
  }, false);

  document.addEventListener("mouseover", function (event) {
    if (pickMode !== "pickField" && pickMode !== "pickRow") return;
    var t = deepTarget(event);
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
      var clicked = deepTarget(event);
      var option = clicked && clicked.closest ? clicked.closest("[role=option], [role=menuitem]") : null;
      if (option) {
        var opener = document.querySelector("[role=combobox][aria-expanded=true], [aria-expanded=true][aria-controls]");
        var native = opener && opener.querySelector ? opener.querySelector("select") : null;
        postRecorded("fill", native || opener || option, (option.textContent || "").replace(/\\s+/g, " ").trim(), "select");
        return;
      }
      var rec = clicked && clicked.closest ? clicked.closest("button, a, input[type=submit], input[type=button], [role=button]") : null;
      if (rec) postRecorded("click", rec, "");
      return;
    }
    if (pickMode === "off") return;
    var t = deepTarget(event);
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
            var pel = queryDeep(pfld.selector);
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
    if (data.type === "shadow:teach:replay") {
      var replayId = data.requestId;
      try {
        var steps = data.steps || [];
        for (var si = 0; si < steps.length; si++) applyReplayStep(steps[si]);
        window.parent.postMessage({ type: "shadow:teach:replayResult", requestId: replayId, ok: true }, parentOrigin);
      } catch (replayErr) {
        window.parent.postMessage({
          type: "shadow:teach:replayResult",
          requestId: replayId,
          ok: false,
          error: replayErr && replayErr.message ? replayErr.message : String(replayErr)
        }, parentOrigin);
      }
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
        var n = queryDeepAll(rowSel).length;
        window.parent.postMessage({ type: "shadow:teach:rowCount", requestId: rcReq, count: n }, parentOrigin);
      } catch (err2) {
        window.parent.postMessage({ type: "shadow:teach:rowCount", requestId: rcReq, count: 0, error: String(err2) }, parentOrigin);
      }
    }
  });

  notifyNav();
})();`;
}
