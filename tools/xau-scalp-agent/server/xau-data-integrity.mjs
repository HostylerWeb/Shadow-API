/** Quote vs OHLC and cross-TF checks (same poll — not M15 close vs M5 close). */

function numEnv(name, fallback) {
  const v = process.env[name];
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function mid(tf) {
  if (!tf) return null;
  if (tf.bid != null && tf.ask != null) return (tf.bid + tf.ask) / 2;
  return tf.c ?? null;
}

function ohlcValid(tf, label) {
  if (!tf) return `${label} missing`;
  const { o, h, l, c } = tf;
  if (o == null || h == null || l == null || c == null) return `${label} incomplete OHLC`;
  if (h < l || h < Math.max(o, c) - 0.01 || l > Math.min(o, c) + 0.01) {
    return `${label} invalid OHLC ordering`;
  }
  return null;
}

function isHeikinAshiSeries(tf) {
  if (!tf || tf.o == null || tf.h == null || tf.l == null || tf.c == null) return false;
  const midVal = mid(tf);
  if (midVal == null) return false;
  const ohlcMax = numEnv("XAU_QUOTE_OHLC_MAX_USD", 3);
  if (Math.abs(midVal - tf.c) <= ohlcMax) return false;
  /** Standard candle: mid is outside C, so legend is frozen. Heikin Ashi: mid is inside [L, H] and C is near (O+H+L+mid)/4. */
  const inRange = midVal >= tf.l - 0.5 && midVal <= tf.h + 0.5;
  const haApprox = (tf.o + tf.h + tf.l + midVal) / 4;
  return inRange && Math.abs(tf.c - haApprox) <= 1.5;
}

/**
 * @param {object} opts
 * @param {object|null} opts.m5
 * @param {object|null} opts.m15
 * @param {object|null} [opts.prevM5]
 * @param {object|null} [opts.newM5]
 * @param {boolean} [opts.isNew5mBar]
 * @param {object|null} [opts.prevM15]
 * @param {object|null} [opts.newM15]
 * @param {boolean} [opts.isNew15mBar]
 */
export function assessDataIntegrity({
  m5,
  m15,
  prevM5 = null,
  newM5 = null,
  isNew5mBar = false,
  prevM15 = null,
  newM15 = null,
  isNew15mBar = false,
}) {
  const ohlcMax = numEnv("XAU_QUOTE_OHLC_MAX_USD", 3);
  const crossTfMax = numEnv("XAU_M15_M5_MID_MAX_USD", 8);
  const rollGapMax = numEnv("XAU_BAR_ROLL_CLOSE_OPEN_MAX_USD", 2.5);
  const rollGap15Max = numEnv("XAU_BAR15_ROLL_CLOSE_OPEN_MAX_USD", 4);

  const issues = [];
  const o5 = ohlcValid(m5, "M5");
  const o15 = ohlcValid(m15, "M15");
  if (o5) issues.push(o5);
  if (o15) issues.push(o15);

  const m5Mid = mid(m5);
  const m15Mid = mid(m15);
  const m5Ha = isHeikinAshiSeries(m5);
  const m15Ha = isHeikinAshiSeries(m15);

  if (m5?.c != null && m5Mid != null) {
    if (m5Ha) {
      if (m5Mid < (m5.l ?? -Infinity) - ohlcMax || m5Mid > (m5.h ?? Infinity) + ohlcMax) {
        issues.push(`M5 mid $${m5Mid.toFixed(2)} outside HA range [${m5.l}, ${m5.h}]`);
      }
    } else if (Math.abs(m5Mid - m5.c) > ohlcMax) {
      issues.push(`M5 mid vs legend C delta $${Math.abs(m5Mid - m5.c).toFixed(2)}`);
    }
  }
  if (m15?.c != null && m15Mid != null) {
    if (m15Ha) {
      if (m15Mid < (m15.l ?? -Infinity) - ohlcMax || m15Mid > (m15.h ?? Infinity) + ohlcMax) {
        issues.push(`M15 mid $${m15Mid.toFixed(2)} outside HA range [${m15.l}, ${m15.h}]`);
      }
    } else if (Math.abs(m15Mid - m15.c) > ohlcMax) {
      issues.push(`M15 mid vs legend C delta $${Math.abs(m15Mid - m15.c).toFixed(2)}`);
    }
  }
  if (m5Mid != null && m15Mid != null && Math.abs(m5Mid - m15Mid) > crossTfMax) {
    issues.push(`M5 vs M15 mid delta $${Math.abs(m5Mid - m15Mid).toFixed(2)}`);
  }

  let m5ArchiveOk = true;
  let m5ArchiveNote = null;
  if (isNew5mBar && prevM5 && newM5) {
    const p5 = ohlcValid(prevM5, "prev M5");
    if (p5) {
      m5ArchiveOk = false;
      m5ArchiveNote = p5;
    } else if (prevM5.barKey && newM5.barKey && prevM5.barKey === newM5.barKey) {
      m5ArchiveOk = false;
      m5ArchiveNote = "barKey unchanged at 5m roll";
    } else if (
      !isHeikinAshiSeries(prevM5) &&
      !isHeikinAshiSeries(newM5) &&
      prevM5.c != null &&
      newM5.o != null &&
      Math.abs(prevM5.c - newM5.o) > rollGapMax
    ) {
      m5ArchiveOk = false;
      m5ArchiveNote = `prev close vs new open $${Math.abs(prevM5.c - newM5.o).toFixed(2)}`;
    }
  }

  let m15ArchiveOk = true;
  let m15ArchiveNote = null;
  if (isNew15mBar && prevM15 && newM15) {
    const p15 = ohlcValid(prevM15, "prev M15");
    if (p15) {
      m15ArchiveOk = false;
      m15ArchiveNote = p15;
    } else if (prevM15.barKey && newM15.barKey && prevM15.barKey === newM15.barKey) {
      m15ArchiveOk = false;
      m15ArchiveNote = "barKey unchanged at 15m roll";
    } else if (
      !isHeikinAshiSeries(prevM15) &&
      !isHeikinAshiSeries(newM15) &&
      prevM15.c != null &&
      newM15.o != null &&
      Math.abs(prevM15.c - newM15.o) > rollGap15Max
    ) {
      m15ArchiveOk = false;
      m15ArchiveNote = `prev 15m close vs new open $${Math.abs(prevM15.c - newM15.o).toFixed(2)}`;
    }
  }

  const ok = issues.length === 0 && m5ArchiveOk && m15ArchiveOk;

  return {
    ok,
    m5Mid,
    m15Mid,
    m5ArchiveOk,
    m5ArchiveNote,
    m15ArchiveOk,
    m15ArchiveNote,
    issues,
    limits: { ohlcMax, crossTfMax, rollGapMax, rollGap15Max },
  };
}
