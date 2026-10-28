# Phone alerts (ntfy)

Push **important** XAU scalp events to your phone via **[ntfy](https://docs.ntfy.sh/)**. Routine “wait / no setup” polls do **not** notify — only the events below.

**Two channels (do not confuse them):**

| Channel | What it is | Depends on PC IP? |
|--------|------------|-------------------|
| **ntfy (this doc)** | WATCH / stand-down / ENTER / bridge error → Android (or any ntfy client) | **Phone → server URL** must be reachable; **loop → server** can always use `127.0.0.1` |
| **Cursor `AGENT_LOOP_TICK_xau`** | Shell output → Cursor automation → chat briefs | **No** — local IDE monitoring only; see [CURSOR-AUTOMATION.md](./CURSOR-AUTOMATION.md) |

Related: [XAU-AGENT-LOOP.md](./XAU-AGENT-LOOP.md) (full runbook), [run-agent-loop.sh](./run-agent-loop.sh), [localLLM.md](./localLLM.md) (same ntfy transport with a local LLM instead of Cursor).

---

## What gets pushed

| Title | When | Priority |
|--------|------|----------|
| **XAU: Get ready** | New setup alert (`newWatchIssued`) | high |
| **XAU: Alert cancelled** | Prior alert revoked (`watchRevoked.notify`) | high |
| **XAU: Possible entry — review** | Agent logs `decision: "ENTER"` | urgent |
| **XAU: Charts not connected** | Tick failed (`context.ok === false`) | high |

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
       → POST <XAU_NTFY_SERVER>/<secret-topic>   (recommended: http://127.0.0.1:2586)

xau-log-evaluation.mjs (on ENTER only)
  → pushEnterEvaluation → same ntfy topic
```

**PC:** `ntfy serve` listens on **`:2586`** (systemd `ntfy.service` on the same machine as the loop).  
**Phone:** ntfy app — **custom default server** (URL the phone can reach) + **subscription** to the secret topic.

**Sender vs subscriber (important when DHCP changes):**

- **Loop (publisher)** only needs to reach ntfy on the **same box**. Set `XAU_NTFY_SERVER=http://127.0.0.1:2586` so a LAN IP change never breaks pushes.
- **Phone (subscriber)** needs a **stable URL** (Tailscale hostname, `ntfy.sh`, VPS, tunnel, or LAN IP you reconfigure). First-run auto-config in `xau-ntfy-config.mjs` may write your **current LAN IP** into `ntfy-config.json`; override with env or edit the file.

Config (auto-created on first push):

- `~/.local/state/xau-scalp-agent/ntfy-config.json` — `server`, `topic` (topic **is** the password)
- Override: `XAU_NTFY_SERVER`, `XAU_NTFY_TOPIC`, `XAU_NTFY_CONFIG`
- Disable: `XAU_NTFY=0`

Default in `run-agent-loop.sh`: `XAU_NTFY=1`.

**Code:** `server/xau-ntfy.mjs`, `server/xau-ntfy-config.mjs`, `server/xau-ntfy-push.mjs`.

---

## Reachable from any network / when the PC IP changes

If the trading PC’s **Wi‑Fi or LAN IP changes often**, do **not** tie the **loop** to that IP. Tie only the **phone’s default server** (and `ntfy serve --base-url` for deep links) to something stable.

### Recommended baseline (same machine)

```bash
# In run-agent-loop.sh, systemd unit, or shell profile before starting the loop:
export XAU_NTFY_SERVER=http://127.0.0.1:2586
# Keep XAU_NTFY_TOPIC in env or ntfy-config.json — long random topic; treat as password.
```

Edit `~/.local/state/xau-scalp-agent/ntfy-config.json` so `"server": "http://127.0.0.1:2586"` if you are not using env overrides.

### Options for the phone (pick one)

| Option | Phone default server example | Off home Wi‑Fi? | Tradeoffs |
|--------|------------------------------|-----------------|-----------|
| **A. Tailscale / WireGuard** | `http://your-pc.tailnet-name.ts.net:2586` | Yes | Best for self-hosted ntfy on the trading box. Set systemd `--base-url` to the same hostname. |
| **B. Public [ntfy.sh](https://ntfy.sh)** | `https://ntfy.sh` + subscribe to secret topic | Yes | Set `XAU_NTFY_SERVER=https://ntfy.sh` and `XAU_NTFY_TOPIC=<long-random>`. No home IP; messages relay through ntfy.sh (use an unguessable topic). |
| **C. Your VPS ntfy** | `https://notify.example.com` | Yes | Loop POSTs to VPS (or VPS pulls — not implemented; use HTTP POST from loop). You operate TLS and auth. |
| **D. Cloudflare Tunnel (or reverse proxy)** | `https://ntfy.yourdomain.com` | Yes | Tunnel local `:2586` to HTTPS. Lock down with rate limits; topic secrecy alone is weak if the URL is public. |
| **E. LAN only** | `http://192.168.x.x:2586` | No (same Wi‑Fi) | Router **DHCP reservation** or mDNS (`http://hostname.local:2586`) reduces surprises; still breaks on mobile data. |

**After any config change:** restart `run-agent-loop.sh` (env is read at loop start). Re-run `node server/xau-ntfy-push.mjs --setup` for an updated deep link; use the **stable** URL in the link, not a stale LAN IP.

**Alerts without Cursor:** ntfy works even when Cursor is closed. For automated ENTER/WATCH decisions without chat, see [localLLM.md](./localLLM.md) — same `xau-ntfy-push.mjs` and topic.

---

## One-time setup (Android + PC)

### PC — ntfy server

Already installed via `.deb`; service should listen on HTTP **`:2586`**:

```bash
curl -s http://127.0.0.1:2586/v1/health
# {"healthy":true,...}
```

If the service fails on port 80, use a systemd override (example). Use **`--base-url`** for whatever URL the **phone** will use (LAN IP, Tailscale hostname, or public host — see [Reachable from any network](#reachable-from-any-network--when-the-pc-ip-changes)):

```ini
# /etc/systemd/system/ntfy.service.d/override.conf
[Service]
ExecStart=
ExecStart=/usr/bin/ntfy serve --no-log-dates --listen-http :2586 --base-url http://YOUR_PHONE_REACHABLE_URL:2586
```

Examples: `http://10.151.214.3:2586` (LAN), `http://trading-box.tail1234.ts.net:2586` (Tailscale). The loop can still POST to `http://127.0.0.1:2586`. Then:

```bash
sudo systemctl daemon-reload && sudo systemctl restart ntfy
```

### Phone — ntfy app

1. **Settings → Default server** — enter a **full URL** the phone can reach (lowercase **`http://`** or **`https://`**):  
   e.g. `http://YOUR_LAN_IP:2586`, `http://your-pc.tailnet.ts.net:2586`, or `https://ntfy.sh`  
   (`10.151.214.3:2586` alone is **invalid**; `Http://` breaks OK button.)

2. **Subscribe** to the topic from config (not optional):

   ```bash
   node server/xau-ntfy-push.mjs --setup
   ```

3. **Easiest subscribe** — open in Chrome on the phone (one tap). Host must match default server (use Tailscale hostname or `ntfy.sh`, not a stale LAN IP):

   ```text
   ntfy://YOUR_PHONE_REACHABLE_HOST:2586/<topic-from-config>?secure=false
   ```

   For `ntfy.sh`: default server `https://ntfy.sh`, subscribe to the topic only (no custom port in the link).

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

- **Reachability:** The phone must reach the configured ntfy server; the loop only needs `127.0.0.1:2586` on the trading PC. See [Reachable from any network](#reachable-from-any-network--when-the-pc-ip-changes).
- **Secrets:** Do not commit `ntfy-config.json`; it lives under `~/.local/state/`. Rotate the topic if it leaks.
- **ENTER** pushes only when the **agent** logs ENTER — the loop never sets `enterAllowed: true` in JSON.
- **WATCH ntfy** is suppressed when `dataIntegrity.ok` is false (same gate as actionable watches).
