/** Parse TradingView legend text from chrome bridge snapshot. */

function num(s) {
  if (s == null) return null;
  return Number(String(s).replace(/,/g, ""));
}

/** Machine-readable session / sweep lines from 5m Pine (XAUAGENT * plots). */
export function parseAgentFeed(text) {
  const src = text || "";
  const pick = (name) => {
    const m = src.match(new RegExp(`XAUAGENT\\s+${name}\\s+([\\d,]+\\.?\\d*)`, "i"));
    return m ? num(m[1]) : null;
  };
  const compact = src.match(
    /XAUAGENT DayHi ([\d,]+\.?\d*) DayLo ([\d,]+\.?\d*) AsiaHi ([\d,]+\.?\d*) AsiaLo ([\d,]+\.?\d*) LonHi ([\d,]+\.?\d*) LonLo ([\d,]+\.?\d*) NYHi ([\d,]+\.?\d*) NYLo ([\d,]+\.?\d*) SweepBear ([\d.]+) SweepBull ([\d.]+)/i,
  );
  if (compact) {
    return {
      dayHi: num(compact[1]),
      dayLo: num(compact[2]),
      asiaHi: num(compact[3]),
      asiaLo: num(compact[4]),
      lonHi: num(compact[5]),
      lonLo: num(compact[6]),
      nyHi: num(compact[7]),
      nyLo: num(compact[8]),
      sweepBear: num(compact[9]) >= 0.5,
      sweepBull: num(compact[10]) >= 0.5,
      ok: true,
      source: "pine_label",
    };
  }

  /** TV status line prints plot values in order after the 4 EMAs (no plot titles). */
  const optVal = (s) => (s == null || s === "∅" ? null : num(s));
  const legendTail = src.match(
    /VWAP RSI ADX EMA(?: Session)?[\s\S]*?America\/New_York\s+[\d,]+\.?\d*\s+[\d,]+\.?\d*\s+[\d,]+\.?\d*\s+∅\s+∅\s+∅\s+∅\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+∅\s+∅\s+∅\s+∅\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d,]+\.?\d*\s+[\d,]+\.?\d*\s+[\d,]+\.?\d*\s+[\d,]+\.?\d*\s+([\d,]+\.?\d*|∅)\s+([\d,]+\.?\d*|∅)\s+([\d,]+\.?\d*|∅)\s+([\d,]+\.?\d*|∅)\s+([\d,]+\.?\d*|∅)\s+([\d,]+\.?\d*|∅)\s+([\d,]+\.?\d*|∅)\s+([\d,]+\.?\d*|∅)\s+([\d.]+|∅)\s+([\d.]+|∅)/,
  );
  if (legendTail) {
    const sb = optVal(legendTail[9]);
    const sl = optVal(legendTail[10]);
    return {
      dayHi: optVal(legendTail[1]),
      dayLo: optVal(legendTail[2]),
      asiaHi: optVal(legendTail[3]),
      asiaLo: optVal(legendTail[4]),
      lonHi: optVal(legendTail[5]),
      lonLo: optVal(legendTail[6]),
      nyHi: optVal(legendTail[7]),
      nyLo: optVal(legendTail[8]),
      sweepBear: sb != null && sb >= 0.5,
      sweepBull: sl != null && sl >= 0.5,
      ok: optVal(legendTail[1]) != null || optVal(legendTail[2]) != null,
      source: "pine_legend",
    };
  }
  const sweepBear = pick("SweepBear");
  const sweepBull = pick("SweepBull");
  return {
    dayHi: pick("DayHi"),
    dayLo: pick("DayLo"),
    asiaHi: pick("AsiaHi"),
    asiaLo: pick("AsiaLo"),
    lonHi: pick("LonHi"),
    lonLo: pick("LonLo"),
    nyHi: pick("NYHi"),
    nyLo: pick("NYLo"),
    sweepBear: sweepBear != null && sweepBear >= 0.5,
    sweepBull: sweepBull != null && sweepBull >= 0.5,
    ok: /XAUAGENT\s+DayHi/i.test(src),
  };
}

/** @returns {{ supports: number[], resistances: number[] }} */
export function agentFeedToLevels(feed) {
  if (!feed) return { supports: [], resistances: [] };
  const resistances = [feed.dayHi, feed.asiaHi, feed.lonHi, feed.nyHi].filter(Number.isFinite);
  const supports = [feed.dayLo, feed.asiaLo, feed.lonLo, feed.nyLo].filter(Number.isFinite);
  return {
    supports: [...new Set(supports)],
    resistances: [...new Set(resistances)],
  };
}

export function detectTimeframe(text) {
  const s = text || "";
  if (
    /XAUUSD\s+15m/i.test(s) ||
    /Gold Spot\s*\/\s*U\.S\.\s*Dollar\s+15\b/i.test(s) ||
    /\b15\s+(?:OANDA|ICE|FX_IDC|FOREXCOM|PEPPERSTONE|CAPITALCOM|ICMARKETS|EIGHTCAP|FXCM|SAXOBANK|TICKMILL|VANTAGE|THINKMARKETS)\b/i.test(s) ||
    /\b15\s+minutes\b/i.test(s)
  ) {
    return "15m";
  }
  if (
    /XAUUSD\s+5m/i.test(s) ||
    /Gold Spot\s*\/\s*U\.S\.\s*Dollar\s+5\b/i.test(s) ||
    /\b5\s+(?:OANDA|ICE|FX_IDC|FOREXCOM|PEPPERSTONE|CAPITALCOM|ICMARKETS|EIGHTCAP|FXCM|SAXOBANK|TICKMILL|VANTAGE|THINKMARKETS)\b/i.test(s) ||
    /\b5\s+minutes\b/i.test(s)
  ) {
    return "5m";
  }
  if (
    /XAUUSD\s+1m/i.test(s) ||
    /Gold Spot\s*\/\s*U\.S\.\s*Dollar\s+1\b/i.test(s) ||
    /\b1\s+(?:OANDA|ICE|FX_IDC|FOREXCOM|PEPPERSTONE|CAPITALCOM|ICMARKETS|EIGHTCAP|FXCM|SAXOBANK|TICKMILL|VANTAGE|THINKMARKETS)\b/i.test(s) ||
    /\b1\s+minute\b/i.test(s)
  ) {
    return "1m";
  }
  return null;
}

