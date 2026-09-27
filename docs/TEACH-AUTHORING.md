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
| Output page | Where extraction runs. May equal the entry URL |
| In-place page | Form and answers share one URL. The worker fills and clicks, then extracts without navigating again |
| Pattern P1 / P2 / P3 | Same document, query change, or path change after submit ([PROJECT.md](./PROJECT.md#631-post-submit-navigation-patterns-tracking-and-similar-flows)) |
| Steps | `navigate`, `fill`, `select`, `check`, `click`, `wait`, `branch`, `extract` |

### Interaction recipe

Authors record or pick an ordered list. Each step is one control:

| Kind | Job input | Worker |
|------|-----------|--------|
| `text` | string | `fill` |
| `select` | option value, visible label, or custom menu text | `select` (native `<select>`, or open the control and click the matching option) |
| `checkbox` | `"true"` or `"false"`. An omitted value uses what you recorded. Only `"true"`, `"1"`, and `"on"` check the box | `check` |
| `click` | none | `click` (preset buttons and submit) |

Click steps are not API inputs. Older manifests that only stored `submit_selector` still compile as one click after the fills.

Same URL with no fields and no clicks stays read-only (`navigate`, optional `wait`, `extract`). Same URL with a recipe stays interactive and does not open the result URL a second time. After the last click, the worker waits until the result text is visible and stops changing before it extracts.

In the record UI, **I fill a form, and the answers stay on this page** marks that in-place case. Pressing Done keeps that recording. If the site moved to a different address while you were recording, that new address becomes the answers page. **Replay in preview** runs the recipe in the iframe, then the existing extract sample must be non-empty before publish.

Recorded fields take their API name from the control’s label, name, or placeholder when that text is usable. A dropdown that is not a native `<select>` is still an input: the worker opens it and clicks the option whose text matches the caller’s value. Open shadow DOM is included when picking, previewing, and extracting. A repeating row that matches more than 100 elements cannot be confirmed.

### Extract

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
- Auto-detecting every control on a page without the author recording or picking them

## Related docs

- [TEACH-BROWSE-PROXY.md](./TEACH-BROWSE-PROXY.md) — iframe proxy and SPA routing
- [OVERVIEW.md](./OVERVIEW.md) — customer-facing product model
