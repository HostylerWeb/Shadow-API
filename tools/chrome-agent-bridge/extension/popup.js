async function refresh() {
  const manifest = chrome.runtime.getManifest();
  document.getElementById("version").textContent = `v${manifest.version} · ${chrome.runtime.getManifest().name}`;
  const { bridgeConnected, bridgeUrl, lastBridgeError, lastBridgeErrorAt } = await chrome.storage.local.get([
    "bridgeConnected",
    "bridgeUrl",
    "lastBridgeError",
    "lastBridgeErrorAt",
  ]);
  const errEl = document.getElementById("err");
  if (lastBridgeError && lastBridgeErrorAt && Date.now() - lastBridgeErrorAt < 120000) {
    errEl.textContent = lastBridgeError;
  } else {
    errEl.textContent = "";
  }
  const dot = document.getElementById("dot");
  const status = document.getElementById("status");
  let health = "?";
  try {
    const r = await fetch("http://127.0.0.1:17320/health", { cache: "no-store" });
    const j = await r.json();
    health = j.ok ? "bridge up" : "bridge bad";
  } catch {
    health = "bridge down (start: systemctl --user start chrome-agent-bridge)";
  }
  if (bridgeConnected) {
    dot.className = "dot on";
    status.textContent = `Connected · ${health}`;
  } else {
    dot.className = "dot off";
    status.textContent = `Not connected · ${health}${bridgeUrl ? ` · tried ${bridgeUrl}` : ""}`;
  }
}

refresh();
setInterval(refresh, 2000);