export function parseTradingViewSnapshot(text) {
  const tf = detectTimeframe(text || "");
  const ohlc = (text || "").match(
    /O\s+([\d,]+\.?\d*)\s+H\s+([\d,]+\.?\d*)\s+L\s+([\d,]+\.?\d*)\s+C\s+([\d,]+\.?\d*)/,
  );
  const quotes = (text || "").match(
    /([\d,]+\.?\d*)\s+SELL\s+([\d.]+)\s+([\d,]+\.?\d*)\s+BUY/,
  );
  const adxAtr =
    (text || "").match(/ADX\+ATR[\s\S]*?America\/New_York\s+([\d.]+)\s+([\d.]+)/) ||
    (text || "").match(/ADX\+ATR\s+\d+\s+\d+\s+\d+\s+RMA\s+([\d.]+)\s+([\d.]+)/);
  const standaloneAdx = (text || "").match(/\bADX\s+14[\s\S]{0,60}?\s([\d.]+)\b/);
  const volTicks = (text || "").match(/Vol · Ticks\s+([\d.]+\s?[Kk]?)/);
  const emaBundle = (text || "").match(
    /EMA 20\/50\/100\/200\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/,
  );
  const vwapRsiAdxEma = (text || "").match(
    /VWAP RSI ADX EMA(?: Session)?[\s\S]*?America\/New_York\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+∅\s+∅\s+∅\s+∅\s+([\d.]+)\s+[\d.]+\s+[\d.]+\s+([\d.]+)\s+∅\s+∅\s+∅\s+∅\s+([\d.]+)\s+[\d.]+\s+([\d.]+)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/,
  );
  const vwapRsiAtrEma = (text || "").match(
    /([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+∅\s+∅\s+∅\s+∅\s+([\d.]+)\s+([\d.]+)\s+∅\s+∅\s+∅\s+∅\s+([\d.]+)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/,
  );

  let rsi = null;
  let rsiPrev = null;
  let adx5m = null;
  let atr = null;
  let vwap = null;
  let ema20 = null;
  let ema50 = null;

  if (vwapRsiAdxEma && tf === "5m") {
    vwap = num(vwapRsiAdxEma[1]);
    rsi = num(vwapRsiAdxEma[4]);
    rsiPrev = num(vwapRsiAdxEma[5]);
    adx5m = num(vwapRsiAdxEma[6]);
    atr = num(vwapRsiAdxEma[7]);
    ema20 = num(vwapRsiAdxEma[8]);
    ema50 = num(vwapRsiAdxEma[9]);
  } else if (vwapRsiAdxEma && tf === "15m") {
    vwap = num(vwapRsiAdxEma[1]);
    rsi = num(vwapRsiAdxEma[4]);
    rsiPrev = num(vwapRsiAdxEma[5]);
    adx5m = num(vwapRsiAdxEma[6]);
    atr = num(vwapRsiAdxEma[7]);
    ema20 = num(vwapRsiAdxEma[8]);
    ema50 = num(vwapRsiAdxEma[9]);
  } else if (vwapRsiAtrEma && tf === "5m") {
    vwap = num(vwapRsiAtrEma[1]);
    rsi = num(vwapRsiAtrEma[4]);
    rsiPrev = num(vwapRsiAtrEma[5]);
    atr = num(vwapRsiAtrEma[6]);
    ema20 = num(vwapRsiAtrEma[7]);
    ema50 = num(vwapRsiAtrEma[8]);
  }

  if (emaBundle) {
    ema20 = num(emaBundle[1]);
    ema50 = num(emaBundle[2]);
  }

  const close = ohlc ? num(ohlc[4]) : null;
  const barKey = ohlc
    ? `${tf}:${ohlc[1]}|${ohlc[2]}|${ohlc[3]}|${ohlc[4]}`
    : `${tf}:unknown`;

  const agentFeed = tf === "5m" ? parseAgentFeed(text || "") : null;

  return {
    tf,
    barKey,
    o: ohlc ? num(ohlc[1]) : null,
    h: ohlc ? num(ohlc[2]) : null,
    l: ohlc ? num(ohlc[3]) : null,
    c: close,
    bid: quotes ? num(quotes[1]) : null,
    ask: quotes ? num(quotes[3]) : null,
    spread: quotes ? num(quotes[2]) : null,
    adx: adx5m ?? (adxAtr ? num(adxAtr[1]) : standaloneAdx ? num(standaloneAdx[1]) : null),
    atr: adxAtr && tf !== "5m" ? num(adxAtr[2]) : atr ?? (adxAtr ? num(adxAtr[2]) : null),
    volTicks: volTicks ? String(volTicks[1]).replace(/\s+/g, "") : null,
    rsi,
    rsiPrev,
    vwap,
    ema20,
    ema50,
    agentFeed,
    rawLen: (text || "").length,
  };
}