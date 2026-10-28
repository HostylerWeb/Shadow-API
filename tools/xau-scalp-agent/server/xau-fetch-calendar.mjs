#!/usr/bin/env node
/** One-shot Finance Calendar fetch → news-calendar.json */
import { refreshForexCalendar } from "./xau-forex-calendar.mjs";

try {
  const summary = await refreshForexCalendar();
  console.log(JSON.stringify(summary, null, 2));
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
}
