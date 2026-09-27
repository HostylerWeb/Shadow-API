import type { NavigationPattern } from "@shadowapi/graph-runner";
import type { GraphDocument } from "@shadowapi/graph-runner";
import type { Page } from "playwright-core";

/** Caller checkbox values are the strings "true" and "false". Empty and "0" stay unchecked. */
export function checkboxChecked(value: string): boolean {
  return value === "true" || value === "1" || value === "on";
}

function taughtValue(inputs: Record<string, string>, field: string, sample?: string): string {
  const given = inputs[field];
  if (given !== undefined && given !== "") return given;
  return sample ?? "";
}

type CheckboxHandle = {
  evaluate: (fn: (el: Element, arg?: boolean) => unknown, arg?: boolean) => Promise<unknown>;
  setChecked: (checked: boolean, options: { timeout: number }) => Promise<void>;
};

/** Visually hidden inputs (Tailwind sr-only) cannot be clicked; a card on top steals the pointer. */
async function setTaughtCheckbox(locator: CheckboxHandle, checked: boolean, timeout: number): Promise<void> {
  const hidden = await locator
    .evaluate((el) => {
      const cls = typeof el.className === "string" ? el.className : "";
      if (/(?:^|\s)sr-only(?:\s|$)/.test(cls)) return true;
      if (typeof el.getBoundingClientRect !== "function") return false;
      const box = el.getBoundingClientRect();
      return box.width <= 2 || box.height <= 2;
    })
    .catch(() => false);
  if (!hidden) {
    try {
      await locator.setChecked(checked, { timeout });
      return;
    } catch {
      /* covered or off-screen: fall through to a DOM toggle */
    }
  }
  await locator.evaluate((el, want) => {
    if (!(el instanceof HTMLInputElement)) return;
    const on = want === true;
    if (el.checked === on) return;
    const label = el.closest("label");
    if (label) label.click();
    if (el.checked !== on) {
      el.checked = on;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, checked);
}

function sanitizeSelector(selector: string): string {
  return selector
    .replace(/\.shadow-teach-hover\b/g, "")
    .replace(/\.shadow-teach-active\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cookie walls often cover the control the graph is about to click. Best-effort only. */
export async function dismissCommonConsent(page: Page, trace: string[]): Promise<void> {
  const labels = [/accept all/i, /i accept/i, /agree/i, /allow all/i, /got it/i];
  for (const name of labels) {
    const button = page.getByRole("button", { name }).first();
    const visible = await button.isVisible({ timeout: 400 }).catch(() => false);
    if (!visible) continue;
    await button.click({ timeout: 3_000 }).catch(() => undefined);
    trace.push(`consent: dismissed ${name}`);
    return;
  }
}

export async function runTeachGraph(options: {
  page: Page;
  graph: GraphDocument;
  inputs: Record<string, string>;
  pattern: NavigationPattern;
  resolveUrl: (template: string) => string;
  trace: string[];
  timeoutMs: number;
}): Promise<{ ok: true; finalUrl: string } | { ok: false; message: string }> {
  const { page, graph, inputs, trace, timeoutMs } = options;
  page.setDefaultTimeout(timeoutMs);

  for (const step of graph.steps) {
    if (step.type === "navigate") {
      const url = options.resolveUrl(step.url);
      trace.push(`navigate: ${url}`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await dismissCommonConsent(page, trace);
      continue;
    }
    if (step.type === "fill") {
      await dismissCommonConsent(page, trace);
      const value = taughtValue(inputs, step.field, step.sample);
      const sel = sanitizeSelector(step.selector);
      trace.push(`fill: ${step.field} → ${sel}`);
      await page.locator(sel).first().fill(value, { timeout: Math.min(timeoutMs, 10_000) });
      continue;
    }
    if (step.type === "select") {
      await dismissCommonConsent(page, trace);
      const value = taughtValue(inputs, step.field, step.sample);
      const sel = sanitizeSelector(step.selector);
      trace.push(`select: ${step.field} → ${sel}`);
      const locator = page.locator(sel).first();
      const timeout = Math.min(timeoutMs, 10_000);
      const tag = await locator.evaluate((el) => el.tagName).catch(() => "");
      if (tag === "SELECT") {
        const hidden = await locator
          .evaluate((el) => {
            if (typeof el.getAttribute === "function" && el.getAttribute("hidden") !== null) return true;
            const cls = typeof el.className === "string" ? el.className : "";
            if (/\b(choices__input|select2-hidden-accessible|ts-hidden-accessible)\b/.test(cls)) return true;
            if (typeof el.getBoundingClientRect !== "function") return false;
            const box = el.getBoundingClientRect();
            return box.width <= 2 || box.height <= 2;
          })
          .catch(() => false);
        if (hidden) {
          const picked = await page.evaluate(
            ({ selector, wanted }) => {
              const select = document.querySelector(selector);
              if (!(select instanceof HTMLSelectElement)) return false;
              const want = wanted.trim().toLowerCase();
              const combo = select.closest(".choices, [role=combobox], .select2, .ts-wrapper");
              const opener = combo?.querySelector(".choices__inner, .select2-selection, .ts-control");
              if (opener instanceof HTMLElement) opener.click();
              const pool = combo
                ? [...combo.querySelectorAll("[role=option], .choices__item--choice")]
                : [...document.querySelectorAll("[role=option]")];
              const match = pool.find((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase().includes(want));
              if (match instanceof HTMLElement) {
                match.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
                match.click();
              }
              const native = [...select.options].find((option) => {
                return option.value.trim().toLowerCase() === want || option.text.trim().toLowerCase() === want;
              });
              if (native) {
                select.value = native.value;
                select.dispatchEvent(new Event("input", { bubbles: true }));
                select.dispatchEvent(new Event("change", { bubbles: true }));
              }
              return Boolean(match) || select.value.trim().toLowerCase() === want;
            },
            { selector: sel, wanted: value },
          );
          if (!picked) throw new Error(`Could not choose "${value}" from the menu`);
        } else {
          await locator.selectOption(value, { timeout }).catch(async () => {
            await locator.selectOption({ label: value }, { timeout });
          });
        }
      } else {
        await locator.click({ timeout });
        const option = page.getByRole("option", { name: value, exact: false }).first();
        const menuItem = page.getByRole("menuitem", { name: value, exact: false }).first();
        if (await option.isVisible({ timeout: 1500 }).catch(() => false)) await option.click({ timeout });
        else await menuItem.click({ timeout });
      }
      continue;
    }
    if (step.type === "check") {
      await dismissCommonConsent(page, trace);
      const value = taughtValue(inputs, step.field, step.sample);
      const sel = sanitizeSelector(step.selector);
      trace.push(`check: ${step.field} → ${sel} = ${value}`);
      await setTaughtCheckbox(page.locator(sel).first(), checkboxChecked(value), Math.min(timeoutMs, 10_000));
      continue;
    }
    if (step.type === "click") {
      await dismissCommonConsent(page, trace);
      const sel = step.selector ? sanitizeSelector(step.selector) : undefined;
      if (sel) {
        trace.push(`click: ${sel}`);
        await page.locator(sel).first().click({ timeout: Math.min(timeoutMs, 10_000) });
      }
      continue;
    }
    if (step.type === "wait") {
      if (step.selector) {
        const sel = sanitizeSelector(step.selector);
        const timeout = step.timeout_ms ?? 15_000;
        trace.push(`wait selector: ${sel}`);
        const loc = page.locator(sel).first();
        await loc.waitFor({ state: "visible", timeout }).catch((err) => trace.push(`wait: ${err instanceof Error ? err.message : String(err)}`));
        const started = Date.now();
        let previous = "";
        let stable = 0;
        while (Date.now() - started < timeout && stable < 2) {
          const text = (await loc.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
          if (text && text === previous) stable += 1;
          else stable = 0;
          previous = text;
          await page.waitForTimeout(300);
        }
      } else if (step.loadState) {
        trace.push(`wait load: ${step.loadState}`);
        await page.waitForLoadState(step.loadState, { timeout: step.timeout_ms ?? 15_000 }).catch(() => undefined);
      }
      continue;
    }
    if (step.type === "branch") {
      trace.push(`branch: ${step.patterns.join(",")}`);
      continue;
    }
    if (step.type === "extract") {
      trace.push(`extract step reached url=${page.url()}`);
      return { ok: true, finalUrl: page.url() };
    }
  }
  return { ok: false, message: "Graph ended without extract step." };
}
