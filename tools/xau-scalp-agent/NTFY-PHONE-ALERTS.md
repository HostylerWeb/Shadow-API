# Phone alerts (ntfy)

Push **important** XAU scalp events to your Android phone on the same Wi‑Fi. Routine “wait / no setup” polls do **not** notify — only the events below.

Related: [XAU-AGENT-LOOP.md](./XAU-AGENT-LOOP.md) (full runbook), [run-agent-loop.sh](./run-agent-loop.sh).

---

## What gets pushed

| Title | When | Priority |
|--------|------|----------|
| **XAU - WATCH ONLY (prepare)** | New actionable watch issued (`newWatchIssued` + `chatDraft`) | high |
| **XAU - stand down** | Active watch revoked (`watchRevoked.notify`) | high |
| **XAU - ENTER (review now)** | Agent logs `decision: "ENTER"` via `xau-log-evaluation.mjs` | urgent |
| **XAU - bridge error** | Tick failed (`context.ok === false`) | high |

Dedupe: the same event key is not sent twice (see `~/.local/state/xau-scalp-agent/ntfy-dedupe.json`).

**Anti flip-flop (v1.1):** WATCH / stand-down pairs in one minute were caused by a **~$1.40** S/R band and live mid moving **~$1** in/out. The loop now: (1) **no WATCH ntfy** unless `dataIntegrity.ok` and M5 archive OK; (2) **wider “left zone”** before stand-down (`XAU_ZONE_EXIT_HYST_USD`, default ~45% of zone width); (3) **longer cooldown** if a watch dies within **120s** for zone reasons (`XAU_WATCH_FLOP_COOLDOWN_SEC`, default **600**); (4) **short-at-R** requires closed-bar **rejection** or sweep, not M15 bear alone.

**Not pushed:** every 60s poll, “DO NOT ENTER — wait”, data-integrity blips (unless you add that later), hypothetical “math only” lines from the brief.

---

## Architecture

```text
xau-watch-loop.mjs (each tick)
  → runXauTick → context.json
  → xau-ntfy-push.mjs (if XAU_NTFY ≠ 0)
       → reads context (watch / revoke / bridge)
       → POST http://<LAN-IP>:2586/<secret-topic>

xau-log-evaluation.mjs (on ENTER only)
  → pushEnterEvaluation → same ntfy topic
```

**PC:** ntfy server listens on **`:2586`** (systemd `ntfy.service`).  
**Phone:** ntfy app uses **custom default server** + **subscription** to the secret topic.

Config (auto-created on first push):

- `~/.local/state/xau-scalp-agent/ntfy-config.json` — `server`, `topic` (topic **is** the password)
- Override: `XAU_NTFY_SERVER`, `XAU_NTFY_TOPIC`, `XAU_NTFY_CONFIG`
- Disable: `XAU_NTFY=0`

Default in `run-agent-loop.sh`: `XAU_NTFY=1`.

**Code:** `server/xau-ntfy.mjs`, `server/xau-ntfy-config.mjs`, `server/xau-ntfy-push.mjs`.

---

## One-time setup (Android + PC)

### PC — ntfy server

Already installed via `.deb`; service should listen on LAN:

```bash
curl -s http://127.0.0.1:2586/v1/health
# {"healthy":true,...}
```

If the service fails on port 80, use a systemd override (example):

```ini
# /etc/systemd/system/ntfy.service.d/override.conf
[Service]
ExecStart=
ExecStart=/usr/bin/ntfy serve --no-log-dates --listen-http :2586 --base-url http://YOUR_LAN_IP:2586
```

Replace `YOUR_LAN_IP` with the machine’s Wi‑Fi IP (e.g. `10.151.214.3`). Then:

```bash
sudo systemctl daemon-reload && sudo systemctl restart ntfy
```

### Phone — ntfy app

1. **Settings → Default server** — enter a **full URL**, lowercase **`http://`**:  
   `http://YOUR_LAN_IP:2586`  
   (`10.151.214.3:2586` alone is **invalid**; `Http://` breaks OK button.)

2. **Subscribe** to the topic from config (not optional):

   ```bash
   node server/xau-ntfy-push.mjs --setup
   ```

3. **Easiest subscribe** — open in Chrome on the phone (one tap):

   ```text
   ntfy://YOUR_LAN_IP:2586/<topic-from-config>?secure=false
   ```

4. Allow notifications for the ntfy app.

### Test

From the repo:

```bash
node server/xau-ntfy-push.mjs --test
```

You should see **XAU - test ping** on the phone.

---

## Restart loop after enabling

The running poll loop only loads `XAU_NTFY` at start. After changing ntfy wiring:

```bash
# restart run-agent-loop.sh (re-arm Cursor monitoring on ^AGENT_LOOP_TICK_xau)
```

---

## Limits

- **Same Wi‑Fi:** LAN IP must reach the phone; off-network requires Tailscale, VPN, or public `ntfy.sh` (different config).
- **Secrets:** Do not commit `ntfy-config.json`; it lives under `~/.local/state/`.
- **ENTER** pushes only when the **agent** logs ENTER — the loop never sets `enterAllowed: true` in JSON.
