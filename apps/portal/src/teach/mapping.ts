import type { MarkedExtract, MarkedListExtract, MarkedSingleExtract, TeachField } from "./protocol";

export function toMarkedListExtract(rowSelector: string, fields: TeachField[]): MarkedListExtract {
  return {
    kind: "marked_list",
    row_selector: rowSelector,
    fields: fields.map(({ key, selector }) => ({ key, selector })),
  };
}

export function toMarkedSingleExtract(field: TeachField | undefined): MarkedSingleExtract | null {
  if (!field?.selector) return null;
  return { kind: "marked_single", selector: field.selector };
}

export function buildListExtract(rowSelector: string, fields: TeachField[]): MarkedExtract | null {
  if (!rowSelector.trim() || fields.length === 0) return null;
  return toMarkedListExtract(rowSelector, fields);
}

export function buildSingleExtract(fields: TeachField[]): MarkedExtract | null {
  const first = fields[0];
  if (!first?.selector) return null;
  return toMarkedSingleExtract(first);
}

export function sampleHasValues(rows: Record<string, string>[]): boolean {
  return rows.some((row) => Object.values(row).some((value) => value.trim().length > 0));
}

export function nextFieldKey(existing: TeachField[]): string {
  const used = new Set(existing.map((f) => f.key));
  for (const name of ["name", "number", "address", "title", "value"]) {
    if (!used.has(name)) return name;
  }
  let n = 1;
  while (used.has(`field_${n}`)) n += 1;
  return `field_${n}`;
}

export function buildPageExtract(fields: TeachField[]): MarkedExtract | null {
  if (fields.length === 0 || !fields.some((f) => f.selector)) return null;
  return {
    kind: "marked_page",
    fields: fields.map(({ key, selector }) => ({ key, selector })),
  };
}

export function nextFormInputKey(existing: TeachField[]): string {
  const used = new Set(existing.map((f) => f.key));
  for (const name of ["query", "search", "email", "username", "postcode", "reference"]) {
    if (!used.has(name)) return name;
  }
  return nextFieldKey(existing);
}

export function newTeachField(
  partial: Pick<TeachField, "key" | "selector"> & { sampleText?: string; elementTag?: string },
): TeachField {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `f-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    key: partial.key,
    selector: partial.selector,
    sampleText: partial.sampleText,
    elementTag: partial.elementTag,
  };
}
