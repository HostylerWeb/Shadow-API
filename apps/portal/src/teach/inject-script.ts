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

  function cssSelector(el) {
    if (!el || el.nodeType !== 1) return "";
    if (el.id) return "#" + cssEscape(el.id);
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      var part = node.tagName.toLowerCase();
      if (node.classList && node.classList.length) {
        var classes = [];
        for (var i = 0; i < node.classList.length && classes.length < 3; i++) {
          var cls = node.classList[i];
          if (cls && cls.indexOf("shadow-teach") !== 0) classes.push("." + cssEscape(cls));
        }
        if (classes.length) part += classes.join("");
      }
      var parent = node.parentElement;
      if (parent) {
        var same = 0;
        var index = 0;
        for (var j = 0; j < parent.children.length; j++) {
          var child = parent.children[j];
          if (child.tagName === node.tagName) {
            same++;
            if (child === node) index = same;
          }
        }
        if (same > 1) part += ":nth-of-type(" + index + ")";
      }
      parts.unshift(part);
      if (node.id) break;
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  function relativeSelector(row, target) {
    if (!row || !target || !row.contains(target)) return cssSelector(target);
    var parts = [];
    var node = target;
    while (node && node !== row) {
      var part = node.tagName.toLowerCase();
      if (node.classList && node.classList.length) {
        for (var c = 0; c < node.classList.length; c++) {
          var cls = node.classList[c];
          if (cls && cls.indexOf("shadow-teach") !== 0) {
            part += "." + cssEscape(cls);
            break;
          }
        }
      }
      var parent = node.parentElement;
      if (parent && parent !== row) {
        var same = 0;
        var index = 0;
        for (var i = 0; i < parent.children.length; i++) {
          if (parent.children[i].tagName === node.tagName) {
            same++;
            if (parent.children[i] === node) index = same;
          }
        }
        if (same > 1) part += ":nth-of-type(" + index + ")";
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  function generalizeRowSelector(el) {
    var sel = cssSelector(el);
    var parent = el.parentElement;
    if (!parent) return sel;
    var tag = el.tagName.toLowerCase();
    var sig = tag;
    if (el.classList && el.classList.length) sig += "." + cssEscape(el.classList[0]);
    var parentSel = cssSelector(parent);
    if (parentSel) return parentSel + " > " + sig;
    return sel;
  }

  function textOf(el) {
    return (el && (el.textContent || "")).replace(/\\s+/g, " ").trim().slice(0, 200);
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

  document.addEventListener("mouseover", function (event) {
    if (pickMode === "off") return;
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
    if (pickMode === "off") return;
    clearHover();
  }, true);

  document.addEventListener("click", function (event) {
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
