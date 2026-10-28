import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAgentFeed,
  agentFeedToLevels,
  parseTradingViewSnapshot,
} from "./parse-snapshot.js";

test("parseAgentFeed reads XAUAGENT session lines", () => {
  const text = `
    XAUUSD 5m OANDA
    O 4040 H 4055 L 4038 C 4043
    XAUAGENT DayHi 4055.12
    XAUAGENT DayLo 4038.50
    XAUAGENT AsiaHi 4049.00
    XAUAGENT SweepBear 1
  `;
  const feed = parseAgentFeed(text);
  assert.equal(feed.ok, true);
  assert.equal(feed.dayHi, 4055.12);
  assert.equal(feed.dayLo, 4038.5);
  assert.equal(feed.asiaHi, 4049);
  assert.equal(feed.sweepBear, true);
});

test("agentFeedToLevels maps hi/lo to S/R lists", () => {
  const { supports, resistances } = agentFeedToLevels({
    dayHi: 4060,
    dayLo: 4030,
    asiaHi: 4050,
    asiaLo: 4035,
    lonHi: null,
    lonLo: 4040,
    nyHi: 4055,
    nyLo: null,
  });
  assert.deepEqual(resistances.sort(), [4050, 4055, 4060]);
  assert.deepEqual(supports.sort(), [4030, 4035, 4040]);
});

test("parseTradingViewSnapshot attaches agentFeed on 5m", () => {
  const parsed = parseTradingViewSnapshot(
    "XAUUSD 5m O 1 H 2 L 0.5 C 1.5 XAUAGENT DayHi 4000.25",
  );
  assert.equal(parsed.tf, "5m");
  assert.equal(parsed.agentFeed?.dayHi, 4000.25);
});

test("parseAgentFeed parses TV status-line tail after 4 EMAs", () => {
  const line =
    "VWAP RSI ADX EMA Session hlc3 0 2 Standard Deviation 1 2 3 14 close 70 30 SMA 14 2 5 5 60 5 14 14 14 RMA 20 50 100 200 Tokyo 0900-1500 Asia/Tokyo London 0830-1630 Europe/London New York 0930-1600 America/New_York 4,048.636 4,057.720 4,039.552 ∅ ∅ ∅ ∅ 38.594 70.000 30.000 41.320 ∅ ∅ ∅ ∅ 29.057 20.000 3.565 4,044.275 4,046.263 4,046.868 4,046.040 4,070.840 4,028.190 4,070.840 4,030.175 4,060.170 4,036.925 4,052.775 4,036.925 0.000 0.000";
  const feed = parseAgentFeed(line);
  assert.equal(feed.ok, true);
  assert.equal(feed.source, "pine_legend");
  assert.equal(feed.dayHi, 4070.84);
  assert.equal(feed.dayLo, 4028.19);
  assert.equal(feed.asiaHi, 4070.84);
  assert.equal(feed.asiaLo, 4030.175);
  assert.equal(feed.lonHi, 4060.17);
  assert.equal(feed.lonLo, 4036.925);
  assert.equal(feed.nyHi, 4052.775);
  assert.equal(feed.nyLo, 4036.925);
});
