# Teach authoring principles

Customer endpoints are taught in the portal embedded browser. Authors define **what callers receive**; the platform provides **how** to reach a page state and read the DOM.

## Rules for product and code

1. **Author-named keys only** — JSON property names and API input names come from the author, not from ShadowAPI defaults tied to an industry.
2. **Structural primitives only** — navigation steps, selectors, scalars, field groups, repeating groups, composites. No code paths keyed on business concepts.
3. **Preview must match live jobs** — iframe sampling and Camoufox extraction use the same extract spec and workflow execution.
4. **Examples in tests** may use real URLs; **runtime and UI** must not depend on those domains.

## Primitives

### Navigation

| Primitive | Meaning |
|-----------|---------|
| Entry URL | Where the worker opens first |
| Interaction page | Where inputs are filled (optional) |
| Output page | Where extraction runs (may equal entry for read-only) |
| Pattern P1 / P2 / P3 | Same document, query change, or path change after submit ([PROJECT.md](./PROJECT.md#631-post-submit-navigation-patterns-tracking-and-similar-flows)) |
| Steps | `navigate`, `fill`, `click`, `wait`, `branch`, `extract` |

### Extract

| Block | JSON shape |
|-------|------------|
| Scalar | `{ "key": "string" }` from one selector |
| Field group | flat object; each key is author-defined |
| Repeating group | `{ "arrayKey": [ { ... }, ... ] }` from row selector + column selectors |
| Composite | any number of blocks merged into one response object |

Array keys default to `items` if the author leaves them blank; they are never required to be a fixed platform name.

### Session

`requires_session: true` on a manifest means the worker loads the tenant vault `storageState` before navigation. Integrators still only pass documented job inputs, never cookies.

## Unsupported until a primitive exists

Documented as mechanism gaps, not vertical exclusions:

- Human-only gates (CAPTCHA with no bypass path)
- Binary downloads without an artifact capture step
- Unbounded pagination / infinite scroll without a pagination step
- Data available only via XHR with no DOM representation (until network capture exists)

## Related docs

- [TEACH-BROWSE-PROXY.md](./TEACH-BROWSE-PROXY.md) — iframe proxy and SPA routing
- [OVERVIEW.md](./OVERVIEW.md) — customer-facing product model
